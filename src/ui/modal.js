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

export function closeModal(modalId) {
    const modal = getModal(modalId);
    if (!modal || !modal.classList.contains('active')) {
        return;
    }

    modal.classList.remove('visible');

    window.setTimeout(() => {
        if (!modal.classList.contains('visible')) {
            modal.classList.remove('active');
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
