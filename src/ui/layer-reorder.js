// Native desktop drag/drop only; map and panel order change on valid drop.
export function bindLayerReorder(body, { getOrder, getLayer, commit, onDragState = () => {} }) {
    let session = null;
    let frame = 0;
    const animations = new Map();
    const cards = () => [...body.children].filter(card => card.classList.contains('layer-item'));
    const snapshotPositions = () => new Map(cards().map(card => [card, card.getBoundingClientRect().top]));
    const animatedTranslateY = card => {
        const translate = getComputedStyle(card).translate;
        return typeof translate === 'string' && translate !== 'none'
            ? Number.parseFloat(translate.trim().split(/\s+/).at(-1)) || 0
            : 0;
    };
    const cancelAnimations = animations => {
        animations.forEach(animation => animation.cancel());
        animations.clear();
    };
    const animatePositions = (before, animations) => {
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || typeof Element.prototype.animate !== 'function') return;
        for (const card of cards()) {
            const oldTop = before.get(card);
            if (oldTop === undefined) continue;
            const offset = oldTop - card.getBoundingClientRect().top;
            if (Math.abs(offset) < 0.5) continue;
            let animation;
            try {
                animation = card.animate([
                    { translate: `0px ${offset}px` },
                    { translate: '0px 0px' }
                ], { duration: 170, easing: 'cubic-bezier(0.2, 0.7, 0.25, 1)' });
            } catch {
                continue;
            }
            animations.set(card, animation);
            animation.onfinish = animation.oncancel = () => {
                if (animations.get(card) === animation) animations.delete(card);
            };
        }
    };
    const finish = (save = false) => {
        if (!session) return;
        const { card, layer, original, index, gap, preview } = session;
        session = null;
        cancelAnimationFrame(frame);
        frame = 0;
        cancelAnimations(animations);
        const current = getOrder();
        const valid = index !== null && original.length === current.length && original.every((layer, i) => layer === current[i]);
        const committedDrop = save && valid;
        // A successful commit changes the map order synchronously. The source
        // card is still fixed offscreen at this point, so using its position as
        // a FLIP origin would animate it into view after it is restored.
        const before = committedDrop ? null : snapshotPositions();
        gap.remove();
        preview.remove();
        card.classList.remove('layer-dragging');
        card.classList.remove('layer-drag-source');
        onDragState(committedDrop ? 'end' : 'cancel', card);
        if (committedDrop) {
            const next = original.filter(item => item !== layer);
            next.splice(index, 0, layer);
            commit(next);
        }
        // Keep the return animation on cancellation. A committed drop is
        // already at its final DOM position after commit() and must appear there
        // immediately, without a second FLIP pass.
        if (before) animatePositions(before, animations);
    };
    const start = (card, event) => {
        finish();
        cancelAnimations(animations);
        const original = getOrder();
        const layer = getLayer(card);
        const rect = card.getBoundingClientRect();
        // Keep the visual independent of the source's collapsed/hidden styles.
        // Native drag images are captured after dragstart, not at setDragImage().
        const preview = card.cloneNode(true);
        preview.classList.add('layer-drag-preview');
        preview.setAttribute('aria-hidden', 'true');
        preview.inert = true;
        for (const node of [preview, ...preview.querySelectorAll('[id]')]) node.removeAttribute('id');
        preview.style.width = `${rect.width}px`;
        preview.style.height = `${rect.height}px`;
        document.body.appendChild(preview);
        const offsetX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
        const offsetY = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
        const gap = document.createElement('div');
        gap.className = 'layer-drop-gap';
        gap.setAttribute('aria-hidden', 'true');
        gap.style.height = `${rect.height}px`;
        session = { card, layer, original, index: original.indexOf(layer), x: event.clientX, y: event.clientY, gap, preview, offsetX, offsetY, positioned: false, overList: false };
        movePreview(event);
        card.classList.add('layer-dragging');
        onDragState('start', card);
    };
    const movePreview = event => {
        if (!session) return;
        // Keep the name readable when the handle is dragged against a window edge.
        const x = Math.max(0, Math.min(window.innerWidth - parseFloat(session.preview.style.width), event.clientX - session.offsetX));
        const y = Math.max(0, Math.min(window.innerHeight - parseFloat(session.preview.style.height), event.clientY - session.offsetY));
        session.preview.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    };
    const feedback = () => {
        if (!session || session.index === null) return;
        const remaining = cards().filter(card => card !== session.card);
        const target = remaining[session.index];
        const alreadyPositioned = session.gap.parentElement === body &&
            (target ? session.gap.nextElementSibling === target : session.gap === body.lastElementChild);
        if (alreadyPositioned) return;
        cancelAnimations(animations);
        const before = snapshotPositions();
        if (target && session.gap.nextElementSibling !== target) body.insertBefore(session.gap, target);
        else if (!target && session.gap !== body.lastElementChild) body.appendChild(session.gap);
        session.positioned = true;
        animatePositions(before, animations);
    };
    const targetAt = (x, y) => {
        if (!session) return;
        if (!session.overList) {
            session.index = null;
            session.gap.remove();
            return;
        }
        const remaining = cards().filter(card => card !== session.card);
        const nextIndex = remaining.filter(card => {
            const rect = card.getBoundingClientRect();
            return y > rect.top - animatedTranslateY(card) + rect.height / 2;
        }).length;
        if (session.positioned && session.index !== null && nextIndex !== session.index) {
            const boundaryCard = remaining[nextIndex > session.index ? session.index : session.index - 1];
            if (boundaryCard) {
                const rect = boundaryCard.getBoundingClientRect();
                const midpoint = rect.top - animatedTranslateY(boundaryCard) + rect.height / 2;
                if (nextIndex > session.index && y < midpoint + 6) return;
                if (nextIndex < session.index && y > midpoint - 6) return;
            }
        }
        if (session.positioned && nextIndex === session.index) return;
        session.index = nextIndex;
        feedback();
    };
    const updateDragPosition = () => {
        frame = 0;
        if (!session) return;
        const container = body.closest('.sidebar-main');
        let scrolling = false;
        if (container && session.overList) {
            const rect = container.getBoundingClientRect();
            const delta = session.y < rect.top + 40 ? -8 : session.y > rect.bottom - 40 ? 8 : 0;
            if (delta) {
                const previous = container.scrollTop;
                container.scrollTop += delta;
                scrolling = previous !== container.scrollTop;
            }
        }
        targetAt(session.x, session.y);
        if (scrolling && session) frame = requestAnimationFrame(updateDragPosition);
    };
    body.addEventListener('dragstart', event => {
        const handle = event.target.closest('.layer-drag-handle');
        if (!handle) { event.preventDefault(); return; }
        start(handle.closest('.layer-item'), event);
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', 'Map layer');
        // Suppress the native ghost: the floating card is the only preview.
        const blank = document.createElement('canvas');
        blank.width = blank.height = 1;
        event.dataTransfer.setDragImage(blank, 0, 0);
        const before = snapshotPositions();
        session.card.classList.add('layer-drag-source');
        animatePositions(before, animations);
    });
    body.addEventListener('dragover', event => {
        if (!session) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        session.x = event.clientX;
        session.y = event.clientY;
        session.overList = true;
        if (!frame) frame = requestAnimationFrame(updateDragPosition);
    });
    body.addEventListener('dragleave', event => {
        if (session && !body.contains(event.relatedTarget)) { session.overList = false; session.index = null; session.gap.remove(); }
    });
    body.addEventListener('drop', event => {
        if (!session) return;
        event.preventDefault();
        event.stopPropagation();
        session.overList = true;
        targetAt(event.clientX, event.clientY);
        finish(true);
    });
    body.addEventListener('dragend', () => finish());
    // Capture movement across the document, including outside the list. Never
    // preventDefault here: outside drops must retain their invalid-drop behavior.
    const onDragOver = event => movePreview(event);
    const onDrop = () => finish();
    const onKeyDown = event => { if (event.key === 'Escape') finish(); };
    document.addEventListener('dragover', onDragOver, true);
    document.addEventListener('dragenter', onDragOver, true);
    document.addEventListener('drop', onDrop);
    document.addEventListener('dragend', onDrop);
    document.addEventListener('keydown', onKeyDown);
    const onWindowBlur = () => finish();
    window.addEventListener('blur', onWindowBlur);
    return { cancel: () => finish(), dispose: () => {
        finish();
        cancelAnimations(animations);
        window.removeEventListener('blur', onWindowBlur);
        document.removeEventListener('dragover', onDragOver, true);
        document.removeEventListener('dragenter', onDragOver, true);
        document.removeEventListener('drop', onDrop);
        document.removeEventListener('dragend', onDrop);
        document.removeEventListener('keydown', onKeyDown);
    } };
}
