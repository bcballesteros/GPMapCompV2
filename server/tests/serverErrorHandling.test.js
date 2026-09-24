import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createApp } from '../app.js';
import { SHARE_MAX_FILE_BYTES, SHARE_MAX_REQUEST_BYTES } from '../config/share.js';
import { validateDecodedFileSize, ShareRequestError } from '../services/shareService.js';

async function withServer(run) {
  const server = createServer(createApp());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('Share JSON body above the transport limit returns the stable 413 response', async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/api/share`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ padding: 'x'.repeat(SHARE_MAX_REQUEST_BYTES + 1024) }),
    });
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), {
      success: false,
      error: { code: 'FILE_TOO_LARGE', message: 'The map output exceeds the allowed size.' },
    });
  });
});

test('Share parser accepts a body sized for a 32 MiB Base64 output', async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/api/share`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ padding: 'x'.repeat(43 * 1024 * 1024) }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      success: false,
      error: { code: 'INVALID_REQUEST', message: 'The share request is invalid.' },
    });
  });
});

test('unexpected Express errors still return a generic 500 response', async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/api/share`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected server error occurred.' },
    });
  });
});

test('decoded Share size validation accepts 32 MiB and rejects data above it', () => {
  assert.equal(SHARE_MAX_FILE_BYTES, 32 * 1024 * 1024);
  assert.equal(SHARE_MAX_REQUEST_BYTES, 48 * 1024 * 1024);
  assert.doesNotThrow(() => validateDecodedFileSize(Buffer.alloc(SHARE_MAX_FILE_BYTES - 1)));
  const tooLargePng = Buffer.alloc(SHARE_MAX_FILE_BYTES + 1);
  assert.throws(() => validateDecodedFileSize(tooLargePng),
    (error) => error instanceof ShareRequestError
      && error.status === 413
      && error.code === 'FILE_TOO_LARGE'
      && error.message === 'The map output exceeds the allowed size.');
});
