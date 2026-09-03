import { App, Stack } from 'aws-cdk-lib';
import { SesMailCatcher } from '../src';

test('can be instantiated as a CDK construct', () => {
  const app = new App();
  const stack = new Stack(app, 'TestStack');

  const catcher = new SesMailCatcher(stack, 'Catcher');

  expect(catcher.node.path).toBe('TestStack/Catcher');
});
