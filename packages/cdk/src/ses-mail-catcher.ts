import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ArnFormat, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

const packageLibDirectory = dirname(fileURLToPath(import.meta.url));

/** The way the mail catcher handles an incoming mail event. */
export enum MailMode {
  /** Store the message in DynamoDB and S3 without sending it. */
  CATCH = 'CATCH',
  /** Forward the message to Amazon SES. */
  RELAY = 'RELAY',
}

/** Existing resources that can be used instead of creating new storage. */
export interface MailStorage {
  /** An existing bucket for raw MIME messages. */
  readonly bucket?: s3.IBucket;

  /** An existing table for message metadata. */
  readonly table?: dynamodb.ITable;
}

/** Optional Amazon SES settings used in relay mode. */
export interface RelayOptions {
  /** The SES configuration set to use. */
  readonly configurationSetName?: string;

  /** The ARN of the verified SES identity used by the sender. */
  readonly fromEmailAddressIdentityArn?: string;

  /** Where SES should forward feedback notifications. */
  readonly feedbackForwardingEmailAddress?: string;
}

/** Properties for {@link SesMailCatcher}. */
export interface SesMailCatcherProps {
  /** How long captured messages remain available. @default Duration.days(7) */
  readonly retention?: Duration;

  /** Existing or custom storage resources. */
  readonly storage?: MailStorage;

  /** How incoming events are handled. @default MailMode.CATCH */
  readonly mode?: MailMode;

  /** Optional settings for relay mode. */
  readonly relay?: RelayOptions;
}

/**
 * A serverless mail catcher for AWS environments.
 *
 * The construct creates a Lambda function that accepts {@link SendMailEvent}
 * objects. In catch mode the function writes a canonical raw MIME message to
 * S3 and an index record to DynamoDB. In relay mode it sends the same raw MIME
 * message through Amazon SES.
 *
 * @example
 *
 * const catcher = new SesMailCatcher(this, 'MailCatcher');
 * catcher.grantSend(applicationFunction);
 */
export class SesMailCatcher extends Construct {
  /** The Lambda function that receives mail events. */
  public readonly function: lambda.Function;

  /** The raw-message storage bucket. */
  public readonly bucket: s3.IBucket;

  /** The message metadata table. */
  public readonly table: dynamodb.ITable;

  /** The configured mail handling mode. */
  public readonly mode: MailMode;

  public constructor(scope: Construct, id: string, props: SesMailCatcherProps = {}) {
    super(scope, id);

    this.mode = props.mode ?? MailMode.CATCH;
    const retention = props.retention ?? Duration.days(7);
    const retentionSeconds = retention.toSeconds();
    if (!Number.isFinite(retentionSeconds) || retentionSeconds <= 0) {
      throw new Error('retention must be greater than zero');
    }

    // S3 lifecycle expiration is expressed in whole days. Rounding up means
    // a sub-day remainder is never deleted before the requested retention.
    const retentionDays = Math.max(1, Math.ceil(retentionSeconds / Duration.days(1).toSeconds()));

    this.bucket = props.storage?.bucket ?? new s3.Bucket(this, 'MailBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      lifecycleRules: [{ expiration: Duration.days(retentionDays) }],
      removalPolicy: RemovalPolicy.DESTROY,
      // Captured mail is disposable. Without this, a bucket that still holds
      // messages blocks deletion of the whole stack.
      autoDeleteObjects: true,
    });

    this.table = props.storage?.table ?? new dynamodb.Table(this, 'MailTable', {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: 'mailbox', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sortKey', type: dynamodb.AttributeType.STRING },
      removalPolicy: RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'expiresAt',
    });

    const relay = props.relay ?? {};
    this.function = new lambda.Function(this, 'MailHandler', {
      // The handler is compiled from src/mail-handler.ts and included in the
      // published lib/ directory. Keeping the asset path deterministic makes
      // local synthesis and installed-package synthesis behave identically.
      code: lambda.Code.fromAsset(join(packageLibDirectory, '../lib')),
      description: 'Captures or relays mail events for ses-mail-catcher',
      environment: {
        MAIL_MODE: this.mode,
        METADATA_TABLE_NAME: this.table.tableName,
        STORAGE_BUCKET_NAME: this.bucket.bucketName,
        RETENTION_SECONDS: String(retentionSeconds),
        ...(relay.configurationSetName ? { SES_CONFIGURATION_SET_NAME: relay.configurationSetName } : {}),
        ...(relay.fromEmailAddressIdentityArn ? { SES_FROM_EMAIL_ADDRESS_IDENTITY_ARN: relay.fromEmailAddressIdentityArn } : {}),
        ...(relay.feedbackForwardingEmailAddress ? { SES_FEEDBACK_FORWARDING_EMAIL_ADDRESS: relay.feedbackForwardingEmailAddress } : {}),
      },
      handler: 'mail-handler.handler',
      memorySize: 512,
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: Duration.seconds(30),
    });

    if (this.mode === MailMode.CATCH) {
      this.bucket.grantPut(this.function);
      // Attachments can be referenced from the catcher's bucket. Callers using
      // another bucket can grant read access to this function themselves.
      this.bucket.grantRead(this.function);
      this.table.grantWriteData(this.function);
    } else {
      this.function.addToRolePolicy(new iam.PolicyStatement({
        actions: ['ses:SendEmail', 'ses:SendRawEmail'],
        resources: this.relayResources(relay),
      }));
    }
  }

  /**
   * Grants an application permission to invoke the mail handler.
   *
   * @param grantee the Lambda, role, or other IAM principal that sends events
   */
  public grantSend(grantee: iam.IGrantable): void {
    this.function.grantInvoke(grantee);
  }

  /**
   * Resolves the resources that relay mode is allowed to send through.
   *
   * SES authorises a send against the sending identity, and additionally
   * against the configuration set when one is used. The identity ARN is the
   * only value that can narrow the statement, so without it the statement has
   * to stay open.
   */
  private relayResources(relay: RelayOptions): string[] {
    if (!relay.fromEmailAddressIdentityArn) {
      return ['*'];
    }

    const resources = [relay.fromEmailAddressIdentityArn];
    if (relay.configurationSetName) {
      resources.push(Stack.of(this).formatArn({
        service: 'ses',
        resource: 'configuration-set',
        resourceName: relay.configurationSetName,
        arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
      }));
    }
    return resources;
  }
}
