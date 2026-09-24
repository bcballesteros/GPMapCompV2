import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

const EMAIL_PATTERN = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]{2,}$/;

export class EmailConfigurationError extends Error {
  constructor() {
    super('Email delivery is not configured correctly.');
    this.name = 'EmailConfigurationError';
  }
}

export class EmailDeliveryError extends Error {
  constructor() {
    super('The email could not be sent.');
    this.name = 'EmailDeliveryError';
  }
}

function requireEmail(value, ErrorType = EmailConfigurationError) {
  if (typeof value !== 'string') throw new ErrorType();
  const email = value.trim();
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) throw new ErrorType();
  return email;
}

function validateConfiguration() {
  const { host, port, secure, user, password, from } = env.smtp;
  if ([host, user, password, from].some((value) => typeof value !== 'string' || value.trim() === '')
      || !Number.isInteger(port) || port < 1 || port > 65535
      || typeof secure !== 'boolean') {
    throw new EmailConfigurationError();
  }

  let sender;
  try {
    sender = requireEmail(from);
  } catch {
    throw new EmailConfigurationError();
  }

  return { host: host.trim(), port, secure, user, password, from: sender };
}

export function validateEmailConfiguration() {
  validateConfiguration();
}

function validateShareUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') throw new EmailDeliveryError();
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new EmailDeliveryError();
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw new EmailDeliveryError();
  }
  return url.href;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

export function createEmailTransport() {
  const configuration = validateConfiguration();
  return nodemailer.createTransport({
    host: configuration.host,
    port: configuration.port,
    secure: configuration.secure,
    auth: {
      user: configuration.user,
      pass: configuration.password,
    },
  });
}

export async function sendShareEmail({ recipientEmail, shareUrl } = {}) {
  const recipient = requireEmail(recipientEmail, EmailDeliveryError);
  const safeShareUrl = validateShareUrl(shareUrl);
  const configuration = validateConfiguration();
  const transport = nodemailer.createTransport({
    host: configuration.host,
    port: configuration.port,
    secure: configuration.secure,
    auth: { user: configuration.user, pass: configuration.password },
  });

  const text = `Geoportal Philippines Map Composer\n\nA map has been shared with you\n\nA static map output has been shared with you through Geoportal Philippines Map Composer.\n\nView Shared Map:\n${safeShareUrl}\n\nShared maps are static snapshots of the current map composition and cannot be edited by recipients.\n\nGeoportal Philippines\nNational Mapping and Resource Information Authority (NAMRIA)`;
  const htmlUrl = escapeHtml(safeShareUrl);
  const html = `<!doctype html><html><body style="margin:0;padding:0;background-color:#f3f5f7;font-family:Arial,Helvetica,sans-serif;color:#24313d;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f5f7;padding:32px 12px;"><tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border:1px solid #dce2e7;">
        <tr><td style="padding:24px 32px;border-bottom:1px solid #e5e9ed;font-size:16px;font-weight:bold;color:#174a68;">Geoportal Philippines Map Composer</td></tr>
        <tr><td style="padding:32px;font-size:15px;line-height:1.6;">
          <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#183b50;">A map has been shared with you</h1>
          <p style="margin:0 0 24px;">A static map output has been shared with you through Geoportal Philippines Map Composer.</p>
          <p style="margin:0 0 24px;"><a href="${htmlUrl}" style="display:inline-block;padding:12px 22px;background-color:#176b87;color:#ffffff;text-decoration:none;font-weight:bold;border-radius:4px;">View Shared Map</a></p>
          <p style="margin:0 0 8px;font-size:13px;color:#465663;">If the button does not work, open this link:</p>
          <p style="margin:0 0 24px;font-size:13px;overflow-wrap:anywhere;"><a href="${htmlUrl}" style="color:#145d78;text-decoration:underline;">${htmlUrl}</a></p>
          <p style="margin:0;font-size:13px;line-height:1.5;color:#465663;">Shared maps are static snapshots of the current map composition and cannot be edited by recipients.</p>
        </td></tr>
        <tr><td style="padding:20px 32px;background-color:#f7f9fa;font-size:13px;line-height:1.5;color:#465663;">Geoportal Philippines<br>National Mapping and Resource Information Authority (NAMRIA)</td></tr>
      </table>
    </td></tr></table>
  </body></html>`;

  try {
    return await transport.sendMail({
      from: { name: 'Geoportal Philippines Map Composer', address: configuration.from },
      to: recipient,
      subject: 'Geoportal Philippines Map Composer - Shared Map',
      text,
      html,
    });
  } catch {
    throw new EmailDeliveryError();
  }
}

export async function verifyEmailTransport() {
  const transport = createEmailTransport();
  try {
    await transport.verify();
    return true;
  } catch {
    throw new EmailDeliveryError();
  }
}
