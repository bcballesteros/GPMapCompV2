import { activateAnnotation, bindAnnotationControls, cancelAnnotation, deleteAnnotation, editAnnotation, getSelectedAnnotationMode, initializeAnnotationInteractions, selectAnnotationForDeletion, submitAnnotation } from '../tools/annotation-tool.js';
import { copyToClipboard, downloadMap, generateLink, renderMapPreview } from '../tools/export-share.js';
import { initializeMap } from '../map/map-init.js';
import { changeBasemapLayer } from '../map/layer-manager.js';
import { addWMSLayerFromForm, clearCsvSelection, clearFileSelection, clearGeoJSONSelection, clearKmlSelection, handleCsvSelect, handleFileSelect, handleGeoJSONSelect, handleKmlSelect, submitUpload, updateDataSection } from '../tools/upload-tool.js';
import { commitLayerOpacity, removeLayer, selectLayer, updateLayerColor, updateLayerOpacity } from '../ui/layers-panel.js';
import { bindModalOverlayDismissal, closeModal, openModal, toggleSection } from '../ui/modal.js';
import { openAttributeTable } from '../ui/sidebar.js';
import { initializeWorkspaceStatus } from '../ui/workspace-status.js';
import { showToast } from '../ui/toast.js';
import { bindAnnotationPopupDismissal } from '../ui/toolbar.js';

function revealAppShell() {
    const markReady = () => {
        document.body.classList.remove('app-booting');
        document.body.classList.add('app-ready');
    };

    if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(markReady);
        });
        return;
    }

    markReady();
}

function openModalWithHooks(modalId) {
    openModal(modalId, {
        onOpen: modalId === 'exportModal'
            ? () => renderMapPreview()
            : undefined
    });
}

function bindGlobalHandlers() {
    window.showToast = showToast;
    window.openModal = openModalWithHooks;
    window.closeModal = closeModal;
    window.toggleSection = toggleSection;
    window.handleFileSelect = handleFileSelect;
    window.handleGeoJSONSelect = handleGeoJSONSelect;
    window.handleKmlSelect = handleKmlSelect;
    window.handleCsvSelect = handleCsvSelect;
    window.clearFileSelection = clearFileSelection;
    window.clearGeoJSONSelection = clearGeoJSONSelection;
    window.clearKmlSelection = clearKmlSelection;
    window.clearCsvSelection = clearCsvSelection;
    window.updateDataSection = updateDataSection;
    window.submitUpload = submitUpload;
    window.selectLayer = selectLayer;
    window.updateLayerColor = updateLayerColor;
    window.updateLayerOpacity = updateLayerOpacity;
    window.commitLayerOpacity = commitLayerOpacity;
    window.removeLayer = removeLayer;
    window.openAttributeTable = openAttributeTable;
    window.activateAnnotation = activateAnnotation;
    window.submitAnnotation = submitAnnotation;
    window.cancelAnnotation = cancelAnnotation;
    window.editAnnotation = editAnnotation;
    window.deleteAnnotation = deleteAnnotation;
    window.changeBasemap = changeBasemapLayer;
    window.addWMSLayer = addWMSLayerFromForm;
    window.downloadMap = downloadMap;
    window.renderMapPreview = renderMapPreview;
    window.copyToClipboard = copyToClipboard;
    window.generateLink = generateLink;
}

export function bootstrapApp() {
    bindModalOverlayDismissal();
    initializeMap({
        getSelectedAnnotationMode,
        onAnnotationSelect: selectAnnotationForDeletion
    });
    initializeAnnotationInteractions();
    bindAnnotationControls();
    initializeWorkspaceStatus();
    bindGlobalHandlers();
    bindAnnotationPopupDismissal(cancelAnnotation);
    revealAppShell();
}
