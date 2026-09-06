import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

import { MailMode, SesMailCatcher } from '@s-yoshiki/cdk-ses-mail-catcher';

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
        basicAuth: { secret: viewerCredentials },
      },
    });

    // CfnOutput registers itself with the construct tree as a side effect.
    // eslint-disable-next-line no-new
    new CfnOutput(this, 'ViewerUrl', {
      description: 'URL of the captured-mail viewer',
      value: mailCatcher.viewerUrl!,
    });

    // CfnOutput registers itself with the construct tree as a side effect.
    // eslint-disable-next-line no-new
    new CfnOutput(this, 'ViewerCredentialsSecretArn', {
      description: 'Read the viewer username and password from this Secrets Manager secret',
      value: viewerCredentials.secretArn,
    });

    // CfnOutput registers itself with the construct tree as a side effect.
    // eslint-disable-next-line no-new
    new CfnOutput(this, 'MailHandlerName', {
      description: 'Invoke this Lambda with a SendMailEvent to capture a message',
      value: mailCatcher.function.functionName,
    });
  }
}
