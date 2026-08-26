import { closeModal, openModal } from './modal.js';

const CONFIRMATION_MODAL_ID = 'confirmationModal';
let pendingConfirmation = null;
let initialized = false;

function ensureConfirmationDialog() {
    if (initialized) return;
    initialized = true;

    const overlay = document.createElement('div');
    overlay.id = CONFIRMATION_MODAL_ID;
    overlay.className = 'modal-overlay confirmation-modal-overlay';
    overlay.setAttribute('role', 'presentation');
    overlay.innerHTML = `
        <div class="modal confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="confirmationDialogTitle" aria-describedby="confirmationDialogMessage">
            <div class="modal-header">
                <div class="modal-title" id="confirmationDialogTitle"><i class="fas fa-triangle-exclamation"></i> Confirm Action</div>
                <button type="button" class="modal-close" data-confirmation-cancel title="Close" aria-label="Close dialog">&times;</button>
            </div>
            <div class="modal-body"><p id="confirmationDialogMessage" class="confirmation-dialog-message"></p></div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-confirmation-cancel>Cancel</button>
                <button type="button" class="btn btn-danger" id="confirmationDialogConfirm"></button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    overlay.querySelectorAll('[data-confirmation-cancel]').forEach((button) => button.addEventListener('click', () => settleConfirmation(false)));
    overlay.querySelector('#confirmationDialogConfirm')?.addEventListener('click', () => settleConfirmation(true));
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) settleConfirmation(false);
    });
    window.addEventListener('gpmap:modalchange', (event) => {
        if (event.detail?.modalId === CONFIRMATION_MODAL_ID && !event.detail.isOpen) {
            settleConfirmation(false, { close: false });
        }
    });
}

function settleConfirmation(confirmed, { close = true } = {}) {
    if (!pendingConfirmation) return;
    const { resolve } = pendingConfirmation;
    pendingConfirmation = null;
    if (close) closeModal(CONFIRMATION_MODAL_ID);
    resolve(confirmed);
}

export function confirmDestructiveAction({ title, message, confirmLabel }) {
    ensureConfirmationDialog();
    if (pendingConfirmation) return Promise.resolve(false);

    const overlay = document.getElementById(CONFIRMATION_MODAL_ID);
    overlay.querySelector('#confirmationDialogTitle').innerHTML = `<i class="fas fa-triangle-exclamation"></i> ${title}`;
    overlay.querySelector('#confirmationDialogMessage').textContent = message;
    const confirmButton = overlay.querySelector('#confirmationDialogConfirm');
    confirmButton.textContent = confirmLabel;

    return new Promise((resolve) => {
        pendingConfirmation = { resolve };
        openModal(CONFIRMATION_MODAL_ID, { onOpen: () => confirmButton.focus() });
    });
}
