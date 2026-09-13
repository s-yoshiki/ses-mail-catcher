import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';

// Resolve assets relative to this module in both the published `lib/` package
// and the source tree used by the construct tests.
const packageDirectory = dirname(fileURLToPath(import.meta.url));
const lambdaAssetDirectory = join(packageDirectory, '..', 'lib');

/** Authorization used by an API Gateway API. */
export enum ApiAuthorization {
  /** The API is callable without AWS credentials. */
  NONE = 'NONE',
  /** Calls must be signed with AWS Signature Version 4. */
  AWS_IAM = 'AWS_IAM',
}

/** Existing resources that can be used instead of creating new storage. */
export interface MailStorage {
  /** An existing bucket for raw MIME messages. */
  readonly bucket?: s3.IBucket;

  /** An existing table for message metadata. */
  readonly table?: dynamodb.ITable;
}

/** Settings for the SES-compatible mail API. */
export interface MailApiOptions {
  /** How callers are authorized. @default ApiAuthorization.NONE */
  readonly authorization?: ApiAuthorization;

  /** IPv4 and IPv6 CIDR ranges allowed to call the mail API. */
  readonly allowedIpCidrs?: string[];

  /** Lambda timeout. @default Duration.seconds(29) */
  readonly timeout?: Duration;
}

/** Settings for the CloudFront-hosted viewer. */
export interface ViewerOptions {
  /**
   * IPv4 and IPv6 CIDR ranges allowed at the CloudFront edge.
   *
   * This is required when the viewer is enabled. The same restriction applies
   * to the viewer web application and its `/api/*` behavior.
   */
  readonly allowedIpCidrs: string[];

  /** Lambda timeout for viewer API requests. @default Duration.seconds(29) */
  readonly timeout?: Duration;
}

/** Properties for {@link SesMailCatcher}. */
export interface SesMailCatcherProps {
  /** How long captured messages remain available. @default Duration.days(7) */
  readonly retention?: Duration;

  /** Existing or custom storage resources. */
  readonly storage?: MailStorage;

  /** Settings for the SES-compatible mail API. */
  readonly mailApi?: MailApiOptions;

  /** If supplied, creates the viewer web application and API. */
  readonly viewer?: ViewerOptions;
}

/**
 * A serverless SES-compatible mail catcher for development and test
 * environments.
 *
 * The construct creates an API Gateway endpoint that accepts SES v1
 * `SendEmail`/`SendRawEmail` requests and SES v2 `SendEmail` requests. It
 * stores canonical raw MIME in S3 and searchable metadata in DynamoDB. An
 * optional CloudFront-hosted viewer uses a separate read-only API.
 */
export class SesMailCatcher extends Construct {
  /** The Lambda function behind the SES-compatible mail API. */
  public readonly mailFunction: lambda.Function;

  /** The SES-compatible mail API. */
  public readonly mailApi: apigateway.RestApi;

  /** The endpoint to use as an AWS SDK SES client endpoint. */
  public readonly mailApiEndpoint: string;

  /** The raw-message storage bucket. */
  public readonly bucket: s3.IBucket;

  /** The message metadata table. */
  public readonly table: dynamodb.ITable;

  /** The read-only viewer API, when a viewer is configured. */
  public readonly viewerApi?: apigateway.RestApi;

  /** The Lambda function behind the viewer API, when configured. */
  public readonly viewerFunction?: lambda.Function;

  /** The S3 bucket containing the viewer web application, when configured. */
  public readonly webBucket?: s3.IBucket;

  /** The CloudFront distribution serving the viewer, when configured. */
  public readonly viewerDistribution?: cloudfront.IDistribution;

  /** The CloudFront URL serving the viewer, when configured. */
  public readonly viewerUrl?: string;

