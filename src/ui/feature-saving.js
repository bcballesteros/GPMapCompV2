import { closeModal, openModal } from './modal.js';
import { showToast } from './toast.js';
import {
    downloadFeatureSaveFile,
    getSavableFeatureItems,
    loadFeatureSaveFile
} from '../services/feature-save-service.js';

const CATEGORY_LABELS = {
    annotations: 'Annotations',
    drawings: 'Drawings',
    measurements: 'Measurements'
};

const TYPE_LABELS = {
    point: 'Point',
    line: 'Line',
    polygon: 'Polygon',
    freehand: 'Freehand',
    distance: 'Distance',
    area: 'Area'
};

let saveItems = [];

function setSaveButtonState(isDisabled) {
    const saveButton = document.getElementById('featureSaveConfirmBtn');
    if (!saveButton) {
        return;
    }

    saveButton.setAttribute('aria-disabled', isDisabled ? 'true' : 'false');
    saveButton.classList.toggle('is-disabled', isDisabled);
}

function getFeatureLabel(item, index, typeCounts) {
    if (item.category === 'annotations') {
        return item.feature.get('text') || 'Untitled annotation';
    }

    const type = TYPE_LABELS[item.type] || 'Feature';
    typeCounts[item.category][item.type] = (typeCounts[item.category][item.type] || 0) + 1;
    return `${type} ${typeCounts[item.category][item.type]}`;
}

function updateSelectionState() {
    const checkboxes = [...document.querySelectorAll('#featureSaveItems input[type="checkbox"]')];
    const selectedCount = checkboxes.filter((checkbox) => checkbox.checked).length;
    const selectAll = document.getElementById('featureSaveSelectAll');

    if (selectAll) {
        selectAll.checked = checkboxes.length > 0 && selectedCount === checkboxes.length;
        selectAll.indeterminate = selectedCount > 0 && selectedCount < checkboxes.length;
    }
    setSaveButtonState(selectedCount === 0);
    const status = document.getElementById('featureSaveSelectionStatus');
    if (status) {
        status.textContent = `${selectedCount} of ${checkboxes.length} selected`;
    }
    const helper = document.getElementById('featureSaveSelectionHelper');
    if (helper) {
        helper.hidden = selectedCount > 0;
    }
}

function renderSaveItems() {
    const container = document.getElementById('featureSaveItems');
    if (!container) return;

    const typeCounts = { annotations: {}, drawings: {}, measurements: {} };
    const groups = Object.keys(CATEGORY_LABELS).map((category) => {
        const items = saveItems.filter((item) => item.category === category);
        if (!items.length) return '';
        const rows = items.map((item, index) => {
            const label = getFeatureLabel(item, index, typeCounts);
            const checkboxId = `feature-save-${item.id}`;
            return `<label class="feature-save-item" for="${checkboxId}" title="${label.replaceAll('"', '&quot;')}">
                <input type="checkbox" id="${checkboxId}" value="${item.id}">
                <span class="feature-save-item-label">${label.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')}</span>
            </label>`;
        }).join('');
        return `<section class="feature-save-group"><h3>${CATEGORY_LABELS[category]}</h3>${rows}</section>`;
    }).join('');
    container.innerHTML = groups;
    container.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
        checkbox.addEventListener('change', updateSelectionState);
    });
    updateSelectionState();
}

export function openFeatureSaveDialog() {
    saveItems = getSavableFeatureItems();
    if (!saveItems.length) {
        showToast('No Features Available', 'No features available to save.', 'info', 2200);
        return;
    }
    renderSaveItems();
    openModal('featureSaveModal');
}

export function selectAllFeatureSaveItems(event) {
    document.querySelectorAll('#featureSaveItems input[type="checkbox"]').forEach((checkbox) => {
        checkbox.checked = event.target.checked;
    });
    updateSelectionState();
}

export function saveSelectedFeatures() {
    const selectedIds = new Set([...document.querySelectorAll('#featureSaveItems input[type="checkbox"]:checked')].map((checkbox) => checkbox.value));
    if (!selectedIds.size) {
        updateSelectionState();
        showToast('Select Features', 'Select at least one feature to save.', 'info', 2200);
        return;
    }

    try {
        downloadFeatureSaveFile({ itemIds: selectedIds });
        closeModal('featureSaveModal');
        showToast('Features Saved', 'Selected features were saved to a GPMapCompV2 JSON file.', 'success');
    } catch (error) {
        showToast('Save Failed', error.message || 'The features could not be saved.', 'error', 3000);
    }
}

export function loadFeaturesFromFile(event) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;

    loadFeatureSaveFile(file)
        .then((counts) => {
            const total = counts.annotations + counts.drawings + counts.measurements;
            if (total === 0) {
                showToast('Features Already Loaded', 'These features are already loaded.', 'info', 2800);
            } else if (counts.skipped > 0) {
                showToast('Features Loaded', `${total} new feature${total === 1 ? '' : 's'} loaded; ${counts.skipped} duplicate${counts.skipped === 1 ? '' : 's'} skipped.`, 'success', 3200);
            } else {
                showToast('Features Loaded', `${total} feature${total === 1 ? '' : 's'} loaded and ready to edit.`, 'success');
            }
        })
        .catch((error) => {
            showToast('Load Failed', error.message || 'The selected file could not be loaded.', 'error', 3500);
        })
        .finally(() => {
            input.value = '';
        });
}

export function initializeFeatureSaving() {
    document.getElementById('featureSaveSelectAll')?.addEventListener('change', selectAllFeatureSaveItems);
    document.getElementById('featureSaveFileInput')?.addEventListener('change', loadFeaturesFromFile);
}
