import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';

import { SesMailCatcher } from '@s-yoshiki/cdk-ses-mail-catcher';

export class SesMailCatcherExampleStack extends Stack {
  public constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const mailCatcher = new SesMailCatcher(this, 'MailCatcher', {
      retention: Duration.days(7),
      // The example is intentionally open for development smoke tests.
      viewer: { allowedIpCidrs: ['0.0.0.0/0', '::/0'] },
    });

    // eslint-disable-next-line no-new
    new CfnOutput(this, 'ViewerUrl', {
      description: 'URL of the captured-mail viewer',
      value: mailCatcher.viewerUrl ?? 'viewer-not-configured',
    });
    // eslint-disable-next-line no-new
    new CfnOutput(this, 'SesApiUrl', {
      description: 'Endpoint for an AWS SDK SES client',
      value: mailCatcher.mailApiEndpoint,
    });
  }
}
