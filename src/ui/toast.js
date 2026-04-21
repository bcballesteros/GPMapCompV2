const MAX_VISIBLE_TOASTS = 3;
const DUPLICATE_COOLDOWN_MS = 1400;
const REMOVE_DELAY_MS = 220;
const activeToasts = new Map();
const recentToasts = new Map();

function buildToastKey(title, message, type) {
    return `${type}::${title}::${message}`;
}

function cleanupRecentToasts() {
    const now = Date.now();
    recentToasts.forEach((time, key) => {
        if (now - time > DUPLICATE_COOLDOWN_MS) {
            recentToasts.delete(key);
        }
    });
}

function removeToast(toast, immediate = false) {
    if (!toast || toast.dataset.removing === 'true') {
        return;
    }

    toast.dataset.removing = 'true';
    window.clearTimeout(Number(toast.dataset.timeoutId));
    activeToasts.delete(toast.dataset.toastKey);

    if (immediate) {
        toast.remove();
        return;
    }

    toast.classList.add('removing');
    window.setTimeout(() => {
        toast.remove();
    }, REMOVE_DELAY_MS);
}

function scheduleToastRemoval(toast, duration) {
    const timeoutId = window.setTimeout(() => removeToast(toast), duration);
    toast.dataset.timeoutId = String(timeoutId);
}

export function showToast(title, message = '', type = 'info', duration = 4000) {
    const container = document.getElementById('toastContainer');
    if (!container) {
        return null;
    }

    cleanupRecentToasts();

    const toastKey = buildToastKey(title, message, type);
    const existingToast = activeToasts.get(toastKey);
    if (existingToast?.isConnected) {
        existingToast.classList.remove('removing');
        window.clearTimeout(Number(existingToast.dataset.timeoutId));
        scheduleToastRemoval(existingToast, duration);
        recentToasts.set(toastKey, Date.now());
        return existingToast;
    }

    const lastShownAt = recentToasts.get(toastKey);
    if (lastShownAt && Date.now() - lastShownAt < DUPLICATE_COOLDOWN_MS) {
        return null;
    }

    while (container.children.length >= MAX_VISIBLE_TOASTS) {
        removeToast(container.firstElementChild, true);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.dataset.toastKey = toastKey;

    const icons = {
        success: '<i class="fas fa-check-circle"></i>',
        error: '<i class="fas fa-exclamation-circle"></i>',
        info: '<i class="fas fa-info-circle"></i>',
        warning: '<i class="fas fa-exclamation-triangle"></i>'
    };

    toast.innerHTML = `
        <div class="toast-icon">${icons[type] || icons.info}</div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            ${message ? `<div class="toast-message">${message}</div>` : ''}
        </div>
    `;

    container.appendChild(toast);
    activeToasts.set(toastKey, toast);
    recentToasts.set(toastKey, Date.now());
    scheduleToastRemoval(toast, duration);
    return toast;
}
