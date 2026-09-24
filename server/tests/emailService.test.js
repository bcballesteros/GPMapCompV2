import assert from 'node:assert/strict';
import test from 'node:test';
import net from 'node:net';

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

async function withSmtpCapture(run) {
  let captured = '';
  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    socket.write('220 localhost ESMTP\r\n');
    let dataMode = false;
    socket.on('data', (chunk) => {
      if (dataMode) {
        captured += chunk;
        if (captured.includes('\r\n.\r\n')) {
          captured = captured.slice(0, captured.indexOf('\r\n.\r\n'));
          dataMode = false;
          socket.write('250 message accepted\r\n');
        }
        return;
      }
      for (const line of chunk.split(/\r?\n/)) {
        if (/^EHLO /i.test(line) || /^HELO /i.test(line)) socket.write('250-localhost\r\n250 OK\r\n');
        else if (/^MAIL FROM:/i.test(line) || /^RCPT TO:/i.test(line)) socket.write('250 OK\r\n');
        else if (/^DATA$/i.test(line)) { captured = ''; dataMode = true; socket.write('354 End data with <CR><LF>.<CR><LF>\r\n'); }
        else if (/^QUIT$/i.test(line)) socket.end('221 Bye\r\n');
      }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const original = { host: env.smtp.host, port: env.smtp.port, secure: env.smtp.secure, user: env.smtp.user, password: env.smtp.password };
  const address = server.address();
  Object.assign(env.smtp, { host: '127.0.0.1', port: address.port, secure: false, user: 'test', password: 'test' });
  try {
    await run(() => {
      const normalized = captured.replace(/=\r\n/g, '');
      const decodeQuotedPrintable = (value) => value.replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
      const parts = normalized.split(/(?=Content-Type: text\/(?:plain|html);)/);
      const decoded = parts.map((part) => decodeQuotedPrintable(part));
      return { raw: captured, text: decoded.find((part) => part.includes('Content-Type: text/plain;')) ?? '', html: decoded.find((part) => part.includes('Content-Type: text/html;')) ?? '' };
    });
  }
  finally {
    Object.assign(env.smtp, original);
    await new Promise((resolve) => server.close(resolve));
  }
}

test('share email has branded sender, transactional HTML, and complete plain text', async () => {
  const shareUrl = 'https://maps.example.test/share/opaque-token';
  await withSmtpCapture(async (getCaptured) => {
    await sendShareEmail({ recipientEmail: 'recipient@example.test', shareUrl });
    const message = getCaptured();
    assert.match(message.raw, /From: Geoportal Philippines Map Composer <sender@example\.test>/);
    assert.match(message.raw, /Subject: Geoportal Philippines Map Composer - Shared Map/);
    assert.match(message.html, /View Shared Map/);
    assert.match(message.html, new RegExp(shareUrl));
    assert.match(message.html, /Shared maps are static snapshots of the current map composition and cannot be edited by recipients\./);
    assert.match(message.text, /Geoportal Philippines Map Composer/);
    assert.match(message.text, /A map has been shared with you/);
    assert.match(message.text, new RegExp(shareUrl));
    assert.match(message.text, /Shared maps are static snapshots of the current map composition and cannot be edited by recipients\./);
    assert.match(message.text, /Geoportal Philippines[\s\S]*National Mapping and Resource Information Authority \(NAMRIA\)/);
    assert.match(message.html, /Geoportal Philippines[\s\S]*National Mapping and Resource Information Authority \(NAMRIA\)/);
  });
});

test('HTML escapes the validated URL before inserting it into markup', async () => {
  const shareUrl = 'https://maps.example.test/share/token?x=1&y=2';
  await withSmtpCapture(async (getCaptured) => {
    await sendShareEmail({ recipientEmail: 'recipient@example.test', shareUrl });
    const message = getCaptured();
    assert.match(message.html, /x=1&amp;y=2/);
    assert.match(message.text, /x=1&y=2/);
  });
});

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
