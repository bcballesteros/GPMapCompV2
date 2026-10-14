export const RECIPIENT_LIMIT_MESSAGE = 'You can share a map with up to 5 recipients at a time.';
import { normalizeAndValidateEmail } from '../services/email-validation.js';

// Keep aligned with validateEmail in server/services/shareService.js.
export function validateRecipients(values, { required = false } = {}) {
    const emails = values.map(value => value.trim());
    if (emails.length > 5) throw new Error(RECIPIENT_LIMIT_MESSAGE);
    if (required && !emails.length) throw new Error('Enter at least one recipient email address.');
    const seen = new Set();
    for (const email of emails) {
        if (normalizeAndValidateEmail(email) === null) {
            throw new Error(`Enter a valid recipient email address${email ? `: ${email}` : ''}.`);
        }
        const key = email.toLowerCase();
        if (seen.has(key)) throw new Error(`Duplicate recipient: ${email}.`);
        seen.add(key);
    }
    return emails;
}

export function splitRecipients(text) {
    return text.split(/[,;\s]+/).filter(Boolean);
}

export function createRecipientChips({ container, input, onFeedback }) {
    let emails = [];
    let editing = null;
    let disabled = false;
    const report = (message = '') => {
        input.setAttribute('aria-invalid', message ? 'true' : 'false');
        editing?.input.setAttribute('aria-invalid', message ? 'true' : 'false');
        onFeedback(message);
    };
    function render() {
        input.placeholder = emails.length ? '' : 'recipient@example.com';
        container.querySelectorAll('.recipient-chip').forEach(chip => chip.remove());
        emails.forEach((email, index) => {
            const chip = document.createElement('span');
            chip.className = 'recipient-chip';
            const label = document.createElement('span');
            label.className = 'recipient-chip-label';
            label.textContent = email;
            label.title = email;
            label.tabIndex = disabled ? -1 : 0;
            label.setAttribute('role', 'button');
            label.setAttribute('aria-label', `Edit ${email}`);
            const edit = () => {
                if (disabled || (editing && !saveEdit())) return;
                const editor = document.createElement('input');
                editor.className = 'recipient-chip-editor';
                editor.value = email;
                editor.setAttribute('aria-label', `Edit ${email}`);
                editor.setAttribute('aria-describedby', 'shareFeedback');
                label.replaceWith(editor);
                editing = { index, input: editor };
                editor.addEventListener('keydown', event => {
                    if (event.isComposing) return;
                    if (event.key === 'Enter') { event.preventDefault(); if (saveEdit()) input.focus(); }
                    if (event.key === 'Escape') {
                        event.preventDefault(); event.stopPropagation();
                        editing = null; render(); report(); input.focus();
                    }
                });
                editor.addEventListener('blur', () => saveEdit());
                editor.focus(); editor.select();
            };
            label.addEventListener('dblclick', edit);
            label.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); edit(); }
            });
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'recipient-chip-remove';
            remove.textContent = '×';
            remove.disabled = disabled;
            remove.setAttribute('aria-label', `Remove ${email}`);
            remove.addEventListener('mousedown', event => event.preventDefault());
            remove.addEventListener('click', () => {
                // Removing an invalid edit is allowed too.
                if (editing && editing.index !== index && !saveEdit()) return;
                editing = null; emails.splice(index, 1); render(); report(); input.focus();
            });
            chip.append(label, remove);
            container.insertBefore(chip, input);
        });
    }
    function saveEdit() {
        if (!editing) return true;
        try {
            const next = [...emails];
            next[editing.index] = editing.input.value;
            emails = validateRecipients(next);
            editing = null; render(); report();
            return true;
        } catch (error) { report(error.message); return false; }
    }
    function commit() {
        if (!saveEdit()) return false;
        try {
            emails = validateRecipients([...emails, ...splitRecipients(input.value)]);
            input.value = ''; render(); report();
            return true;
        } catch (error) { report(error.message); return false; }
    }
    input.addEventListener('keydown', event => {
        if (disabled || event.isComposing) return;
        if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); commit(); }
        if (event.key === 'Backspace' && !input.value && !editing) {
            emails.pop(); render(); report();
        }
    });
    input.addEventListener('input', () => {
        if (!disabled && /[,;]/.test(input.value)) commit();
    });
    input.addEventListener('paste', event => {
        if (disabled) return;
        event.preventDefault();
        // Text inputs strip newlines on assignment; preserve them as separators.
        const pasted = event.clipboardData.getData('text').replace(/\r\n?|\n/g, ' ');
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? start;
        input.value = input.value.slice(0, start) + pasted + input.value.slice(end);
        // A rejected batch stays intact and editable, with no partial additions.
        commit();
    });
    container.addEventListener('click', event => { if (event.target === container) input.focus(); });
    render();
    return {
        getRecipients() {
            if (!commit()) { (editing?.input || input).focus(); return null; }
            try { return validateRecipients(emails, { required: true }); }
            catch (error) { report(error.message); input.focus(); return null; }
        },
        removeDelivered(delivered) {
            const sent = new Set(delivered.map(email => email.toLowerCase()));
            emails = emails.filter(email => !sent.has(email.toLowerCase()));
            render();
        },
        setDisabled(value) {
            disabled = value; input.disabled = value; render();
        }
    };
}
