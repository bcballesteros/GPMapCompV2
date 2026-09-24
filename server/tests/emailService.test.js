import assert from 'node:assert/strict';
import test from 'node:test';

process.env.SMTP_HOST = 'smtp.example.test';
process.env.SMTP_PORT = '587';
process.env.SMTP_SECURE = 'false';
process.env.SMTP_USER = 'sender@example.test';
process.env.SMTP_PASSWORD = 'test-only-password';
process.env.SMTP_FROM = 'sender@example.test';

const { env } = await import('../config/env.js');
const {
  createEmailTransport,
  EmailConfigurationError,
  EmailDeliveryError,
  sendShareEmail,
} = await import('../services/emailService.js');

test('SMTP secure setting parses explicit false as false', () => {
  assert.equal(env.smtp.secure, false);
});

test('missing SMTP configuration fails only when transport is requested', () => {
  const original = env.smtp.host;
  env.smtp.host = '';
  try {
    assert.throws(createEmailTransport, EmailConfigurationError);
  } finally {
    env.smtp.host = original;
  }
});

test('invalid SMTP port and sender address fail configuration validation', () => {
  const originalPort = env.smtp.port;
  const originalFrom = env.smtp.from;
  try {
    env.smtp.port = 587.5;
    assert.throws(createEmailTransport, EmailConfigurationError);
    env.smtp.port = 587;
    env.smtp.from = 'not-an-email';
    assert.throws(createEmailTransport, EmailConfigurationError);
  } finally {
    env.smtp.port = originalPort;
    env.smtp.from = originalFrom;
  }
});

test('recipient and share URL are rejected before SMTP delivery', async () => {
  await assert.rejects(sendShareEmail({ recipientEmail: 'bad', shareUrl: 'https://example.test/share/x' }), EmailDeliveryError);
  for (const shareUrl of ['bad-url', 'javascript:alert(1)', 'data:text/plain,x', 'file:///tmp/map']) {
    await assert.rejects(sendShareEmail({ recipientEmail: 'recipient@example.test', shareUrl }), EmailDeliveryError);
  }
});

test('valid configuration creates a Nodemailer SMTP transport', () => {
  const transport = createEmailTransport();
  assert.equal(typeof transport.sendMail, 'function');
  assert.equal(typeof transport.verify, 'function');
  transport.close();
});
