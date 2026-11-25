import assert from 'node:assert/strict';
import test from 'node:test';
import net from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

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

function readMimeBody(raw, type) {
  const start = raw.indexOf(`Content-Type: ${type};`);
  assert.notEqual(start, -1);
  const headerEnd = raw.indexOf('\r\n\r\n', start);
  const headers = raw.slice(start, headerEnd);
  const bodyStart = headerEnd + 4;
  const bodyEnd = raw.indexOf('\r\n----', bodyStart);
  assert.ok(headerEnd > start && bodyEnd > bodyStart);
  const body = raw.slice(bodyStart, bodyEnd);
  const encoding = headers.match(/Content-Transfer-Encoding: ([\w-]+)/i)?.[1];
  if (encoding === 'base64') return Buffer.from(body, 'base64').toString('utf8');
  if (encoding === 'quoted-printable') {
    const bytes = body.replace(/=\r\n/g, '')
      .replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
    return Buffer.from(bytes, 'latin1').toString('utf8');
  }
  return body;
}

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
      const raw = captured.replace(/^\.\./gm, '.');
      return {
        raw,
        text: readMimeBody(raw, 'text/plain').replace(/\r\n/g, '\n'),
        html: readMimeBody(raw, 'text/html'),
      };
    });
  }
  finally {
    Object.assign(env.smtp, original);
    await new Promise((resolve) => server.close(resolve));
  }
}

