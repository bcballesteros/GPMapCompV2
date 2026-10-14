const EMAIL_MAX_LENGTH = 254;
const LOCAL_MAX_LENGTH = 64;
const DOMAIN_LABEL_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;

// Structural validation only: mailbox existence is determined by the mail provider.
export function normalizeAndValidateEmail(value) {
    if (typeof value !== 'string') return null;
    const email = value.trim();
    if (!email || email.length > EMAIL_MAX_LENGTH || /\s/.test(email)) return null;
    const firstAt = email.indexOf('@');
    if (firstAt <= 0 || firstAt !== email.lastIndexOf('@')) return null;

    const local = email.slice(0, firstAt);
    const domain = email.slice(firstAt + 1);
    if (local.length > LOCAL_MAX_LENGTH || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return null;
    // Accept common dot-atom characters while rejecting separators and address syntax unsupported by this form.
    if (!/^[A-Za-z0-9!#$%&'*+\-/=?^_`{|}~.]+$/.test(local)) return null;
    const labels = domain.split('.');
    if (labels.length < 2 || labels.some(label => !label || label.length > 63 || !DOMAIN_LABEL_PATTERN.test(label))) return null;
    if (labels.at(-1).length < 2) return null;
    return email;
}

export function isValidEmail(value) {
    return normalizeAndValidateEmail(value) !== null;
}
