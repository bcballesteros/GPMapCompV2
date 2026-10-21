// Geometry is in CSS pixels; scale=1 maps one source pixel to one CSS pixel.
export function constrainPreview({ width, height, viewWidth, viewHeight, scale, x = 0, y = 0 }) {
    const fit = Math.min(viewWidth / width, viewHeight / height, 1);
    const minimum = Math.min(fit, 0.1);
    scale = Math.max(minimum, Math.min(8, Number.isFinite(scale) ? scale : fit));
    const bound = (offset, size, viewport) => size <= viewport
        ? (viewport - size) / 2 : Math.min(0, Math.max(viewport - size, offset));
    return { scale, x: bound(x, width * scale, viewWidth), y: bound(y, height * scale, viewHeight) };
}

const previews = new WeakMap();
let activeViewer = null;

// Each stable preview target owns a controller; both workflows use this viewer.
export function getMapPreviewViewer(target) {
    if (previews.has(target)) return previews.get(target);
    const owner = target.closest('.modal-overlay') || target.parentElement;
    let source = null;
    let message = 'Preparing map preview…';
    let session = null;
    target.setAttribute('role', 'button');
    target.tabIndex = 0;
    target.setAttribute('aria-label', 'Enlarge map preview');
    target.setAttribute('aria-haspopup', 'dialog');
    target.setAttribute('aria-disabled', 'true');
    target.title = 'Enlarge map preview';
    target.classList.add('map-preview-trigger');

    function open() {
        if (!source || !owner.isConnected || session) return;
        activeViewer?.close();
        const dialog = document.createElement('dialog');
        dialog.className = 'map-preview-viewer';
        dialog.setAttribute('aria-label', 'Enlarged map preview');
        dialog.setAttribute('aria-modal', 'true');
        dialog.innerHTML = `<div class="map-preview-toolbar" role="group" aria-label="Preview navigation">
            <button type="button" data-action="out" aria-label="Zoom out">−</button>
            <output aria-label="Zoom percentage"></output>
            <button type="button" data-action="in" aria-label="Zoom in">+</button>
            <button type="button" data-action="fit">Fit to Window</button>
            <button type="button" data-action="actual" aria-label="Show image at 100%">100%</button>
            <button type="button" data-action="close" aria-label="Close enlarged map preview" autofocus>Close ×</button>
        </div><div class="map-preview-stage" tabindex="0" role="group" aria-label="Map image. Drag to pan or use arrow keys; scroll to zoom."></div>
        <div class="map-preview-status" role="status"></div>`;
        const stage = dialog.querySelector('.map-preview-stage');
        const status = dialog.querySelector('.map-preview-status');
        const percentage = dialog.querySelector('output');
        const abort = new AbortController();
        const listen = (node, type, callback, options = {}) => node.addEventListener(type, callback, { ...options, signal: abort.signal });
        let geometry = { scale: 1, x: 0, y: 0 };
        let fitMode = true;
        let drag = null;
        let displayed = null;
        let originalStyle = '';
        let thumbnail = null;
        const overflow = document.body.style.overflow;

        function release() {
            if (!displayed) return;
            displayed.style.cssText = originalStyle;
            if (displayed === source && target.isConnected) target.replaceChildren(displayed);
            else displayed.remove();
            thumbnail?.remove();
            displayed = thumbnail = null;
        }
        function paint() {
            if (!displayed || !stage.clientWidth || !stage.clientHeight) return;
            geometry = constrainPreview({ width: displayed.width, height: displayed.height,
                viewWidth: stage.clientWidth, viewHeight: stage.clientHeight, ...geometry });
            displayed.style.transform = `translate(${geometry.x}px, ${geometry.y}px) scale(${geometry.scale})`;
            percentage.textContent = `${Math.round(geometry.scale * 100)}%`;
            stage.classList.toggle('can-pan', displayed.width * geometry.scale > stage.clientWidth || displayed.height * geometry.scale > stage.clientHeight);
        }
        function fit() {
            if (!displayed) return;
            fitMode = true;
            geometry = { scale: Math.min(stage.clientWidth / displayed.width, stage.clientHeight / displayed.height, 1), x: 0, y: 0 };
            paint();
        }
        function zoom(scale, px = stage.clientWidth / 2, py = stage.clientHeight / 2) {
            if (!displayed) return;
            fitMode = false;
            const next = constrainPreview({ width: displayed.width, height: displayed.height,
                viewWidth: stage.clientWidth, viewHeight: stage.clientHeight, scale }).scale;
            geometry = { scale: next, x: px - (px - geometry.x) * next / geometry.scale,
                y: py - (py - geometry.y) * next / geometry.scale };
            paint();
        }
        function refresh() {
            if (drag && stage.hasPointerCapture(drag.id)) stage.releasePointerCapture(drag.id);
            drag = null;
            stage.classList.remove('dragging');
            release();
            status.textContent = source ? '' : message;
            stage.setAttribute('aria-busy', !source && message === 'Preparing map preview…' ? 'true' : 'false');
            dialog.querySelectorAll('button:not([data-action="close"])').forEach(button => { button.disabled = !source; });
            percentage.textContent = '—';
            if (!source) return;
            // Keep the small preview visible using only a display-sized copy.
            // The original full-resolution canvas is moved, never encoded/copied.
            const rect = target.getBoundingClientRect();
            const ratio = Math.min(rect.width / source.width, rect.height / source.height, 1);
            thumbnail = document.createElement('canvas');
            thumbnail.width = Math.max(1, Math.round(source.width * ratio));
            thumbnail.height = Math.max(1, Math.round(source.height * ratio));
            thumbnail.style.cssText = source.style.cssText;
            thumbnail.setAttribute('aria-hidden', 'true');
            thumbnail.getContext('2d').drawImage(source, 0, 0, thumbnail.width, thumbnail.height);
            displayed = source;
            originalStyle = source.style.cssText;
            target.replaceChildren(thumbnail);
            stage.replaceChildren(displayed);
            displayed.style.cssText = 'position:absolute;left:0;top:0;max-width:none;max-height:none;transform-origin:0 0;pointer-events:none';
            fit();
        }
        function close() {
            if (!session) return;
            abort.abort();
            resize.disconnect();
            ownerObserver.disconnect();
            release();
            dialog.close();
            dialog.remove();
            document.body.style.overflow = overflow;
            session = null;
            activeViewer = null;
            if (target.isConnected && owner.classList.contains('active')) target.focus({ preventScroll: true });
        }
        listen(dialog, 'click', event => {
            switch (event.target.closest('button')?.dataset.action) {
                case 'close': close(); break;
                case 'in': zoom(geometry.scale * 1.25); break;
                case 'out': zoom(geometry.scale / 1.25); break;
                case 'fit': fit(); break;
                case 'actual': zoom(1); break;
            }
        });
        listen(dialog, 'cancel', event => { event.preventDefault(); close(); });
        listen(dialog, 'close', close);
        listen(dialog, 'keydown', event => {
            // Capture before the application's window Escape dismissal listener.
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
            if (event.key === 'Tab') {
                const controls = [...dialog.querySelectorAll('button:not(:disabled), [tabindex="0"]')];
                const first = controls[0], last = controls.at(-1);
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            }
            if (event.target !== stage) return;
            const delta = { ArrowLeft: [60, 0], ArrowRight: [-60, 0], ArrowUp: [0, 60], ArrowDown: [0, -60] }[event.key];
            if (delta) { event.preventDefault(); fitMode = false; geometry.x += delta[0]; geometry.y += delta[1]; paint(); }
        }, { capture: true });
        listen(stage, 'wheel', event => {
            event.preventDefault();
            const rect = stage.getBoundingClientRect();
            const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1);
            zoom(geometry.scale * Math.exp(-Math.max(-250, Math.min(250, delta)) * 0.002), event.clientX - rect.left, event.clientY - rect.top);
        }, { passive: false });
        listen(stage, 'pointerdown', event => {
            if (event.button !== 0 || !displayed || drag || !stage.classList.contains('can-pan')) return;
            event.preventDefault();
            fitMode = false;
            drag = { id: event.pointerId, x: event.clientX, y: event.clientY, start: { ...geometry } };
            stage.setPointerCapture(event.pointerId);
            stage.classList.add('dragging');
        });
        listen(stage, 'pointermove', event => {
            if (!drag || event.pointerId !== drag.id) return;
            geometry.x = drag.start.x + event.clientX - drag.x;
            geometry.y = drag.start.y + event.clientY - drag.y;
            paint();
        });
        for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(stage, type, event => {
            if (drag?.id !== event.pointerId) return;
            drag = null;
            stage.classList.remove('dragging');
            if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
        });
        const resize = new ResizeObserver(() => { if (fitMode) fit(); else paint(); });
        const ownerObserver = new MutationObserver(() => {
            if (!owner.isConnected || !target.isConnected || !owner.classList.contains('active') || !owner.classList.contains('visible')) close();
        });
        session = { close, refresh };
        activeViewer = session;
        document.body.appendChild(dialog);
        dialog.showModal();
        document.body.style.overflow = 'hidden';
        refresh();
        resize.observe(stage);
        ownerObserver.observe(owner, { attributes: true, attributeFilter: ['class'] });
        ownerObserver.observe(document.body, { childList: true, subtree: true });
    }
    target.addEventListener('click', open);
    target.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
    });
    const controller = {
        setContent(canvas, text = 'Preparing map preview…') {
            source = canvas;
            message = text;
            target.setAttribute('aria-disabled', canvas ? 'false' : 'true');
            session?.refresh();
        },
        close: () => session?.close()
    };
    previews.set(target, controller);
    return controller;
}
