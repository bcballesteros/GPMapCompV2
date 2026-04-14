const MODAL_CLOSE_DURATION_MS = 220;

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

    modal.classList.add('active');

    requestAnimationFrame(() => {
        modal.classList.add('visible');

        if (typeof onOpen === 'function') {
            requestAnimationFrame(() => onOpen(modal));
        }
    });
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
        }
    }, MODAL_CLOSE_DURATION_MS);
}

export function toggleSection(header) {
    const content = header.nextElementSibling;
    if (content) {
        content.classList.toggle('collapsed');
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
