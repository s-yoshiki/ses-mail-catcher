export const HOST_ENV = 'SES_MAIL_CATCHER_HOST';
export const PORT_ENV = 'SES_MAIL_CATCHER_PORT';

export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = 8005;

export const resolveHost = (env: NodeJS.ProcessEnv = process.env): string => {
  const value = env[HOST_ENV];
  return value ? value : DEFAULT_HOST;
};

export const resolvePort = (env: NodeJS.ProcessEnv = process.env): number => {
  const value = env[PORT_ENV];
  return value ? parsePort(value, PORT_ENV) : DEFAULT_PORT;
};

export const parsePort = (value: string, source: string): number => {
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`${source} must be an integer between 0 and 65535`);
  }
  return port;
};
