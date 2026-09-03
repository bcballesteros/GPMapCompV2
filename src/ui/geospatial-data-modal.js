import { prepareGpLayerDialog, resetWmsLayerFormSession, submitUpload } from '../tools/upload-tool.js';
import { closeModal, isModalOpen, openModal } from './modal.js';

const TAB_NAMES = ['upload', 'wms', 'geoportal'];
let preparedTabs = new Set();
let activeSource = 'upload';

function getTab(name) {
    return document.querySelector(`[data-geospatial-tab="${name}"]`);
}

function syncAddDataFooter(activeTab) {
    const primaryAction = document.getElementById('addDataPrimaryAction');
    if (!primaryAction) {
        return;
    }

    activeSource = TAB_NAMES.includes(activeTab) ? activeTab : 'upload';
    const isUpload = activeSource === 'upload';
    primaryAction.innerHTML = isUpload
        ? '<i class="fas fa-upload"></i> Upload'
        : '<i class="fas fa-check"></i> Done';
    const uploadIsBusy = isUpload && primaryAction.dataset.uploadBusy === 'true';
    primaryAction.disabled = uploadIsBusy;
    if (!uploadIsBusy) {
        primaryAction.removeAttribute('aria-busy');
    }
}

function activateTab(name, { focus = false } = {}) {
    const nextTab = TAB_NAMES.includes(name) ? name : 'upload';
    TAB_NAMES.forEach((tabName) => {
        const isActive = tabName === nextTab;
        const tab = getTab(tabName);
        const panel = document.querySelector(`[data-geospatial-panel="${tabName}"]`);
        tab?.classList.toggle('active', isActive);
        tab?.setAttribute('aria-selected', String(isActive));
        tab?.setAttribute('tabindex', isActive ? '0' : '-1');
        if (panel) panel.hidden = !isActive;
    });

    syncAddDataFooter(nextTab);

    if (!preparedTabs.has(nextTab)) {
        preparedTabs.add(nextTab);
        if (nextTab === 'geoportal') prepareGpLayerDialog();
    }

    if (focus) getTab(nextTab)?.focus();
}

export function openAddGeospatialData(tab = 'upload') {
    const nextTab = TAB_NAMES.includes(tab) ? tab : 'upload';
    if (isModalOpen('uploadModal')) {
        activateTab(nextTab);
        return;
    }

    preparedTabs = new Set(['upload']);
    activateTab(nextTab);
    openModal('uploadModal');
}

export function initializeGeospatialDataModal() {
    const primaryAction = document.getElementById('addDataPrimaryAction');
    primaryAction?.addEventListener('click', () => {
        if (activeSource === 'upload') {
            void submitUpload();
            return;
        }

        closeModal('uploadModal');
    });

    TAB_NAMES.forEach((tabName, index) => {
        const tab = getTab(tabName);
        if (!tab) return;
        tab.addEventListener('click', () => activateTab(tabName));
        tab.addEventListener('keydown', (event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const nextIndex = event.key === 'Home' ? 0
                : event.key === 'End' ? TAB_NAMES.length - 1
                    : (index + (event.key === 'ArrowRight' ? 1 : -1) + TAB_NAMES.length) % TAB_NAMES.length;
            activateTab(TAB_NAMES[nextIndex], { focus: true });
        });
    });

    window.addEventListener('gpmap:modalchange', (event) => {
        if (event.detail?.modalId !== 'uploadModal' || event.detail.isOpen) return;
        resetWmsLayerFormSession();
        preparedTabs = new Set();
        activateTab('upload');
    });
}
