import assert from 'node:assert/strict';
import test from 'node:test';

process.env.SHARE_TOKEN_SECRET = 'test-only-share-token-secret-32-characters';
process.env.SHARE_BASE_URL = 'https://example.test/maps///';

const {
  buildShareUrl,
  createShareToken,
  parseShareToken,
  validateShareLinkConfiguration,
} = await import('../services/shareTokenService.js');
const { detectShareOutputFormat, SHARE_OUTPUT_TYPES } = await import('../services/shareOutputFormat.js');

test('token round trip is opaque and uses a fresh IV each time', () => {
  validateShareLinkConfiguration();
  const first = createShareToken(123456789);
  const second = createShareToken(123456789);
  assert.match(first, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.notEqual(first, second);
  assert.equal(parseShareToken(first), 123456789);
  assert.equal(parseShareToken(second), 123456789);
  assert.equal(first.includes('123456789'), false);
  assert.equal(first.split('.').length, 4);
});

test('tampering or malformed token structure is rejected', () => {
  const token = createShareToken(456);
  const parts = token.split('.');
  parts[2] = `${parts[2][0] === 'A' ? 'B' : 'A'}${parts[2].slice(1)}`;
  assert.throws(() => parseShareToken(parts.join('.')));
  assert.throws(() => parseShareToken('v1.bad'));
  assert.throws(() => parseShareToken(`${token}.extra`));
  assert.throws(() => parseShareToken('v2.' + parts.slice(1).join('.')));
});

test('record IDs must be positive PostgreSQL integer IDs', () => {
  for (const id of [0, -1, 1.5, NaN, Infinity, '1', 2147483648]) {
    assert.throws(() => createShareToken(id));
  }
  assert.equal(parseShareToken(createShareToken(2147483647)), 2147483647);
});

test('share URL removes trailing slashes', () => {
  assert.equal(buildShareUrl('v1.example'), 'https://example.test/maps/share/v1.example');
});

test('stored output signatures map to safe inline response types', () => {
  const samples = [
    [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'png', 'image/png'],
    [Buffer.from([0xff, 0xd8, 0xff]), 'jpeg', 'image/jpeg'],
    [Buffer.from('%PDF-1.7'), 'pdf', 'application/pdf'],
  ];
  for (const [data, format, contentType] of samples) {
    assert.equal(detectShareOutputFormat(data), format);
    assert.equal(SHARE_OUTPUT_TYPES[format].contentType, contentType);
  }
  assert.equal(detectShareOutputFormat(Buffer.from('unsupported')), null);
});

test('public HTTP responses conceal invalid links and database failures',
  { skip: !process.env.TEST_SHARE_SERVER_PORT }, async () => {
    const base = `http://127.0.0.1:${process.env.TEST_SHARE_SERVER_PORT}`;
    const token = createShareToken(123456789);
    const parts = token.split('.');
    parts[3] = `${parts[3][0] === 'A' ? 'B' : 'A'}${parts[3].slice(1)}`;

    for (const invalid of ['not-a-token', parts.join('.')]) {
      const response = await fetch(`${base}/share/${invalid}`);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), {
        success: false,
        error: { code: 'SHARED_MAP_NOT_FOUND', message: 'The shared map could not be found.' },
      });
    }

    const unavailableDatabase = await fetch(`${base}/share/${token}`);
    assert.equal(unavailableDatabase.status, 500);
    assert.deepEqual(await unavailableDatabase.json(), {
      success: false,
      error: { code: 'SHARE_RETRIEVAL_FAILED', message: 'Unable to retrieve the shared map.' },
    });
  });
