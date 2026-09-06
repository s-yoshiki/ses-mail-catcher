#!/usr/bin/env node

import { resolveDbPath } from './db-path.js';
import { parsePort, resolveHost, resolvePort } from './options.js';
import { startServer } from './ses-server.js';

interface CliOptions {
  host: string;
  port: number;
  dbPath: string;
}

const main = async (): Promise<void> => {
  const options = parseArgs(process.argv.slice(2));
  if (options === undefined) {
    return;
  }

  const running = await startServer(options);
  console.log(`ses-mail-catcher listening on ${running.url}`);
  console.log(`sqlite: ${running.dbPath}`);
  console.log(running.viewerEnabled
    ? `viewer:  ${running.url}/`
    : 'viewer:  not built (API only); run "pnpm build" from the repository root');

  const shutdown = () => {
    void running.close().then(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
};

const parseArgs = (args: string[]): CliOptions | undefined => {
  const options: CliOptions = {
    host: resolveHost(),
    port: resolvePort(),
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
      options.port = parsePort(requiredValue(args, ++index, arg), arg);
      continue;
    }
    if (arg === '--db-path') {
      options.dbPath = requiredValue(args, ++index, arg);
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
};

const requiredValue = (args: string[], index: number, option: string): string => {
  const value = args[index];
  if (!value || value.startsWith('-')) {
    throw new Error(`${option} requires a value`);
  }
  return value;
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
