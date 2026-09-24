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

  const text = `A map has been shared with you. Open the link below to view the static map output:\n\n${safeShareUrl}`;
  const htmlUrl = escapeHtml(safeShareUrl);
  const html = `<p>A map has been shared with you.</p><p>Open the link below to view the static map output:</p><p><a href="${htmlUrl}">${htmlUrl}</a></p>`;

  try {
    return await transport.sendMail({
      from: configuration.from,
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
