import { App, Duration, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as iam from 'aws-cdk-lib/aws-iam';
import { expect, test } from 'vitest';
import { MailMode, SesMailCatcher } from '../src/index.js';

function createStack(mode?: MailMode): { stack: Stack; catcher: SesMailCatcher } {
  const app = new App();
  const stack = new Stack(app, 'TestStack');
  const catcher = new SesMailCatcher(stack, 'Catcher', {
    mode,
    retention: Duration.days(3),
  });
  return { stack, catcher };
}

test('creates catch-mode storage, TTL, and a directly invokable Lambda', () => {
  const { stack, catcher } = createStack();
  const template = Template.fromStack(stack);

  expect(catcher.node.path).toBe('TestStack/Catcher');
  expect(catcher.mode).toBe(MailMode.CATCH);
  expect(catcher.function).toBeDefined();
  expect(catcher.bucket).toBeDefined();
  expect(catcher.table).toBeDefined();

  template.resourceCountIs('AWS::Lambda::Function', 1);
  template.hasResourceProperties('AWS::DynamoDB::Table', {
    TimeToLiveSpecification: { AttributeName: 'expiresAt', Enabled: true },
    KeySchema: [
      { AttributeName: 'mailbox', KeyType: 'HASH' },
      { AttributeName: 'sortKey', KeyType: 'RANGE' },
    ],
  });
  template.hasResourceProperties('AWS::S3::Bucket', {
    LifecycleConfiguration: {
      Rules: [{ ExpirationInDays: 3, Status: 'Enabled' }],
    },
  });
  template.hasResourceProperties('AWS::Lambda::Function', {
    Handler: 'mail-handler.handler',
    Environment: Match.objectLike({
      Variables: Match.objectLike({
        MAIL_MODE: 'CATCH',
        RETENTION_SECONDS: '259200',
      }),
    }),
  });
});

test('catch mode grants storage access but does not grant SES access', () => {
  const { stack, catcher } = createStack(MailMode.CATCH);
  const sender = new iam.Role(stack, 'Sender', {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });
  catcher.grantSend(sender);
  const template = Template.fromStack(stack);
  const policies = template.findResources('AWS::IAM::Policy');
  const policyText = JSON.stringify(policies);

  expect(policyText).toContain('dynamodb:PutItem');
  expect(policyText).toContain('s3:PutObject');
  expect(policyText).not.toContain('ses:SendEmail');

  template.hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: Match.objectLike({
      Statement: Match.arrayWith([
        Match.objectLike({ Action: 'lambda:InvokeFunction' }),
      ]),
    }),
  });
});

test('relay mode adds SES delivery permissions to the handler', () => {
  const { stack } = createStack(MailMode.RELAY);
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::Lambda::Function', {
    Environment: Match.objectLike({
      Variables: Match.objectLike({ MAIL_MODE: 'RELAY' }),
    }),
  });
  template.hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: Match.objectLike({
      Statement: Match.arrayWith([
        Match.objectLike({
          Action: ['ses:SendEmail', 'ses:SendRawEmail'],
          Effect: 'Allow',
          Resource: '*',
        }),
      ]),
    }),
  });
  expect(Object.keys(template.findResources('AWS::IAM::Policy'))).toHaveLength(1);
});

test('rejects non-positive retention', () => {
  const app = new App();
  const stack = new Stack(app, 'TestStack');

  expect(() => new SesMailCatcher(stack, 'Catcher', { retention: Duration.seconds(0) })).toThrow('retention must be greater than zero');
});