  public constructor(scope: Construct, id: string, props: SesMailCatcherProps = {}) {
    super(scope, id);

    const retention = props.retention ?? Duration.days(7);
    const retentionSeconds = retention.toSeconds();
    if (!Number.isFinite(retentionSeconds) || retentionSeconds <= 0) {
      throw new Error('retention must be greater than zero');
    }

    const retentionDays = Math.max(1, Math.ceil(retentionSeconds / Duration.days(1).toSeconds()));

    this.bucket = props.storage?.bucket ?? new s3.Bucket(this, 'MailBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      lifecycleRules: [{ expiration: Duration.days(retentionDays) }],
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    this.table = props.storage?.table ?? new dynamodb.Table(this, 'MailTable', {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sortKey', type: dynamodb.AttributeType.STRING },
      removalPolicy: RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'expiresAt',
    });

    const mailOptions = props.mailApi ?? {};
    this.mailFunction = new lambda.Function(this, 'MailHandler', {
      code: lambda.Code.fromAsset(join(lambdaAssetDirectory, 'mail-handler')),
      description: 'Accepts SES-compatible requests for ses-mail-catcher',
      environment: {
        METADATA_TABLE_NAME: this.table.tableName,
        STORAGE_BUCKET_NAME: this.bucket.bucketName,
        RETENTION_SECONDS: String(retentionSeconds),
      },
      handler: 'mail-handler.handler',
      memorySize: 512,
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: mailOptions.timeout ?? Duration.seconds(29),
    });
    this.bucket.grantPut(this.mailFunction);
    this.table.grantWriteData(this.mailFunction);

    this.mailApi = this.createMailApi(mailOptions);
    this.mailApiEndpoint = this.mailApi.url;

    if (props.viewer !== undefined) {
      const viewer = this.createViewer(props.viewer);
      this.viewerApi = viewer.api;
      this.viewerFunction = viewer.function;
      this.webBucket = viewer.bucket;
      this.viewerDistribution = viewer.distribution;
      this.viewerUrl = viewer.url;
    }
  }

  /**
   * Grants an AWS principal permission to call the mail API when IAM
   * authorization is enabled.
   *
   * @param grantee the Lambda, role, or other IAM principal that sends mail
   */
  public grantMailApiInvoke(grantee: iam.IGrantable): void {
    grantee.grantPrincipal.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['execute-api:Invoke'],
      resources: [this.mailApi.arnForExecuteApi('*', '/*')],
    }));
  }

  private createMailApi(options: MailApiOptions): apigateway.RestApi {
    const api = new apigateway.RestApi(this, 'MailApi', {
      description: 'SES-compatible mail capture API',
      endpointTypes: [apigateway.EndpointType.REGIONAL],
      policy: createIpPolicy(options.allowedIpCidrs),
      deployOptions: {
        stageName: 'prod',
        loggingLevel: apigateway.MethodLoggingLevel.ERROR,
        metricsEnabled: true,
      },
    });
    const integration = new apigateway.LambdaIntegration(this.mailFunction, { proxy: true });
    const methodOptions = { authorizationType: toAuthorizationType(options.authorization) };

    // SES API v1 uses the Query protocol at the endpoint root.
    api.root.addMethod('POST', integration, methodOptions);

    // SES API v2 uses the JSON protocol at this path.
    api.root
      .addResource('v2')
      .addResource('email')
      .addResource('outbound-emails')
      .addMethod('POST', integration, methodOptions);

    return api;
  }

  private createViewer(options: ViewerOptions): {
    readonly api: apigateway.RestApi;
    readonly function: lambda.Function;
    readonly bucket: s3.Bucket;
    readonly distribution: cloudfront.Distribution;
    readonly url: string;
  } {
    if (options.allowedIpCidrs.length === 0) {
      throw new Error('viewer.allowedIpCidrs must contain at least one CIDR range');
    }

    const viewerFunction = new lambda.Function(this, 'ViewerHandler', {
      code: lambda.Code.fromAsset(join(lambdaAssetDirectory, 'viewer-handler')),
      description: 'Serves the captured-mail viewer API',
      environment: {
        METADATA_TABLE_NAME: this.table.tableName,
        STORAGE_BUCKET_NAME: this.bucket.bucketName,
      },
      handler: 'viewer-handler.handler',
      memorySize: 512,
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: options.timeout ?? Duration.seconds(29),
    });
    this.bucket.grantRead(viewerFunction);
    this.table.grantReadData(viewerFunction);

    const viewerApi = new apigateway.RestApi(this, 'ViewerApi', {
      description: 'Read-only API for the ses-mail-catcher viewer',
      endpointTypes: [apigateway.EndpointType.REGIONAL],
      deployOptions: {
        stageName: 'prod',
        loggingLevel: apigateway.MethodLoggingLevel.ERROR,
        metricsEnabled: true,
      },
    });
    const viewerIntegration = new apigateway.LambdaIntegration(viewerFunction, { proxy: true });
    const apiResource = viewerApi.root.addResource('api');
    apiResource.addMethod('ANY', viewerIntegration);
    apiResource.addResource('{proxy+}').addMethod('ANY', viewerIntegration);

    const webBucket = new s3.Bucket(this, 'ViewerBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    const edgeFunction = new cloudfront.Function(this, 'ViewerAccessFunction', {
      comment: 'Restricts the viewer to the configured IP ranges',
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(createViewerFunctionCode(options.allowedIpCidrs)),
    });
    const edgeAssociation = [{
      eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
      function: edgeFunction,
    }];

    const distribution = new cloudfront.Distribution(this, 'ViewerDistribution', {
      comment: 'CloudFront distribution for the ses-mail-catcher viewer',
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(webBucket),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        functionAssociations: edgeAssociation,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.RestApiOrigin(viewerApi),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          functionAssociations: edgeAssociation,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
      },
    });

    // eslint-disable-next-line no-new
    new s3deploy.BucketDeployment(this, 'ViewerAssets', {
      sources: [s3deploy.Source.asset(join(lambdaAssetDirectory, 'viewer-handler', 'viewer'))],
      destinationBucket: webBucket,
      distribution,
      distributionPaths: ['/*'],
      prune: true,
    });

    return {
      api: viewerApi,
      function: viewerFunction,
      bucket: webBucket,
      distribution,
      url: `https://${distribution.domainName}`,
    };
  }
}

