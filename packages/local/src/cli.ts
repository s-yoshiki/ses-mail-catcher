#!/usr/bin/env node

import { resolveDbPath } from './db-path.js';
import { startServer } from './ses-server.js';

interface CliOptions {
  host: string;
  port: number;
  dbPath: string;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options === undefined) {
    return;
  }

  const running = await startServer(options);
  console.log(`ses-mail-catcher listening on ${running.url}`);
  console.log(`sqlite: ${running.dbPath}`);

  const shutdown = () => {
    void running.close().then(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

function parseArgs(args: string[]): CliOptions | undefined {
  const options: CliOptions = {
    host: '127.0.0.1',
    port: 8005,
    dbPath: resolveDbPath(),
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') {
      console.log('Usage: ses-mail-catcher [--host HOST] [--port PORT] [--db-path PATH]');
      return undefined;
    }
    if (arg === '--version' || arg === '-v') {
      console.log('0.1.0');
      return undefined;
    }
    if (arg === '--host') {
      options.host = requiredValue(args, ++index, arg);
      continue;
    }
    if (arg === '--port') {
      const value = requiredValue(args, ++index, arg);
      const port = Number.parseInt(value, 10);
      if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new Error('--port must be an integer between 0 and 65535');
      }
      options.port = port;
      continue;
    }
    if (arg === '--db-path') {
      options.dbPath = requiredValue(args, ++index, arg);
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function requiredValue(args: string[], index: number, option: string): string {
  const value = args[index];
  if (!value || value.startsWith('-')) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
