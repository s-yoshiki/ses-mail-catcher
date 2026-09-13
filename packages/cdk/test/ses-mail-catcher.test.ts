import { App, Duration, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as iam from 'aws-cdk-lib/aws-iam';
import { expect, test } from 'vitest';

import {
  ApiAuthorization,
  SesMailCatcher,
  type MailApiOptions,
  type ViewerOptions,
} from '../src/index.js';

const createStack = (mailApi?: MailApiOptions, viewer?: ViewerOptions): { stack: Stack; catcher: SesMailCatcher } => {
  const app = new App();
  const stack = new Stack(app, 'TestStack', { env: { account: '123456789012', region: 'us-east-1' } });
  const catcher = new SesMailCatcher(stack, 'Catcher', {
    mailApi,
    viewer,
    retention: Duration.days(3),
  });
  return { stack, catcher };
};

test('creates the SES-compatible mail API and disposable storage', () => {
  const { stack, catcher } = createStack();
  const template = Template.fromStack(stack);

  expect(catcher.mailApi).toBeDefined();
  expect(catcher.mailFunction).toBeDefined();
  expect(catcher.mailApiEndpoint).toContain('execute-api');
  expect(catcher.bucket).toBeDefined();
  expect(catcher.table).toBeDefined();

  template.resourceCountIs('AWS::ApiGateway::RestApi', 2);
  template.hasResourceProperties('AWS::ApiGateway::Resource', {
    PathPart: 'outbound-emails',
  });
  template.hasResourceProperties('AWS::DynamoDB::Table', {
    TimeToLiveSpecification: { AttributeName: 'expiresAt', Enabled: true },
    KeySchema: [
      { AttributeName: 'pk', KeyType: 'HASH' },
      { AttributeName: 'sortKey', KeyType: 'RANGE' },
    ],
  });
  template.hasResourceProperties('AWS::S3::Bucket', {
    LifecycleConfiguration: { Rules: [{ ExpirationInDays: 3, Status: 'Enabled' }] },
  });
  template.hasResourceProperties('AWS::Lambda::Function', {
    Handler: 'handler.handler',
    Environment: Match.objectLike({ Variables: Match.objectLike({ RETENTION_SECONDS: '259200' }) }),
  });
});

test('does not grant SES permissions to the capture handler', () => {
  const { stack } = createStack();
  const template = Template.fromStack(stack);
  const policies = JSON.stringify(template.findResources('AWS::IAM::Policy'));

  expect(policies).toContain('dynamodb:PutItem');
  expect(policies).toContain('s3:PutObject');
  expect(policies).not.toContain('ses:SendEmail');
  expect(policies).not.toContain('ses:SendRawEmail');
});

test('supports optional API Gateway IAM authorization and grants', () => {
  const { stack, catcher } = createStack({ authorization: ApiAuthorization.AWS_IAM });
  const role = new iam.Role(stack, 'Sender', { assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com') });
  catcher.grantMailApiInvoke(role);
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::ApiGateway::Method', {
    AuthorizationType: 'AWS_IAM',
  });
  expect(JSON.stringify(template.findResources('AWS::IAM::Policy'))).toContain('execute-api:Invoke');
});

test('supports optional API Gateway source IP restrictions', () => {
  const { stack } = createStack({ allowedIpCidrs: ['203.0.113.0/24', '2001:db8::/32'] });
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::ApiGateway::RestApi', {
    Policy: Match.objectLike({
      Statement: Match.arrayWith([
        Match.objectLike({
          Condition: { NotIpAddress: { 'aws:SourceIp': ['203.0.113.0/24', '2001:db8::/32'] } },
        }),
      ]),
    }),
  });
  expect(Object.keys(template.findResources('AWS::ApiGateway::RestApi'))).toHaveLength(2);
});

test('creates an open viewer when viewer settings are omitted', () => {
  const { stack, catcher } = createStack();
  const template = Template.fromStack(stack);

  expect(catcher.viewerApi).toBeDefined();
  expect(catcher.viewerFunction).toBeDefined();
  expect(catcher.webBucket).toBeDefined();
  expect(catcher.viewerDistribution).toBeDefined();
  expect(catcher.viewerUrl).toMatch(/^https:\/\//);
  template.resourceCountIs('AWS::CloudFront::Distribution', 1);
  template.resourceCountIs('AWS::CloudFront::Function', 1);
  expect(JSON.stringify(template.findResources('AWS::CloudFront::Function')))
    .toContain('0.0.0.0/0');
  expect(JSON.stringify(template.findResources('AWS::CloudFront::Function')))
    .toContain('::/0');
});

test('creates a CloudFront viewer with separate S3 and API Gateway origins', () => {
  const { stack, catcher } = createStack(undefined, { allowedIpCidrs: ['203.0.113.0/24'] });
  const template = Template.fromStack(stack);

  expect(catcher.viewerApi).toBeDefined();
  expect(catcher.viewerFunction).toBeDefined();
  expect(catcher.webBucket).toBeDefined();
  expect(catcher.viewerDistribution).toBeDefined();
  expect(catcher.viewerUrl).toMatch(/^https:\/\//);
  template.resourceCountIs('AWS::ApiGateway::RestApi', 2);
  template.resourceCountIs('AWS::CloudFront::Distribution', 1);
  template.resourceCountIs('AWS::CloudFront::Function', 1);
  template.hasResourceProperties('AWS::Lambda::Function', {
    Handler: 'handler.handler',
  });
  template.hasResourceProperties('AWS::ApiGateway::RestApi', {
    BinaryMediaTypes: ['*/*'],
  });
  expect(JSON.stringify(template.findResources('AWS::CloudFront::Distribution'))).toContain('/api/*');
});

test('requires an IP allowlist for the AWS viewer', () => {
  expect(() => createStack(undefined, { allowedIpCidrs: [] })).toThrow('viewer.allowedIpCidrs');
});

test('accepts a user-managed CloudFront Function for the viewer', () => {
  const app = new App();
  const stack = new Stack(app, 'TestStack', { env: { account: '123456789012', region: 'us-east-1' } });
  const edgeFunction = new cloudfront.Function(stack, 'CustomViewerFunction', {
    code: cloudfront.FunctionCode.fromInline('function handler(event) { return event.request; }'),
  });
  const catcher = new SesMailCatcher(stack, 'Catcher', { viewer: { edgeFunction } });
  const template = Template.fromStack(stack);

  expect(catcher.viewerDistribution).toBeDefined();
  template.resourceCountIs('AWS::CloudFront::Function', 1);
  template.hasResourceProperties('AWS::CloudFront::Function', {
    FunctionCode: 'function handler(event) { return event.request; }',
  });
});

test('empties disposable buckets on stack deletion', () => {
  const { stack } = createStack(undefined, { allowedIpCidrs: ['203.0.113.0/24'] });
  const template = Template.fromStack(stack);
  const buckets = template.findResources('AWS::S3::Bucket');

  expect(Object.keys(buckets)).toHaveLength(2);
  expect(Object.values(buckets)).toEqual(expect.arrayContaining([
    expect.objectContaining({ DeletionPolicy: 'Delete', UpdateReplacePolicy: 'Delete' }),
  ]));
  expect(Object.keys(template.findResources('Custom::S3AutoDeleteObjects'))).toHaveLength(2);
});

test('validates retention', () => {
  const app = new App();
  const stack = new Stack(app, 'TestStack');
  expect(() => new SesMailCatcher(stack, 'Catcher', { retention: Duration.seconds(0) }))
    .toThrow('retention must be greater than zero');
});
