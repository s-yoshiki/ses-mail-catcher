import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const generatedPaths = [
  '.jsii',
  '.turbo',
  'coverage',
  'test-reports',
  'packages/cdk/.jsii',
  'packages/cdk/.turbo',
  'packages/cdk/coverage',
  'packages/cdk/dist',
  'packages/cdk/lib',
  'packages/cdk/test-reports',
  'packages/cdk-lambda-mail-handler/.turbo',
  'packages/cdk-lambda-mail-handler/coverage',
  'packages/cdk-lambda-mail-handler/lib',
  'packages/cdk-lambda-mail-handler/test-reports',
  'packages/cdk-lambda-viewer-handler/.turbo',
  'packages/cdk-lambda-viewer-handler/coverage',
  'packages/cdk-lambda-viewer-handler/lib',
  'packages/cdk-lambda-viewer-handler/test-reports',
  'packages/local/.turbo',
  'packages/local/coverage',
  'packages/local/lib',
  'packages/local/test-reports',
  'packages/viewer/.turbo',
  'packages/viewer/coverage',
  'packages/viewer/dist',
  'packages/viewer/test-reports',
  'packages/api-contract/.turbo',
  'packages/api-contract/coverage',
  'packages/api-contract/test-reports',
  'examples/cdk/.turbo',
  'examples/cdk/cdk.out',
  'examples/cdk/coverage',
  'examples/cdk/lib',
  'examples/cdk/test-reports',
  'examples/sdk/.turbo',
  'examples/sdk/coverage',
  'examples/sdk/lib',
  'examples/sdk/test-reports',
];

await Promise.all(
  generatedPaths.map((relativePath) => rm(join(repositoryRoot, relativePath), { force: true, recursive: true })),
);
