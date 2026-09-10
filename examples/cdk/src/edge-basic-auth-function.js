/* eslint-disable func-style, no-unused-vars */

import cf from 'cloudfront';

const kvsHandle = cf.kvs();
const credentialKey = 'basic-auth';

function unauthorized() {
  return {
    statusCode: 401,
    statusDescription: 'Unauthorized',
    headers: {
      'www-authenticate': { value: 'Basic realm="ses-mail-catcher"' },
      'cache-control': { value: 'no-store' },
    },
  };
}

async function handler(event) {
  const authorization = event.request.headers.authorization;
  if (authorization === undefined || !authorization.value.toLowerCase().startsWith('basic ')) {
    return unauthorized();
  }

  try {
    const expectedCredential = await kvsHandle.get(credentialKey, { format: 'string' });
    if (authorization.value.slice(6) !== expectedCredential) {
      return unauthorized();
    }
  } catch (error) {
    void error;
    return {
      statusCode: 503,
      statusDescription: 'Service Unavailable',
      headers: { 'cache-control': { value: 'no-store' } },
    };
  }

  return event.request;
}
