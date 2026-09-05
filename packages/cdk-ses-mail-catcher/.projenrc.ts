import { awscdk, javascript, typescript } from 'projen';
const project = new awscdk.AwsCdkConstructLibrary({
  author: 'Yoshiki Shinagawa',
  authorAddress: 's.yoshiki1123@gmail.com',
  bumpPackage: 'commit-and-tag-version@^13',
  cdkVersion: '2.268.0',
  constructsVersion: '10.8.1',
  description: 'AWS CDK Construct Library for capturing and inspecting emails sent through Amazon SES',
  homepage: 'https://github.com/s-yoshiki/cdk-ses-mail-catcher',
  jsiiVersion: '~6.0.12',
  keywords: ['aws-cdk', 'aws-ses', 'constructs', 'email', 'mail', 'mail-catcher', 'serverless', 'testing', 'jsii'],
  name: 'cdk-ses-mail-catcher',
  repositoryDirectory: 'packages/cdk-ses-mail-catcher',
  packageManager: javascript.NodePackageManager.PNPM,
  projenCommand: 'projen --no-post',
  projenVersion: '^0.103.16',
  devDeps: [
    '@types/node@^26.4.1',
    'commit-and-tag-version@^13.1.2',
    'jsii-diff@^1.140.0',
    'jsii-docgen@^10.12.6',
    'jsii-pacmak@^1.140.0',
    'oxlint@^1.81.0',
    'tsx@^4.23.13',
    'vitest@^5.0.0',
  ],
  eslint: false,
  jest: false,
  github: false,
  buildWorkflow: false,
  pullRequestTemplate: false,
  autoMerge: false,
  projenrcTs: true,
  projenrcTsOptions: {
    runner: typescript.TypeScriptRunner.tsx({
      tsconfig: 'projenrc/tsconfig.json',
      typeCheck: true,
    }),
  },
  publishTasks: true,
  releaseToNpm: true,
  repositoryUrl: 'https://github.com/s-yoshiki/cdk-ses-mail-catcher.git',
  typescriptVersion: '~7.0.2',
  workflowPackageCache: true,

  // defaultReleaseBranch: "main",  /* The name of the main release branch. */
  // deps: [],                      /* Runtime dependencies of this module. */
  // devDeps: [],                   /* Build dependencies for this module. */
  // packageName: undefined,        /* The "name" in package.json. */
});

// jsii currently requires the 6.x toolchain, while jsii-rosetta can be kept at
// its latest compatible patch release independently of the jsii compiler.
project.deps.removeDependency('jsii-rosetta');
project.addDevDeps('jsii-rosetta@~6.0.13');

// Oxlint is the workspace linter. Keep this task in the package so Turbo
// can run linting per workspace package.
project.addTask('lint', {
  exec: 'oxlint .projenrc.ts src test',
});
project.setScript('lint', 'oxlint .projenrc.ts src test');
project.addTask('typecheck', {
  exec: 'tsc --noEmit',
});
project.setScript('typecheck', 'tsc --noEmit');
project.testTask.reset('vitest run', { receiveArgs: true });
project.tasks.tryFind('test:watch')?.reset('vitest');
project.setScript('test', 'vitest run');
project.setScript('test:watch', 'vitest');
project.package.addVersion('0.1.0');

project.synth();
