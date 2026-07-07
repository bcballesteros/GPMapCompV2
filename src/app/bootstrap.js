import { activateAnnotation, activateDrawing, activateMeasureArea, activateMeasureDistance, bindAnnotationControls, bindAnnotationVisibilityToggle, cancelAnnotation, clearAnnotations, clearDrawings, clearMeasurements, deleteAnnotation, deleteSelectedDrawing, deleteSelectedMeasurement, editAnnotation, getSelectedAnnotationMode, initializeAnnotationInteractions, initializeDrawingSelectionControls, initializeMeasurementControls, selectAnnotationForDeletion, submitAnnotation } from '../tools/annotation-tool.js';
import { copyToClipboard, downloadMap, generateLink, renderMapPreview, restoreSharedStateFromUrl } from '../tools/export-share.js';
import { initializeMap } from '../map/map-init.js';
import { changeBasemapLayer } from '../map/layer-manager.js';
import { addGPLayerFromForm, addWMSLayerFromForm, clearCsvSelection, clearFileSelection, clearGeoJSONSelection, clearKmlSelection, fetchGpLayersFromForm, fetchWmsCapabilitiesFromForm, handleCsvSelect, handleFileSelect, handleGeoJSONSelect, handleKmlSelect, initializeGpLayerForm, initializeUploadForm, initializeWmsLayerForm, resetGpLayerFormSession, resetWmsLayerFormSession, submitUpload, updateDataSection } from '../tools/upload-tool.js';
import { commitLayerOpacity, removeLayer, selectLayer, updateLayerColor, updateLayerOpacity, updateLineStrokeWidth } from '../ui/layers-panel.js';
import { bindModalEscapeDismissal, bindModalOverlayDismissal, closeModal, openModal, toggleSection } from '../ui/modal.js';
import { initializeLocationSearch } from '../ui/location-search.js';
import { openAttributeTable } from '../ui/sidebar.js';
import { initializeWorkspaceStatus } from '../ui/workspace-status.js';
import { showToast } from '../ui/toast.js';
import { bindAnnotationPopupDismissal } from '../ui/toolbar.js';

function runOptionalStartupStep(label, callback) {
    try {
        const result = callback();
        if (result && typeof result.catch === 'function') {
            result.catch((error) => {
                console.warn(`[startup] ${label} failed`, error);
            });
        }
    } catch (error) {
        console.warn(`[startup] ${label} failed`, error);
    }
}

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
            ? () => runOptionalStartupStep('export preview render', () => renderMapPreview())
            : modalId === 'shareModal'
                ? () => runOptionalStartupStep('share link generation', () => generateLink({ silent: true }))
                : modalId === 'wmsModal'
                    ? () => runOptionalStartupStep('WMS modal reset', () => resetWmsLayerFormSession())
                    : modalId === 'gpModal'
                        ? () => runOptionalStartupStep('GP modal reset', () => resetGpLayerFormSession())
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
    window.updateLineStrokeWidth = updateLineStrokeWidth;
    window.commitLayerOpacity = commitLayerOpacity;
    window.removeLayer = removeLayer;
    window.openAttributeTable = openAttributeTable;
    window.activateAnnotation = activateAnnotation;
    window.activateDrawing = activateDrawing;
    window.clearDrawings = clearDrawings;
    window.deleteSelectedDrawing = deleteSelectedDrawing;
    window.activateMeasureDistance = activateMeasureDistance;
    window.activateMeasureArea = activateMeasureArea;
    window.deleteSelectedMeasurement = deleteSelectedMeasurement;
    window.clearMeasurements = clearMeasurements;
    window.clearAnnotations = clearAnnotations;
    window.submitAnnotation = submitAnnotation;
    window.cancelAnnotation = cancelAnnotation;
    window.editAnnotation = editAnnotation;
    window.deleteAnnotation = deleteAnnotation;
    window.changeBasemap = changeBasemapLayer;
    window.addWMSLayer = addWMSLayerFromForm;
    window.fetchWMSCapabilities = fetchWmsCapabilitiesFromForm;
    window.addGPLayer = addGPLayerFromForm;
    window.fetchGPLayers = fetchGpLayersFromForm;
    window.downloadMap = downloadMap;
    window.renderMapPreview = renderMapPreview;
    window.copyToClipboard = copyToClipboard;
    window.generateLink = generateLink;
}

export function bootstrapApp() {
    try {
        bindModalOverlayDismissal();
        initializeMap({
            getSelectedAnnotationMode,
            onAnnotationSelect: selectAnnotationForDeletion
        });
        bindGlobalHandlers();

        runOptionalStartupStep('location search init', () => initializeLocationSearch());
        runOptionalStartupStep('annotation interaction init', () => initializeAnnotationInteractions());
        runOptionalStartupStep('modal escape dismissal binding', () => bindModalEscapeDismissal());
        runOptionalStartupStep('annotation controls init', () => bindAnnotationControls());
        runOptionalStartupStep('annotation visibility toggle init', () => bindAnnotationVisibilityToggle());
        runOptionalStartupStep('drawing selection controls init', () => initializeDrawingSelectionControls());
        runOptionalStartupStep('measurement controls init', () => initializeMeasurementControls());
        runOptionalStartupStep('workspace status init', () => initializeWorkspaceStatus());
        runOptionalStartupStep('upload form init', () => initializeUploadForm());
        runOptionalStartupStep('WMS form init', () => initializeWmsLayerForm());
        runOptionalStartupStep('GP form init', () => initializeGpLayerForm());
        runOptionalStartupStep('annotation popup dismissal binding', () => bindAnnotationPopupDismissal(cancelAnnotation));
        runOptionalStartupStep('shared state restore', () => restoreSharedStateFromUrl());
    } catch (error) {
        console.error('[startup] critical bootstrap failure', error);
        showToast('Startup Issue', 'Some tools failed to initialize.', 'warning', 3500);
    } finally {
        revealAppShell();
    }
}
