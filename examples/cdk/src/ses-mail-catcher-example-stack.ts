import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';

import { SesMailCatcher } from '@s-yoshiki/cdk-ses-mail-catcher';

export class SesMailCatcherExampleStack extends Stack {
  public constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const viewerAllowedIpCidr = process.env.VIEWER_ALLOWED_IP_CIDR;
    if (viewerAllowedIpCidr === undefined) {
      throw new Error('VIEWER_ALLOWED_IP_CIDR is required; set it to the CIDR of the development machine');
    }

    const mailCatcher = new SesMailCatcher(this, 'MailCatcher', {
      retention: Duration.days(7),
      viewer: { allowedIpCidrs: [viewerAllowedIpCidr] },
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