test('share email has branded sender, CID logo, one secure HTML link, and concise plain text', async () => {
  const shareUrl = 'https://maps.example.test/share/opaque-token';
  await withSmtpCapture(async (getCaptured) => {
    await sendShareEmail({ recipientEmail: 'recipient@example.test', shareUrl });
    const message = getCaptured();
    assert.match(message.raw, /From: Geoportal Philippines Map Composer <sender@example\.test>/);
    assert.match(message.raw, /Subject: Geoportal Philippines Map Composer - Shared Map/);
    assert.match(message.html, /View Shared Map/);
    assert.match(message.html, /src="cid:geoportal-philippines-logo"/);
    assert.match(message.html, /bgcolor="#0B1421" style="padding:10px 24px;background-color:#0B1421;/);
    assert.doesNotMatch(message.html, /height="6" bgcolor="#0B1421"|padding:10px 24px;background-color:#ffffff/);
    assert.match(message.html, /width="34" alt="Geoportal Philippines logo" style="display:block;width:34px;height:auto;border:0;"/);
    assert.match(message.html, /color:#ffffff;font-size:15px;line-height:1\.3;font-weight:600;">Geoportal Philippines Map Composer<\/td>/);
    assert.doesNotMatch(message.html, /<div[^>]*>Geoportal Philippines<\/div><div[^>]*>Map Composer<\/div>/);
    assert.match(message.raw, /Content-ID: <geoportal-philippines-logo>/i);
    assert.match(message.raw, /filename="?gplogo\.png"?/i);
    assert.match(message.html, /alt="Geoportal Philippines logo"/);
    assert.equal((message.html.match(/href="/g) ?? []).length, 1);
    assert.match(message.html, new RegExp(`href="${shareUrl}"`));
    assert.doesNotMatch(message.html, /If the button does not work|open this link/i);
    assert.match(message.html, /A map has been shared with you through Geoportal Philippines Map Composer\./);
    assert.doesNotMatch(message.html, /A static map output has been shared/);
    assert.match(message.html, /Shared maps are snapshots of the current map composition and cannot be edited by recipients\./);
    assert.match(message.text, /Geoportal Philippines Map Composer/);
    assert.match(message.text, /A map has been shared with you/);
    assert.match(message.text, /A map has been shared with you through Geoportal Philippines Map Composer\./);
    assert.doesNotMatch(message.text, /https?:\/\/|View Shared Map:/);
    assert.doesNotMatch(message.text, /A static map output has been shared/);
    assert.match(message.text, /Shared maps are snapshots of the current map composition and cannot be edited by recipients\./);
    assert.match(message.text, /Geoportal Philippines[\s\S]*National Mapping and Resource Information Authority \(NAMRIA\)/);
    assert.match(message.html, /Geoportal Philippines[\s\S]*National Mapping and Resource Information Authority \(NAMRIA\)/);
    assert.doesNotMatch(message.html, /Message from sender/);
    assert.doesNotMatch(message.text, /Message from sender/);
  });
});

test('HTML escapes the validated URL before inserting it into markup', async () => {
  const shareUrl = 'https://maps.example.test/share/token?x=1&y=2';
  await withSmtpCapture(async (getCaptured) => {
    await sendShareEmail({ recipientEmail: 'recipient@example.test', shareUrl });
    const message = getCaptured();
    assert.match(message.html, /x=1&amp;y=2/);
    assert.match(message.html, /href="https:\/\/maps\.example\.test\/share\/token\?x=1&amp;y=2"/);
  });
});

test('local SMTP captures both email bodies with safely rendered sender remarks', async () => {
  const shareUrl = 'https://maps.example.test/share/opaque-token';
  const email = { recipientEmail: 'recipient@example.test', shareUrl };
  const longWord = 'x'.repeat(500);
  const remarks = 'Mabuhay, team! 🌏\n\nReview  the mapped areas.\n<script>alert("test")</script> & <b>Bay</b> \'quoted\'';
  const escaped = 'Mabuhay, team! 🌏<br><br>Review  the mapped areas.<br>&lt;script&gt;alert(&quot;test&quot;)&lt;/script&gt; &amp; &lt;b&gt;Bay&lt;/b&gt; &#39;quoted&#39;';
  await withSmtpCapture(async (getCaptured) => {
    await sendShareEmail(email);
    const baseline = getCaptured();
    await sendShareEmail({ ...email, customMessage: '' });
    const blank = getCaptured();
    assert.equal(blank.text, baseline.text);
    assert.equal(blank.html, baseline.html);
    for (const [customMessage, expectedHtml] of [
      ['Please review the map.', 'Please review the map.'],
      [remarks, escaped],
      [longWord, longWord],
    ]) {
      await sendShareEmail({ ...email, customMessage });
      const message = getCaptured();
      assert.match(message.raw, /From: Geoportal Philippines Map Composer <sender@example\.test>/);
      assert.match(message.raw, /Subject: Geoportal Philippines Map Composer - Shared Map/);
      assert.match(message.raw, /Content-ID: <geoportal-philippines-logo>/i);
      assert.doesNotMatch(message.html, /<script\b|<b>Bay<\/b>/i);
      const block = message.html.match(/\r?\n +<div[^>]*>\s*<h2[^>]*>Message from sender<\/h2>\s*(<p[^>]*>.*<\/p>)\s*<\/div>/);
      assert.ok(block);
      assert.ok(block[1].includes(`>${expectedHtml}</p>`));
      assert.match(block[1], /word-wrap:break-word;word-break:break-word;overflow-wrap:anywhere;/);
      assert.ok(message.html.indexOf('Map Composer.</p>') < block.index);
      assert.ok(block.index < message.html.indexOf('View Shared Map'));
      assert.equal(message.html.replace(block[0], ''), baseline.html);
      assert.equal(message.text, baseline.text.replace('View Shared Map', `Message from sender\n\n${customMessage}\n\nView Shared Map`));

      const directory = process.env.SHARE_EMAIL_ARTIFACT_DIR;
      if (directory && customMessage === remarks) {
        await mkdir(directory, { recursive: true });
        await writeFile(join(directory, 'share-email.html'), `\uFEFF${message.html}`);
      }
    }
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
  await assert.rejects(sendShareEmail({ recipientEmail: 'a..b@example.com', shareUrl: 'https://example.test/share/x' }), EmailDeliveryError);
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
