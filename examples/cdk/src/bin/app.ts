import { App } from 'aws-cdk-lib';

import { SesMailCatcherExampleStack } from '../lib/ses-mail-catcher-example-stack.js';

const app = new App();

export const exampleStack = new SesMailCatcherExampleStack(app, 'SesMailCatcherCdkExample', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
