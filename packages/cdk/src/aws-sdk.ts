import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** @internal */
export interface CommandClient {
  send(command: unknown): Promise<unknown>;
}

/** @internal */
export interface CommandConstructor {
  new (input: unknown): unknown;
}

/** @internal */
export interface AwsSdkModules {
  readonly DynamoDBClient: new (config: Record<string, unknown>) => unknown;
  readonly PutItemCommand: CommandConstructor;
  readonly GetObjectCommand: CommandConstructor;
  readonly PutObjectCommand: CommandConstructor;
  readonly S3Client: new (config: Record<string, unknown>) => unknown;
  readonly SendEmailCommand: CommandConstructor;
  readonly SESv2Client: new (config: Record<string, unknown>) => unknown;
}

// Lambda's supported Node.js runtimes provide these AWS SDK v3 modules. The
// adapter is isolated so the mail-processing logic can use injected clients in
// unit tests without embedding a second copy of the SDK in the Lambda asset.
export function loadAwsSdk(): AwsSdkModules {
  return {
    ...require('@aws-sdk/client-dynamodb'),
    ...require('@aws-sdk/client-s3'),
    ...require('@aws-sdk/client-sesv2'),
  };
}
