import baseConfig from './configs/oxfmt/base.ts';

export default {
  ...baseConfig,
  ignorePatterns: [
    'packages/cdk/API.md',
    'packages/cdk/.projen/tasks.json',
    'packages/cdk/package.json',
    'packages/cdk/projenrc/tsconfig.json',
    'packages/cdk/test/tsconfig.json',
    'packages/cdk/tsconfig.json',
  ],
};
