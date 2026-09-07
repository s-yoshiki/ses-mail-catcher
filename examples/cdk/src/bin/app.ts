import { App } from 'aws-cdk-lib';

import { SesMailCatcherExampleStack } from '../ses-mail-catcher-example-stack.js';

const app = new App();

// eslint-disable-next-line no-new
new SesMailCatcherExampleStack(app, 'SesMailCatcherCdkExample', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
