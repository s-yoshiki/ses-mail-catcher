import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

import { MailMode, SesMailCatcher } from '@s-yoshiki/cdk-ses-mail-catcher';

const edgeBasicAuthFunctionCode = readFileSync(
  join(import.meta.dirname, '../src/edge-basic-auth-function.js'),
  'utf8',
);

export class SesMailCatcherExampleStack extends Stack {
  public constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const viewerCredentials = new secretsmanager.Secret(this, 'ViewerCredentials', {
      description: 'Basic authentication credentials for the ses-mail-catcher example viewer',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'admin' }),
        generateStringKey: 'password',
        passwordLength: 32,
        excludePunctuation: true,
      },
    });

    const mailCatcher = new SesMailCatcher(this, 'MailCatcher', {
      mode: MailMode.CATCH,
      retention: Duration.days(7),
      viewer: {
        // CloudFront signs requests to this IAM-protected origin. Basic Auth
        // is enforced at the CloudFront edge before the request reaches it.
        authType: lambda.FunctionUrlAuthType.AWS_IAM,
      },
    });

    const edgeAuthKeyValueStore = new cloudfront.KeyValueStore(this, 'EdgeAuthKeyValueStore', {
      comment: 'Basic Auth credentials for the CloudFront viewer-request function',
    });

    const edgeBasicAuthFunction = new cloudfront.Function(this, 'EdgeBasicAuthFunction', {
      comment: 'Reject viewer requests without the configured Basic Auth credential',
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      keyValueStore: edgeAuthKeyValueStore,
      code: cloudfront.FunctionCode.fromInline(edgeBasicAuthFunctionCode),
    });

    if (mailCatcher.viewerFunctionUrl === undefined || mailCatcher.viewerFunction === undefined) {
      throw new Error('the CloudFront viewer requires a Lambda Function URL');
    }

    const sesApiFunctionUrl = mailCatcher.function.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.AWS_IAM,
    });

    // The viewer uses query strings for mailbox filtering. The managed
    // CACHING_DISABLED policy does not forward query strings to the origin,
    // so use an equivalent no-cache policy that includes them in the request.
    const viewerCachePolicy = new cloudfront.CachePolicy(this, 'ViewerCachePolicy', {
      comment: 'Disable viewer caching while forwarding API query strings',
      defaultTtl: Duration.seconds(0),
      minTtl: Duration.seconds(0),
      maxTtl: Duration.seconds(0),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
    });

    const viewerDistribution = new cloudfront.Distribution(this, 'ViewerDistribution', {
      comment: 'CloudFront + Edge Basic Auth for the ses-mail-catcher viewer',
      defaultBehavior: {
        origin: origins.FunctionUrlOrigin.withOriginAccessControl(mailCatcher.viewerFunctionUrl),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachePolicy: viewerCachePolicy,
        functionAssociations: [{
          eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          function: edgeBasicAuthFunction,
        }],
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      additionalBehaviors: {
        '/v2/email/outbound-emails': {
          origin: origins.FunctionUrlOrigin.withOriginAccessControl(sesApiFunctionUrl),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
      },
    });

    const cloudFrontPrincipal = new iam.ServicePrincipal('cloudfront.amazonaws.com');

    mailCatcher.viewerFunction.addPermission('ViewerInvokeFromCloudFront', {
      principal: cloudFrontPrincipal,
      sourceArn: viewerDistribution.distributionArn,
      invokedViaFunctionUrl: true,
    });

    mailCatcher.function.addPermission('MailApiInvokeFromCloudFront', {
      principal: cloudFrontPrincipal,
      sourceArn: viewerDistribution.distributionArn,
      invokedViaFunctionUrl: true,
    });

    // CfnOutput registers itself with the construct tree as a side effect.
    // eslint-disable-next-line no-new
    new CfnOutput(this, 'ViewerUrl', {
      description: 'URL of the captured-mail viewer',
      value: `https://${viewerDistribution.distributionDomainName}`,
    });

    // CfnOutput registers itself with the construct tree as a side effect.
    // eslint-disable-next-line no-new
    new CfnOutput(this, 'SesApiUrl', {
      description: 'CloudFront URL for the SES v2-compatible SendEmail API',
      value: `https://${viewerDistribution.distributionDomainName}`,
    });

    // CfnOutput registers itself with the construct tree as a side effect.
    // eslint-disable-next-line no-new
    new CfnOutput(this, 'ViewerCredentialsSecretArn', {
      description: 'Read the viewer username and password from this Secrets Manager secret',
      value: viewerCredentials.secretArn,
    });

    // CfnOutput registers itself with the construct tree as a side effect.
    // eslint-disable-next-line no-new
    new CfnOutput(this, 'EdgeAuthKeyValueStoreArn', {
      description: 'CloudFront KeyValueStore populated by the edge-auth sync command',
      value: edgeAuthKeyValueStore.keyValueStoreArn,
    });

    // CfnOutput registers itself with the construct tree as a side effect.
    // eslint-disable-next-line no-new
    new CfnOutput(this, 'MailHandlerName', {
      description: 'Invoke this Lambda with a SendMailEvent to capture a message',
      value: mailCatcher.function.functionName,
    });
  }
}
