import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const stackName = process.env.CDK_STACK_NAME ?? 'SesMailCatcherCdkExample';
const stackRegion = process.env.CDK_DEFAULT_REGION ?? process.env.AWS_REGION ?? 'ap-northeast-1';
const edgeRegion = 'us-east-1';
const profile = process.env.AWS_PROFILE;

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const callAws = async (service, args, region) => {
  const cliArgs = [service, ...args, '--region', region, '--output', 'json', '--no-cli-pager'];
  if (profile !== undefined) {
    cliArgs.push('--profile', profile);
  }

  const { stdout } = await execFileAsync('aws', cliArgs, { maxBuffer: 1024 * 1024 });
  return JSON.parse(stdout);
};

const stackResponse = await callAws('cloudformation', ['describe-stacks', '--stack-name', stackName], stackRegion);
const outputs = Object.fromEntries((stackResponse.Stacks?.[0]?.Outputs ?? []).map((output) => [output.OutputKey, output.OutputValue]));
const secretArn = outputs.ViewerCredentialsSecretArn;
const keyValueStoreArn = outputs.EdgeAuthKeyValueStoreArn;

if (secretArn === undefined || keyValueStoreArn === undefined) {
  throw new Error(`stack ${stackName} is missing ViewerCredentialsSecretArn or EdgeAuthKeyValueStoreArn outputs`);
}

const secretResponse = await callAws('secretsmanager', ['get-secret-value', '--secret-id', secretArn], stackRegion);
if (secretResponse.SecretString === undefined) {
  throw new Error('the viewer credentials secret does not contain SecretString');
}

const credentials = JSON.parse(secretResponse.SecretString);
if (typeof credentials.username !== 'string' || typeof credentials.password !== 'string') {
  throw new Error('the viewer credentials secret must contain string username and password fields');
}

// CloudFront Function compares the base64 payload after the `Basic ` prefix.
// Keep the password out of stdout, the synthesized template, and stack outputs.
const basicCredential = Buffer.from(`${credentials.username}:${credentials.password}`, 'utf8').toString('base64');

let keyValueStore;
for (let attempt = 0; attempt < 60; attempt += 1) {
  keyValueStore = await callAws(
    'cloudfront-keyvaluestore',
    ['describe-key-value-store', '--kvs-arn', keyValueStoreArn],
    edgeRegion,
  );
  if (keyValueStore.Status === 'READY') {
    break;
  }
  if (keyValueStore.Status !== 'PROVISIONING') {
    throw new Error(`CloudFront KeyValueStore is not ready: ${keyValueStore.Status} ${keyValueStore.FailureReason ?? ''}`.trim());
  }
  await sleep(5000);
}

if (keyValueStore?.Status !== 'READY' || keyValueStore.ETag === undefined) {
  throw new Error('timed out waiting for the CloudFront KeyValueStore to become READY');
}

await callAws(
  'cloudfront-keyvaluestore',
  [
    'put-key',
    '--key',
    'basic-auth',
    '--value',
    basicCredential,
    '--kvs-arn',
    keyValueStoreArn,
    '--if-match',
    keyValueStore.ETag,
  ],
  edgeRegion,
);

console.log(`CloudFront Edge Basic Auth credential synchronized for ${stackName}.`);
console.log(`Open the ViewerUrl output after CloudFront finishes deploying: ${outputs.ViewerUrl}`);
