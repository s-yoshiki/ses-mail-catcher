import type { SendMailEvent } from './event-types.js';

/** @internal */
export const validateEvent: (event: unknown) => asserts event is SendMailEvent = (event) => {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new Error('event must be an object');
  }
  const value = event as Record<string, unknown>;
  requireString(value.from, 'from');
  requireString(value.subject, 'subject');
  requireAddresses(value.to, 'to', true);
  requireAddresses(value.cc, 'cc', false);
  requireAddresses(value.bcc, 'bcc', false);
  requireAddresses(value.replyTo, 'replyTo', false);
  for (const field of ['text', 'html']) {
    if (value[field] !== undefined) requireString(value[field], field);
  }
  if (value.attachments !== undefined) {
    if (!Array.isArray(value.attachments)) throw new Error('attachments must be an array');
    for (const attachment of value.attachments) {
      if (!attachment || typeof attachment !== 'object' || Array.isArray(attachment)) {
        throw new Error('each attachment must be an object');
      }
      const item = attachment as Record<string, unknown>;
      requireString(item.filename, 'attachments[].filename');
      requireString(item.contentType, 'attachments[].contentType');
      requireString(item.bucket, 'attachments[].bucket');
      requireString(item.key, 'attachments[].key');
    }
  }
  if (value.metadata !== undefined && (typeof value.metadata !== 'object' || Array.isArray(value.metadata))) {
    throw new Error('metadata must be an object');
  }
};

const requireString: (value: unknown, name: string) => asserts value is string = (value, name) => {
  if (typeof value !== 'string' || value.length === 0 || /[\r\n]/.test(value)) {
    throw new Error(`${name} must be a non-empty string without CR or LF`);
  }
};

const requireAddresses: (value: unknown, name: string, required: boolean) => asserts value is string[] | undefined = (value, name, required) => {
  if (value === undefined && !required) return;
  if (!Array.isArray(value) || (required && value.length === 0)) {
    throw new Error(`${name} must be a non-empty array`);
  }
  for (const address of value) requireString(address, `${name}[]`);
};
