import { App, Duration, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { expect, test } from 'vitest';
import { MailMode, SesMailCatcher, type RelayOptions, type ViewerOptions } from '../src/index.js';

const createStack = (mode?: MailMode, relay?: RelayOptions): { stack: Stack; catcher: SesMailCatcher } => {
  const app = new App();
  const stack = new Stack(app, 'TestStack', { env: { account: '123456789012', region: 'us-east-1' } });
  const catcher = new SesMailCatcher(stack, 'Catcher', {
    mode,
    relay,
    retention: Duration.days(3),
  });
  return { stack, catcher };
};

const mailHandlers = (template: Template): Record<string, unknown> => {
  return template.findResources('AWS::Lambda::Function', {
    Properties: { Handler: 'mail-handler/mail-handler.handler' },
  });
};

test('creates catch-mode storage, TTL, and a directly invokable Lambda', () => {
  const { stack, catcher } = createStack();
  const template = Template.fromStack(stack);

  expect(catcher.node.path).toBe('TestStack/Catcher');
  expect(catcher.mode).toBe(MailMode.CATCH);
  expect(catcher.function).toBeDefined();
  expect(catcher.bucket).toBeDefined();
  expect(catcher.table).toBeDefined();

  expect(Object.keys(mailHandlers(template))).toHaveLength(1);
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
    Handler: 'mail-handler/mail-handler.handler',
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
  const relayPolicies = Object.values(template.findResources('AWS::IAM::Policy')).filter(
    (policy) => JSON.stringify(policy).includes('ses:SendEmail'),
  );
  expect(relayPolicies).toHaveLength(1);
});

test('empties the bucket so the stack can be deleted', () => {
  const { stack } = createStack();
  const template = Template.fromStack(stack);

  const buckets = Object.values(template.findResources('AWS::S3::Bucket'));
  expect(buckets).toHaveLength(1);
  expect(buckets[0]).toMatchObject({ DeletionPolicy: 'Delete', UpdateReplacePolicy: 'Delete' });
  expect(Object.keys(template.findResources('Custom::S3AutoDeleteObjects'))).toHaveLength(1);
});

test('relay mode narrows SES permissions to the configured identity', () => {
  const { stack } = createStack(MailMode.RELAY, {
    fromEmailAddressIdentityArn: 'arn:aws:ses:us-east-1:123456789012:identity/example.com',
    configurationSetName: 'catcher',
  });
  const template = Template.fromStack(stack);

  // The configuration set ARN keeps the partition as a pseudo parameter, so
  // the statement is compared as rendered JSON rather than as a literal ARN.
  const relayPolicy = Object.values(template.findResources('AWS::IAM::Policy'))
    .map((policy) => JSON.stringify(policy))
    .find((policy) => policy.includes('ses:SendEmail'));

  expect(relayPolicy).toContain('arn:aws:ses:us-east-1:123456789012:identity/example.com');
  expect(relayPolicy).toContain(':ses:us-east-1:123456789012:configuration-set/catcher');
  expect(relayPolicy).not.toContain('"Resource":"*"');
});

test('rejects non-positive retention', () => {
  const app = new App();
  const stack = new Stack(app, 'TestStack');

  expect(() => new SesMailCatcher(stack, 'Catcher', { retention: Duration.seconds(0) })).toThrow('retention must be greater than zero');
});

const viewerStack = (viewer?: ViewerOptions, mode?: MailMode): Stack => {
  const app = new App();
  const stack = new Stack(app, 'ViewerStack', { env: { account: '123456789012', region: 'us-east-1' } });
  const catcher = new SesMailCatcher(stack, 'Catcher', { mode, viewer, retention: Duration.days(3) });
  return catcher.node.scope as Stack;
};

test('creates no viewer unless one is asked for', () => {
  const { stack, catcher } = createStack();
  const template = Template.fromStack(stack);

  expect(catcher.viewerFunction).toBeUndefined();
  expect(catcher.viewerUrl).toBeUndefined();
  expect(Object.keys(template.findResources('AWS::Lambda::Url'))).toHaveLength(0);
});

test('refuses to create a viewer that anyone with the URL could read', () => {
  expect(() => viewerStack({})).toThrow('unauthenticated viewer');
  expect(() => viewerStack({ allowPublicAccess: true })).not.toThrow();
  expect(() => viewerStack({ authType: lambda.FunctionUrlAuthType.AWS_IAM })).not.toThrow();
});

test('refuses a viewer in relay mode, where nothing is stored', () => {
  expect(() => viewerStack({ allowPublicAccess: true }, MailMode.RELAY)).toThrow('CATCH mode');
});

test('serves the viewer from a function url with an address allow list', () => {
  const stack = viewerStack({ allowedIpCidrs: ['203.0.113.0/24', '2001:db8::/32'] });
  const template = Template.fromStack(stack);

  const urls = Object.values(template.findResources('AWS::Lambda::Url'));
  expect(urls).toHaveLength(1);
  expect(urls[0]).toMatchObject({ Properties: { AuthType: 'NONE' } });

  const viewers = template.findResources('AWS::Lambda::Function', {
    Properties: { Handler: 'viewer-handler/viewer-handler.handler' },
  });
  expect(Object.keys(viewers)).toHaveLength(1);
  expect(JSON.stringify(viewers)).toContain('203.0.113.0/24,2001:db8::/32');
});

test('reads basic auth credentials from a secret rather than the template', () => {
  const app = new App();
  const stack = new Stack(app, 'ViewerStack', { env: { account: '123456789012', region: 'us-east-1' } });
  const secret = new secretsmanager.Secret(stack, 'ViewerCredentials');
  const catcher = new SesMailCatcher(stack, 'Catcher', {
    retention: Duration.days(3),
    viewer: { basicAuth: { secret } },
  });
  const template = Template.fromStack(stack);

  expect(catcher.viewerFunction).toBeDefined();
  expect(catcher.viewerUrl).toBeDefined();

  template.hasResourceProperties('AWS::Lambda::Function', {
    Handler: 'viewer-handler/viewer-handler.handler',
    Environment: Match.objectLike({
      Variables: Match.objectLike({
        VIEWER_BASIC_AUTH_SECRET_ARN: { Ref: Match.stringLikeRegexp('ViewerCredentials') },
        VIEWER_BASIC_AUTH_USERNAME_FIELD: 'username',
        VIEWER_BASIC_AUTH_PASSWORD_FIELD: 'password',
      }),
    }),
  });

  const policies = JSON.stringify(template.findResources('AWS::IAM::Policy'));
  expect(policies).toContain('secretsmanager:GetSecretValue');
  expect(policies).toContain('dynamodb:Query');
  expect(policies).toContain('s3:GetObject');
});

test('grants the viewer no write access to the catcher storage', () => {
  const stack = viewerStack({ allowPublicAccess: true });
  const template = Template.fromStack(stack);

  const viewerRole = Object.entries(template.findResources('AWS::IAM::Policy'))
    .find(([name]) => name.includes('ViewerHandler'));
  expect(viewerRole).toBeDefined();

  const document = JSON.stringify(viewerRole?.[1]);
  expect(document).not.toContain('s3:PutObject');
  expect(document).not.toContain('dynamodb:PutItem');
  expect(document).not.toContain('ses:SendEmail');
});