const toAuthorizationType = (authorization: ApiAuthorization | undefined): apigateway.AuthorizationType => {
  return authorization === ApiAuthorization.AWS_IAM
    ? apigateway.AuthorizationType.IAM
    : apigateway.AuthorizationType.NONE;
};

const createIpPolicy = (allowedIpCidrs: readonly string[] | undefined): iam.PolicyDocument | undefined => {
  if (allowedIpCidrs === undefined || allowedIpCidrs.length === 0) {
    return undefined;
  }

  const statement = {
    principals: [new iam.AnyPrincipal()],
    actions: ['execute-api:Invoke'],
    resources: ['execute-api:/*'],
  };
  return new iam.PolicyDocument({
    statements: [
      new iam.PolicyStatement({ effect: iam.Effect.ALLOW, ...statement }),
      new iam.PolicyStatement({
        effect: iam.Effect.DENY,
        conditions: { NotIpAddress: { 'aws:SourceIp': allowedIpCidrs } },
        ...statement,
      }),
    ],
  });
};

const createViewerFunctionCode = (allowedIpCidrs: readonly string[]): string => `
var ALLOWED_CIDRS = ${JSON.stringify(allowedIpCidrs)};

function handler(event) {
  var request = event.request;
  var ip = event.viewer.ip;
  var allowed = false;
  for (var i = 0; i < ALLOWED_CIDRS.length; i += 1) {
    if (contains(ip, ALLOWED_CIDRS[i])) {
      allowed = true;
      break;
    }
  }
  if (!allowed) {
    return {
      statusCode: 403,
      statusDescription: 'Forbidden',
      headers: {
        'content-type': { value: 'text/plain; charset=utf-8' },
        'cache-control': { value: 'no-store' }
      },
      body: { encoding: 'text', data: 'Forbidden' }
    };
  }

  // API requests must keep their original path. Other extensionless paths
  // are SPA routes and are served by index.html from the S3 origin.
  if (request.uri.indexOf('/api/') !== 0 && request.uri !== '/api' &&
      request.uri !== '/' && request.uri.indexOf('.') === -1) {
    request.uri = '/index.html';
  }
  return request;
}

function contains(ip, cidr) {
  var parts = cidr.split('/');
  var address = bytes(ip);
  var base = bytes(parts[0]);
  if (address === null || base === null || address.length !== base.length) return false;
  var prefix = parts.length > 1 ? Number(parts[1]) : address.length * 8;
  if (!isFinite(prefix) || prefix < 0 || prefix > address.length * 8) return false;
  var full = Math.floor(prefix / 8);
  var remainder = prefix % 8;
  for (var i = 0; i < full; i += 1) if (address[i] !== base[i]) return false;
  if (remainder === 0) return true;
  var mask = 256 - Math.pow(2, 8 - remainder);
  return (address[full] & mask) === (base[full] & mask);
}

function bytes(address) {
  return address.indexOf(':') >= 0 ? ipv6Bytes(address) : ipv4Bytes(address);
}

function ipv4Bytes(address) {
  var parts = address.split('.');
  if (parts.length !== 4) return null;
  var result = [];
  for (var i = 0; i < parts.length; i += 1) {
    if (!/^\\d{1,3}$/.test(parts[i])) return null;
    var value = Number(parts[i]);
    if (value > 255) return null;
    result.push(value);
  }
  return result;
}

function ipv6Bytes(address) {
  var sections = address.split('::');
  if (sections.length > 2) return null;
  var left = sections[0] ? sections[0].split(':') : [];
  var right = sections.length === 2 && sections[1] ? sections[1].split(':') : [];
  var leftGroups = groups(left);
  var rightGroups = groups(right);
  if (leftGroups === null || rightGroups === null) return null;
  var missing = 8 - leftGroups.length - rightGroups.length;
  if (sections.length === 1 ? missing !== 0 : missing < 1) return null;
  var all = leftGroups.concat(new Array(Math.max(missing, 0)).fill(0), rightGroups);
  var result = [];
  for (var i = 0; i < all.length; i += 1) {
    result.push((all[i] >> 8) & 255, all[i] & 255);
  }
  return result;
}

function groups(parts) {
  var result = [];
  for (var i = 0; i < parts.length; i += 1) {
    if (parts[i].indexOf('.') >= 0) {
      if (i !== parts.length - 1) return null;
      var mapped = ipv4Bytes(parts[i]);
      if (mapped === null) return null;
      result.push(mapped[0] * 256 + mapped[1], mapped[2] * 256 + mapped[3]);
    } else {
      if (!/^[0-9a-f]{1,4}$/i.test(parts[i])) return null;
      result.push(parseInt(parts[i], 16));
    }
  }
  return result.length > 8 ? null : result;
}
`;
