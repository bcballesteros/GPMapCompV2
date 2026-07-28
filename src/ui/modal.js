const MODAL_CLOSE_DURATION_MS = 220;
const modalGeometry = new Map();

function initializeResizableModal(modal) {
    if (!modal?.classList.contains('attributes-modal') || modal.dataset.resizeReady === 'true') {
        return;
    }

    modal.dataset.resizeReady = 'true';
    const saveGeometry = () => {
        const rect = modal.getBoundingClientRect();
        modalGeometry.set(modal, {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height
        });
    };
    const makeFixed = () => {
        const rect = modal.getBoundingClientRect();
        modal.style.position = 'fixed';
        modal.style.left = `${rect.left}px`;
        modal.style.top = `${rect.top}px`;
        modal.style.width = `${rect.width}px`;
        modal.style.height = `${rect.height}px`;
        modal.style.maxWidth = 'none';
        modal.style.maxHeight = 'none';
        modal.style.margin = '0';
        return rect;
    };

    modal.querySelector('.modal-header')?.addEventListener('pointerdown', (event) => {
        if (event.target.closest('.modal-close') || event.target.closest('.modal-resize-handle')) {
            return;
        }

        event.preventDefault();
        const rect = makeFixed();
        const start = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };

        const onMove = (moveEvent) => {
            const left = start.left + moveEvent.clientX - start.x;
            const top = start.top + moveEvent.clientY - start.y;
            modal.style.left = `${Math.max(0, Math.min(window.innerWidth - modal.offsetWidth, left))}px`;
            modal.style.top = `${Math.max(0, Math.min(window.innerHeight - modal.offsetHeight, top))}px`;
        };
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            if (modal.getBoundingClientRect().left !== rect.left || modal.getBoundingClientRect().top !== rect.top) {
                saveGeometry();
            }
            window.removeEventListener('pointerup', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp, { once: true });
    });

    ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'].forEach((direction) => {
        const handle = document.createElement('div');
        handle.className = `modal-resize-handle modal-resize-${direction}`;
        handle.dataset.resizeDirection = direction;
        handle.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            event.stopPropagation();

            const rect = modal.getBoundingClientRect();
            const start = { x: event.clientX, y: event.clientY, width: rect.width, height: rect.height, left: rect.left, top: rect.top };
            const minWidth = parseFloat(getComputedStyle(modal).minWidth) || 320;
            const minHeight = parseFloat(getComputedStyle(modal).minHeight) || 260;
            const maxWidth = window.innerWidth;
            const maxHeight = window.innerHeight;

            makeFixed();

            const onMove = (moveEvent) => {
                const dx = moveEvent.clientX - start.x;
                const dy = moveEvent.clientY - start.y;
                const isWest = direction.includes('w');
                const isNorth = direction.includes('n');
                let width = start.width + (isWest ? -dx : direction.includes('e') ? dx : 0);
                let height = start.height + (isNorth ? -dy : direction.includes('s') ? dy : 0);
                width = Math.max(minWidth, Math.min(maxWidth, width));
                height = Math.max(minHeight, Math.min(maxHeight, height));
                const left = isWest ? start.left + start.width - width : start.left;
                const top = isNorth ? start.top + start.height - height : start.top;
                modal.style.width = `${width}px`;
                modal.style.height = `${height}px`;
                modal.style.left = `${Math.max(0, Math.min(window.innerWidth - width, left))}px`;
                modal.style.top = `${Math.max(0, Math.min(window.innerHeight - height, top))}px`;
            };
            const onUp = () => {
                window.removeEventListener('pointermove', onMove);
                const current = modal.getBoundingClientRect();
                if (current.left !== start.left || current.top !== start.top || current.width !== start.width || current.height !== start.height) {
                    saveGeometry();
                }
                window.removeEventListener('pointerup', onUp);
            };
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp, { once: true });
        });
        modal.appendChild(handle);
    });
}

function getModal(modalId) {
    return document.getElementById(modalId);
}

export function isModalOpen(modalId) {
    return getModal(modalId)?.classList.contains('active') ?? false;
}

