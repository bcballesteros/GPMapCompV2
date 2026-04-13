export function openModal(modalId, { onOpen } = {}) {
    const modal = document.getElementById(modalId);
    if (!modal) {
        return;
    }

    modal.classList.add('active');

    if (typeof onOpen === 'function') {
        onOpen();
    }
}

export function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
    }
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
                overlay.classList.remove('active');
            }
        });
    });
}
