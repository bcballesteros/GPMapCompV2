import assert from 'node:assert/strict';
import test from 'node:test';
import { processShare, ShareRequestError, ShareDeliveryFailureError } from '../services/shareService.js';
import { createMapComposerRecords } from '../repositories/mapComposerRepository.js';
import { handleCreateShare } from '../controllers/shareController.js';

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const body = { recipientEmails: ['juan@example.com', 'maria@example.com'], format: 'png', imageData: png.toString('base64') };
function deps(overrides = {}) {
  return {
    validateShareLinkConfiguration() {}, validateEmailConfiguration() {},
    async createMapComposerRecords(entries) { return entries.map((_, i) => ({ id: 10 + i })); },
    createShareToken: (id) => `token-${id}`, buildShareUrl: (token) => `https://maps.test/share/${token}`,
    async sendShareEmail() {}, ...overrides,
  };
}

test('multiple recipients receive individually-tokenized links and isolated email attempts', async () => {
  const messages = [];
  const result = await processShare(body, deps({ async sendShareEmail(message) { messages.push(message); } }));
  assert.deepEqual(messages, [
    { recipientEmail: 'juan@example.com', shareUrl: 'https://maps.test/share/token-10' },
    { recipientEmail: 'maria@example.com', shareUrl: 'https://maps.test/share/token-11' },
  ]);
  assert.deepEqual(result, { sentCount: 2, failedCount: 0, results: [
    { email: 'juan@example.com', status: 'sent' }, { email: 'maria@example.com', status: 'sent' },
  ] });
});

test('recipient validation rejects empty, malformed, duplicate, too many, and conflicting inputs before storage', async () => {
  const invalid = [
    [{ ...body, recipientEmails: [] }, 'INVALID_EMAIL'],
    [{ ...body, recipientEmails: ['bad'] }, 'INVALID_EMAIL'],
    ...['a..b@example.com', 'a@-example.com', 'a@@example.com', 'a@example..com'].map(email => [{ ...body, recipientEmails: [email] }, 'INVALID_EMAIL']),
    [{ ...body, recipientEmails: ['a@example.com', ' A@example.com '] }, 'DUPLICATE_RECIPIENT'],
    [{ ...body, recipientEmails: Array.from({ length: 6 }, (_, i) => `a${i}@example.com`) }, 'TOO_MANY_RECIPIENTS'],
    [{ ...body, recipientEmail: 'x@example.com' }, 'INVALID_REQUEST'],
  ];
  let stored = false;
  for (const [input, code] of invalid) {
    await assert.rejects(processShare(input, deps({ async createMapComposerRecords() { stored = true; } })),
      (error) => error instanceof ShareRequestError && error.code === code);
  }
  assert.equal(stored, false);
});

test('format and binary validation finish before any records are created', async () => {
  let stored = false;
  const cases = [
    [{ ...body, format: 'gif' }, 'UNSUPPORTED_FORMAT'],
    [{ ...body, imageData: Buffer.from('not an image').toString('base64') }, 'INVALID_IMAGE_DATA'],
  ];
  for (const [input, code] of cases) {
    await assert.rejects(processShare(input, deps({ async createMapComposerRecords() { stored = true; } })),
      (error) => error instanceof ShareRequestError && error.code === code);
  }
  assert.equal(stored, false);
});

test('partial delivery continues and all failed delivery carries safe recipient results', async () => {
  let attempts = 0;
  const result = await processShare(body, deps({ async sendShareEmail() { attempts += 1; if (attempts === 1) throw new Error('smtp'); } }));
  assert.deepEqual(result.results.map((item) => item.status), ['failed', 'sent']);
  await assert.rejects(processShare(body, deps({ async sendShareEmail() { throw new Error('smtp'); } })),
    (error) => error instanceof ShareDeliveryFailureError && error.results.length === 2);
});

test('multi-recipient controller returns 207, 201, and safe 500 outcomes', async () => {
  const response = () => ({ statusCode: 0, body: null, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } });
  const partial = response();
  await handleCreateShare({ body }, partial, async () => ({ sentCount: 1, failedCount: 1, results: [{ email: 'juan@example.com', status: 'sent' }, { email: 'maria@example.com', status: 'failed' }] }));
  assert.equal(partial.statusCode, 207);
  assert.equal(partial.body.partial, true);
  const allFailed = response();
  const oldError = console.error; console.error = () => {};
  try {
    await handleCreateShare({ body }, allFailed, async () => { throw new ShareDeliveryFailureError([{ email: 'juan@example.com', status: 'failed' }]); });
  } finally { console.error = oldError; }
  assert.equal(allFailed.statusCode, 500);
  assert.equal(JSON.stringify(allFailed.body).includes('share/'), false);
});

test('repository rolls back failed batch inserts and always releases its connection', async () => {
  const statements = [];
  let inserts = 0;
  let released = false;
  const acquire = async () => ({
    async query(sql) {
      statements.push(sql);
      if (sql.startsWith('INSERT') && ++inserts === 2) throw new Error('insert failed');
      return { rows: [{ id: inserts }] };
    },
    release() { released = true; },
  });
  await assert.rejects(createMapComposerRecords([
    { email: 'a@example.com', imageData: png }, { email: 'b@example.com', imageData: png },
  ], acquire), /insert failed/);
  assert.deepEqual(statements, ['BEGIN', 'INSERT INTO map_composer (email, image_data) VALUES ($1, $2) RETURNING id', 'INSERT INTO map_composer (email, image_data) VALUES ($1, $2) RETURNING id', 'ROLLBACK']);
  assert.equal(released, true);
});

test('repository commits all inserts together and returns distinct database IDs', async () => {
  const statements = [];
  let id = 100;
  let released = false;
  const records = await createMapComposerRecords([
    { email: 'a@example.com', imageData: png }, { email: 'b@example.com', imageData: png },
  ], async () => ({
    async query(sql) { statements.push(sql); return { rows: sql.startsWith('INSERT') ? [{ id: ++id }] : [] }; },
    release() { released = true; },
  }));
  assert.deepEqual(records, [{ id: 101 }, { id: 102 }]);
  assert.equal(statements[0], 'BEGIN');
  assert.equal(statements.at(-1), 'COMMIT');
  assert.equal(released, true);
});
