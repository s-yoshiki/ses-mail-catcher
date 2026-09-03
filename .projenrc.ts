import { awscdk, javascript } from 'projen';
const project = new awscdk.AwsCdkConstructLibrary({
  author: 'Yoshiki Shinagawa',
  authorAddress: 's.yoshiki1123@gmail.com',
  allowScripts: ['@parcel/watcher', 'unrs-resolver'],
  cdkVersion: '2.189.1',
  description: 'AWS CDK Construct Library for capturing and inspecting emails sent through Amazon SES',
  homepage: 'https://github.com/s-yoshiki/cdk-ses-mail-catcher',
  jsiiVersion: '~6.0.0',
  keywords: ['aws-cdk', 'aws-ses', 'email', 'mail-catcher', 'jsii'],
  name: 'cdk-ses-mail-catcher',
  packageManager: javascript.NodePackageManager.PNPM,
  pnpmOptions: {
    workspaceYamlOptions: {
      allowBuilds: {
        '@parcel/watcher': true,
        'unrs-resolver': true,
      },
    },
  },
  projenrcTs: true,
  publishTasks: true,
  releaseToNpm: true,
  repositoryUrl: 'https://github.com/s-yoshiki/cdk-ses-mail-catcher.git',
  typescriptVersion: '~5.9.2',
  workflowPackageCache: true,

  // defaultReleaseBranch: "main",  /* The name of the main release branch. */
  // deps: [],                      /* Runtime dependencies of this module. */
  // devDeps: [],                   /* Build dependencies for this module. */
  // packageName: undefined,        /* The "name" in package.json. */
});
project.synth();
