import { describe, expect, it } from 'vitest';

import {
  DEFAULT_HOST,
  DEFAULT_PORT,
  HOST_ENV,
  PORT_ENV,
  parsePort,
  resolveHost,
  resolvePort,
} from '../src/options.js';

describe('resolveHost', () => {
  it('defaults to the loopback interface', () => {
    expect(resolveHost({})).toBe(DEFAULT_HOST);
  });

  it('prefers an explicit host', () => {
    expect(resolveHost({ [HOST_ENV]: '0.0.0.0' })).toBe('0.0.0.0');
  });

  it('ignores an empty host', () => {
    expect(resolveHost({ [HOST_ENV]: '' })).toBe(DEFAULT_HOST);
  });
});

describe('resolvePort', () => {
  it('defaults to 8005', () => {
    expect(resolvePort({})).toBe(DEFAULT_PORT);
  });

  it('prefers an explicit port', () => {
    expect(resolvePort({ [PORT_ENV]: '9000' })).toBe(9000);
  });

  it('rejects an out-of-range port', () => {
    expect(() => resolvePort({ [PORT_ENV]: '70000' })).toThrow(PORT_ENV);
  });
});

describe('parsePort', () => {
  it('names the source in the error message', () => {
    expect(() => parsePort('nope', '--port')).toThrow('--port must be an integer between 0 and 65535');
  });
});
