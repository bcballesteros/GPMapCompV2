// One delegated controller per layer list; popup listeners live only while open.
const controllers = new WeakMap();
let activePicker = null;

export function normalizeHex(value) {
    const hex = String(value ?? '').trim().replace(/^#/, '');
    if (!/^(?:[\da-f]{3}|[\da-f]{6})$/i.test(hex)) return null;
    return `#${(hex.length === 3 ? [...hex].map(char => char + char).join('') : hex).toUpperCase()}`;
}

export function hexToHsv(hex) {
    const color = normalizeHex(hex);
    if (!color) return null;
    const [r, g, b] = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    let h = 0;
    if (delta) {
        h = max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
        h = (h * 60 + 360) % 360;
    }
    return { h, s: max ? delta / max * 100 : 0, v: max * 100 };
}

export function hsvToHex({ h, s, v }) {
    const saturation = s / 100, brightness = v / 100;
    const channel = offset => {
        const k = (offset + h / 60) % 6;
        return Math.round(255 * brightness * (1 - saturation * Math.max(0, Math.min(k, 4 - k, 1))))
            .toString(16).padStart(2, '0');
    };
    return `#${channel(5)}${channel(3)}${channel(1)}`.toUpperCase();
}

export function colorSwatchMarkup(kind, label, color, className = '') {
    const hex = normalizeHex(color) || '#000000';
    // kind, label and className are internal constants, color is validated above.
    return `<button type="button" class="vector-color-swatch ${className}" data-vector-color="${kind}" value="${hex}" style="background-color:${hex}" aria-label="${label}, ${hex}" aria-haspopup="dialog" aria-expanded="false" title="${label}"></button>`;
}

function syncSwatch(trigger, hex) {
    trigger.value = hex;
    trigger.style.backgroundColor = hex;
    trigger.setAttribute('aria-label', `${trigger.title}, ${hex}`);
}

function closePicker(restoreFocus = false) {
    if (!activePicker) return;
    const { trigger, popup, abort, observer } = activePicker;
    activePicker = null;
    abort.abort();
    observer.disconnect();
    popup.remove();
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-controls');
    if (restoreFocus && trigger.isConnected && !trigger.disabled) trigger.focus();
}

function openPicker(trigger, controller) {
    if (activePicker?.trigger === trigger) {
        closePicker(true);
        return;
    }
    closePicker();
    const hex = normalizeHex(controller.getColor(trigger)) || normalizeHex(trigger.value) || '#000000';
    syncSwatch(trigger, hex);
    let hsv = hexToHsv(hex);
    const popup = document.createElement('div');
    popup.className = 'vector-color-popup';
    popup.id = 'vector-color-popup';
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-label', trigger.title);
    popup.innerHTML = `
        <div class="vector-color-popup-header"><strong></strong><button type="button" class="vector-color-close" aria-label="Close color picker">×</button></div>
        <div class="vector-color-plane" aria-hidden="true"><span class="vector-color-cursor"></span></div>
        <div class="vector-color-tools"><button type="button" class="vector-color-eyedropper" aria-label="Sample a color from the screen" title="Sample a color"><svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path d="m14.7 6.3 3 3M5 19l3.2-.7 9.5-9.5a2.1 2.1 0 0 0-3-3l-9.5 9.5L5 19Zm0 0 2.8-2.8"/></svg></button><span class="vector-color-preview" aria-label="Selected color preview"></span><input class="vector-color-hue" type="range" min="0" max="360" step="1" aria-label="Hue"></div>
        <label class="vector-color-hex-row">HEX<input class="vector-color-hex" type="text" spellcheck="false" autocomplete="off" maxlength="7" aria-describedby="vector-color-error"></label>
        <div id="vector-color-error" class="vector-color-error" aria-live="polite"></div>`;
    popup.querySelector('strong').textContent = trigger.title;
    document.body.appendChild(popup);
    const abort = new AbortController();
    const listen = (target, type, handler, options = {}) => target.addEventListener(type, handler, { ...options, signal: abort.signal });
    const input = popup.querySelector('.vector-color-hex');
    const error = popup.querySelector('.vector-color-error');
    const plane = popup.querySelector('.vector-color-plane');
    const cursor = popup.querySelector('.vector-color-cursor');
    const hueRange = popup.querySelector('.vector-color-hue');
    const preview = popup.querySelector('.vector-color-preview');
    const eyedropper = popup.querySelector('.vector-color-eyedropper');
    const eyeDropperSupported = typeof window.EyeDropper === 'function';
    eyedropper.hidden = !eyeDropperSupported;
    const paint = (color, updateText = true) => {
        plane.style.backgroundColor = hsvToHex({ h: hsv.h, s: 100, v: 100 });
        cursor.style.left = `${hsv.s}%`;
        cursor.style.top = `${100 - hsv.v}%`;
        hueRange.value = hsv.h;
        preview.style.backgroundColor = color;
        if (updateText) input.value = color;
        input.setAttribute('aria-invalid', 'false');
        error.textContent = '';
    };
    const apply = (color, updateText = true) => {
        if (!trigger.isConnected || trigger.disabled) return closePicker();
        syncSwatch(trigger, color);
        controller.onChange(trigger);
        paint(color, updateText);
    };
    paint(hex);
    const position = () => {
        const rect = trigger.getBoundingClientRect();
        const width = popup.offsetWidth, height = popup.offsetHeight, padding = 12;
        const left = rect.right + 6 + width <= window.innerWidth - padding ? rect.right + 6 : rect.left - width - 6;
        popup.style.left = `${Math.max(padding, Math.min(left, window.innerWidth - width - padding))}px`;
        popup.style.top = `${Math.max(padding, Math.min(rect.top, window.innerHeight - height - padding))}px`;
    };
    const observer = new MutationObserver(() => {
        if (!trigger.isConnected || trigger.disabled || !trigger.getClientRects().length) closePicker();
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'disabled', 'hidden'] });
    activePicker = { trigger, popup, abort, observer };
    trigger.setAttribute('aria-expanded', 'true');
    trigger.setAttribute('aria-controls', popup.id);
    position();
    listen(window, 'resize', position);
    listen(document, 'scroll', position, { capture: true });
    listen(document, 'pointerdown', event => {
        if (!popup.contains(event.target) && !trigger.contains(event.target)) closePicker();
    }, { capture: true });
    listen(document, 'keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            closePicker(true);
        }
    }, { capture: true });
    listen(document, 'focusin', event => {
        if (!popup.contains(event.target) && event.target !== trigger) closePicker();
    });
    listen(popup, 'keydown', event => {
        if (event.key !== 'Tab') return;
        const controls = [...popup.querySelectorAll('button, input')];
        const boundary = event.shiftKey ? controls[0] : controls.at(-1);
        if (event.target === boundary) {
            event.preventDefault();
            closePicker(true);
        }
    });
    listen(popup.querySelector('.vector-color-close'), 'click', () => closePicker(true));
    listen(hueRange, 'input', () => {
        hsv.h = Number(hueRange.value);
        apply(hsvToHex(hsv));
    });
    if (eyeDropperSupported) listen(eyedropper, 'click', async () => {
        try {
            const result = await new window.EyeDropper().open();
            const color = normalizeHex(result.sRGBHex);
            if (color) { hsv = hexToHsv(color); apply(color); }
        } catch (error) {
            if (error?.name !== 'AbortError') console.warn('Unable to sample screen color.', error);
        }
    });
    const fromPointer = event => {
        const rect = plane.getBoundingClientRect();
        hsv.s = Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100));
        hsv.v = Math.max(0, Math.min(100, 100 - (event.clientY - rect.top) / rect.height * 100));
        apply(hsvToHex(hsv));
    };
    listen(plane, 'pointerdown', event => {
        if (event.button !== 0) return;
        event.preventDefault();
        plane.setPointerCapture(event.pointerId);
        fromPointer(event);
    });
    listen(plane, 'pointermove', event => {
        if (plane.hasPointerCapture(event.pointerId)) fromPointer(event);
    });
    listen(plane, 'pointerup', event => {
        if (plane.hasPointerCapture(event.pointerId)) plane.releasePointerCapture(event.pointerId);
    });
    listen(input, 'input', () => {
        const color = /^#?[\da-f]{6}$/i.test(input.value.trim()) ? normalizeHex(input.value) : null;
        if (!color) {
            input.setAttribute('aria-invalid', 'true');
            error.textContent = 'Enter six HEX digits, such as #2563EB.';
            return;
        }
        hsv = hexToHsv(color);
        apply(color, false);
    });
    listen(input, 'change', () => {
        const color = normalizeHex(input.value);
        if (color) input.value = color;
    });
}

export function bindVectorColorPickers(root, { getColor, onChange }) {
    const existing = controllers.get(root);
    if (existing) {
        Object.assign(existing, { getColor, onChange });
        return;
    }
    const controller = { root, getColor, onChange };
    controllers.set(root, controller);
    root.addEventListener('click', event => {
        const trigger = event.target.closest?.('[data-vector-color]');
        if (!trigger || !root.contains(trigger) || trigger.disabled) return;
        event.stopPropagation();
        openPicker(trigger, controller);
    });
}