export function openModal(modalId, { onOpen } = {}) {
    const modal = getModal(modalId);
    if (!modal || modal.classList.contains('active')) {
        return;
    }

    initializeResizableModal(modal.querySelector('.modal'));
    restoreModalGeometry(modal.querySelector('.modal'));

    modal.classList.add('active');
    window.dispatchEvent(new CustomEvent('gpmap:modalchange', {
        detail: { modalId, isOpen: true }
    }));

    requestAnimationFrame(() => {
        modal.classList.add('visible');

        if (typeof onOpen === 'function') {
            requestAnimationFrame(() => onOpen(modal));
        }
    });
}

function restoreModalGeometry(modal) {
    const geometry = modalGeometry.get(modal);
    if (!geometry) {
        return;
    }

    const width = Math.min(geometry.width, window.innerWidth);
    const height = Math.min(geometry.height, window.innerHeight);
    modal.style.position = 'fixed';
    modal.style.left = `${Math.max(0, Math.min(window.innerWidth - width, geometry.left))}px`;
    modal.style.top = `${Math.max(0, Math.min(window.innerHeight - height, geometry.top))}px`;
    modal.style.width = `${width}px`;
    modal.style.height = `${height}px`;
    modal.style.maxWidth = 'none';
    modal.style.maxHeight = 'none';
    modal.style.margin = '0';
}

export function closeModal(modalId) {
    const modal = getModal(modalId);
    if (!modal || !modal.classList.contains('active')) {
        return;
    }

    modal.classList.remove('visible');

    window.setTimeout(() => {
        if (!modal.classList.contains('visible')) {
            modal.classList.remove('active');
            const dialog = modal.querySelector('.attributes-modal');
            if (dialog) {
                dialog.style.position = '';
                dialog.style.left = '';
                dialog.style.top = '';
                dialog.style.width = '';
                dialog.style.height = '';
                dialog.style.maxWidth = '';
                dialog.style.maxHeight = '';
                dialog.style.margin = '';
            }
            window.dispatchEvent(new CustomEvent('gpmap:modalchange', {
                detail: { modalId, isOpen: false }
            }));
        }
    }, MODAL_CLOSE_DURATION_MS);
}

export function closeActiveModal() {
    const activeModals = Array.from(document.querySelectorAll('.modal-overlay.active'));
    const activeModal = activeModals.at(-1);
    if (!activeModal?.id) {
        return false;
    }

    closeModal(activeModal.id);
    return true;
}

export function toggleSection(header) {
    const content = header.nextElementSibling;
    if (!content) {
        return;
    }

    const group = header.closest?.('.tool-section-group');
    const isOpening = content.classList.contains('collapsed');

    content.classList.toggle('collapsed');
    group?.classList.toggle('expanded', isOpening);
    group?.classList.toggle('active-section', isOpening);

    if (!isOpening) {
        group?.classList.remove('active-section');
        return;
    }

    group.dataset.openedAt = String(Date.now());

    const sidebar = header.closest?.('.right-sidebar-content');
    if (!sidebar) {
        return;
    }

    const openGroups = Array.from(sidebar.querySelectorAll('.tool-section-group'))
        .filter((section) => !section.querySelector('.tool-section-content')?.classList.contains('collapsed'));

    if (openGroups.length <= 2) {
        return;
    }

    const collapseCandidate = openGroups
        .filter((section) => section !== group && !section.querySelector('.tool-btn.active'))
        .sort((a, b) => Number(a.dataset.openedAt || 0) - Number(b.dataset.openedAt || 0))[0];

    const candidateContent = collapseCandidate?.querySelector('.tool-section-content');
    if (candidateContent) {
        candidateContent.classList.add('collapsed');
        collapseCandidate.classList.remove('expanded', 'active-section');
    }
}

export function bindModalOverlayDismissal() {
    document.querySelectorAll('.modal-overlay').forEach((overlay) => {
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) {
                closeModal(overlay.id);
            }
        });
    });
}

export function bindModalEscapeDismissal() {
    window.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) {
            return;
        }

        if (closeActiveModal()) {
            event.preventDefault();
        }
    });
}
