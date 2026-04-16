import { ANNOTATION_LAYER_ID } from '../config/constants.js';
import ol from '../lib/ol.js';
import { ensureAnnotationLayer } from '../map/layer-manager.js';
import { getLayerRecord, getMap, removeLayerRecord, setAnnotationMode, setSelectedFeature, setSelectedTool } from '../state/store.js';
import { showToast } from '../ui/toast.js';

let annotationMode = false;
let annotationClickListener = null;
let selectedAnnotationMode = null;
let selectedAnnotation = null;
let annotationMoveMode = false;
let annotationTranslateInteraction = null;
const draggableAnnotations = new ol.Collection();

function syncDraggableAnnotations() {
    draggableAnnotations.clear();

    if (selectedAnnotation?.get('isAnnotation')) {
        draggableAnnotations.push(selectedAnnotation);
    }
}

function setMoveMode(enabled) {
    annotationMoveMode = enabled && !!selectedAnnotation;

    if (annotationTranslateInteraction) {
        annotationTranslateInteraction.setActive(annotationMoveMode);
    }

    const moveBtn = document.getElementById('moveAnnotationBtn');
    if (moveBtn) {
        moveBtn.classList.toggle('active', annotationMoveMode);
    }

    const viewport = getMap()?.getViewport();
    if (viewport) {
        viewport.style.cursor = annotationMoveMode ? 'grab' : '';
    }

    updateAnnotationControls();
}

export function initializeAnnotationInteractions() {
    if (annotationTranslateInteraction || !getMap()) {
        return;
    }

    annotationTranslateInteraction = new ol.interaction.Translate({
        features: draggableAnnotations
    });
    annotationTranslateInteraction.setActive(false);

    annotationTranslateInteraction.on('translatestart', () => {
        const viewport = getMap()?.getViewport();
        if (viewport) {
            viewport.style.cursor = 'grabbing';
        }
    });

    annotationTranslateInteraction.on('translateend', () => {
        ensureAnnotationLayer().layer.changed();
        setMoveMode(false);
        showToast('Moved', 'Annotation moved to new location', 'success', 1200);
    });

    getMap().addInteraction(annotationTranslateInteraction);
}

function resetAnnotationPlacement() {
    annotationMode = false;
    selectedAnnotationMode = null;
    setAnnotationMode(null);
    setSelectedTool(null);
    const viewport = getMap()?.getViewport();
    if (viewport && !annotationMoveMode) {
        viewport.style.cursor = '';
    }

    if (annotationClickListener) {
        getMap().un('click', annotationClickListener);
        annotationClickListener = null;
    }
}

export function getSelectedAnnotationMode() {
    return selectedAnnotationMode;
}

export function activateAnnotation(type) {
    if (type === 'text') {
        setMoveMode(false);
        selectedAnnotationMode = 'text';
        annotationMode = true;
        setAnnotationMode('text');
        setSelectedTool('annotation:text');
        showToast('Text Annotation', 'Click on the map to place a text annotation', 'info');

        annotationClickListener = (event) => {
            const coordinates = event.coordinate;
            const popup = document.getElementById('annotationPopup');
            const pixel = getMap().getPixelFromCoordinate(coordinates);

            popup.style.left = `${pixel[0] + 10}px`;
            popup.style.top = `${pixel[1] - 50}px`;
            popup.classList.add('active');

            const input = document.getElementById('annotationInput');
            input.focus();
            input.dataset.x = coordinates[0];
            input.dataset.y = coordinates[1];

            getMap().un('click', annotationClickListener);
        };

        getMap().on('click', annotationClickListener);
        return;
    }

    if (type === 'highlight') {
        setMoveMode(false);
        selectedAnnotationMode = 'highlight';
        setAnnotationMode('highlight');
        setSelectedTool('annotation:highlight');
        showToast('Feature Highlight', 'Click on a feature to highlight it', 'info');
        getMap().getViewport().style.cursor = 'pointer';
    }
}

export function submitAnnotation() {
    const input = document.getElementById('annotationInput');
    const text = input.value.trim();
    const x = parseFloat(input.dataset.x);
    const y = parseFloat(input.dataset.y);
    const fontSize = parseInt(document.getElementById('annotationFontSize').value, 10) || 12;
    const fontColor = document.getElementById('annotationFontColor').value || '#000000';

    if (!text) {
        showToast('Annotation Required', 'Please enter some text', 'warning');
        return;
    }

    const feature = new ol.Feature({
        geometry: new ol.geom.Point([x, y]),
        text,
        fontSize,
        fontColor,
        isAnnotation: true,
        isDragging: false
    });

    ensureAnnotationLayer().source.addFeature(feature);
    resetAnnotationPlacement();

    document.getElementById('annotationPopup').classList.remove('active');
    input.value = '';
    delete input.dataset.x;
    delete input.dataset.y;

    showToast('Success', 'Text annotation added. Click to select, edit, or delete.', 'success');
    updateAnnotationControls();
}

export function cancelAnnotation() {
    document.getElementById('annotationPopup').classList.remove('active');

    const input = document.getElementById('annotationInput');
    input.value = '';
    delete input.dataset.x;
    delete input.dataset.y;

    resetAnnotationPlacement();
    updateAnnotationControls();
}

export function editAnnotation(feature) {
    if (!feature) {
        return;
    }

    setMoveMode(false);

    const text = feature.get('text');
    const fontSize = feature.get('fontSize') || 12;
    const fontColor = feature.get('fontColor') || '#000000';
    const editPopup = document.createElement('div');

    editPopup.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 20px;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        z-index: 10001;
        min-width: 300px;
    `;

    editPopup.innerHTML = `
        <div style="font-weight: 700; margin-bottom: 15px; font-size: 14px;">Edit Annotation</div>
        <div style="margin-bottom: 10px;">
            <label style="display: block; font-size: 12px; font-weight: 600; margin-bottom: 5px;">Text</label>
            <textarea id="editAnnotationText" style="width: 100%; padding: 8px; border: 1px solid var(--gray-300); border-radius: 6px; font-family: Arial; font-size: 13px; min-height: 60px; resize: vertical;">${text}</textarea>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
            <div>
                <label style="display: block; font-size: 12px; font-weight: 600; margin-bottom: 5px;">Font Size</label>
                <input type="number" id="editAnnotationFontSize" min="8" max="48" value="${fontSize}" style="width: 100%; padding: 8px; border: 1px solid var(--gray-300); border-radius: 6px; font-size: 13px;">
            </div>
            <div>
                <label style="display: block; font-size: 12px; font-weight: 600; margin-bottom: 5px;">Color</label>
                <input type="color" id="editAnnotationFontColor" value="${fontColor}" style="width: 100%; height: 36px; padding: 4px; border: 1px solid var(--gray-300); border-radius: 6px; cursor: pointer;">
            </div>
        </div>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button id="editCancelBtn" style="padding: 8px 16px; background: var(--gray-200); border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px;">Cancel</button>
            <button id="editSaveBtn" style="padding: 8px 16px; background: var(--accent); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px;">Save</button>
        </div>
    `;

    document.body.appendChild(editPopup);

    const backdrop = document.createElement('div');
    backdrop.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.3);
        z-index: 10000;
    `;
    document.body.insertBefore(backdrop, editPopup);

    document.getElementById('editSaveBtn').onclick = () => {
        const newText = document.getElementById('editAnnotationText').value.trim();
        const newFontSize = parseInt(document.getElementById('editAnnotationFontSize').value, 10) || 12;
        const newFontColor = document.getElementById('editAnnotationFontColor').value;

        if (!newText) {
            showToast('Error', 'Text cannot be empty', 'error');
            return;
        }

        feature.set('text', newText);
        feature.set('fontSize', newFontSize);
        feature.set('fontColor', newFontColor);

        ensureAnnotationLayer().layer.changed();
        updateAnnotationControls();
        backdrop.remove();
        editPopup.remove();
        showToast('Success', 'Annotation updated', 'success', 1500);
    };

    document.getElementById('editCancelBtn').onclick = () => {
        backdrop.remove();
        editPopup.remove();
    };
}

export function deleteAnnotation(feature) {
    const annotationLayer = getLayerRecord(ANNOTATION_LAYER_ID);
    if (!annotationLayer) {
        return;
    }

    setMoveMode(false);
    annotationLayer.source.removeFeature(feature);
    selectedAnnotation = null;
    setSelectedFeature(null);
    syncDraggableAnnotations();

    updateAnnotationControls();
    showToast('Removed', 'Annotation deleted', 'info', 1500);

    if (annotationLayer.source.getFeatures().length === 0) {
        getMap().removeLayer(annotationLayer.layer);
        removeLayerRecord(ANNOTATION_LAYER_ID);
    }
}

export function selectAnnotationForDeletion(event) {
    if (annotationMode) {
        return;
    }

    const hitFeatures = [];
    getMap().forEachFeatureAtPixel(event.pixel, (feature) => {
        if (feature.get('isAnnotation')) {
            hitFeatures.push(feature);
        }
    });

    if (selectedAnnotation) {
        selectedAnnotation.set('selected', false);
    }

    selectedAnnotation = hitFeatures.length > 0 ? hitFeatures[0] : null;
    setSelectedFeature(selectedAnnotation);
    syncDraggableAnnotations();

    if (selectedAnnotation) {
        selectedAnnotation.set('selected', true);
    }

    if (!selectedAnnotation) {
        setMoveMode(false);
    } else if (annotationMoveMode) {
        setMoveMode(true);
    }

    updateAnnotationControls();
}

export function updateAnnotationControls() {
    const controls = document.getElementById('annotationControls');
    const editBtn = document.getElementById('editAnnotationBtn');
    const deleteBtn = document.getElementById('deleteAnnotationBtn');
    const moveBtn = document.getElementById('moveAnnotationBtn');
    const hint = document.querySelector('.annotation-controls-hint');

    if (selectedAnnotation) {
        controls.style.display = '';
        editBtn.disabled = false;
        deleteBtn.disabled = false;
        moveBtn.disabled = false;
        if (hint) {
            hint.textContent = annotationMoveMode
                ? 'Drag the selected annotation on the map. Click Move again to finish repositioning.'
                : 'Selected annotation is ready. Use Edit to change text, Move to reposition, or Delete to remove it.';
        }
    } else {
        controls.style.display = 'none';
        editBtn.disabled = true;
        deleteBtn.disabled = true;
        moveBtn.disabled = true;
        if (hint) {
            hint.textContent = 'Select an annotation on the map to edit its text, move its position, or remove it.';
        }
    }

    const annotationLayer = getLayerRecord(ANNOTATION_LAYER_ID);
    if (annotationLayer) {
        annotationLayer.source.getFeatures().forEach((feature) => {
            feature.set('selected', feature === selectedAnnotation);
        });
        annotationLayer.layer.changed();
    }
}

export function bindAnnotationControls() {
    const editBtn = document.getElementById('editAnnotationBtn');
    const deleteBtn = document.getElementById('deleteAnnotationBtn');
    const moveBtn = document.getElementById('moveAnnotationBtn');

    if (editBtn) {
        editBtn.onclick = () => {
            if (selectedAnnotation) {
                editAnnotation(selectedAnnotation);
            }
        };
    }

    if (deleteBtn) {
        deleteBtn.onclick = () => {
            if (selectedAnnotation) {
                deleteAnnotation(selectedAnnotation);
                selectedAnnotation = null;
                updateAnnotationControls();
            }
        };
    }

    if (moveBtn) {
        moveBtn.onclick = () => {
            if (!selectedAnnotation) {
                return;
            }

            const nextMoveMode = !annotationMoveMode;
            setMoveMode(nextMoveMode);

            if (nextMoveMode) {
                showToast('Move', 'Drag the annotation to move it', 'info', 2000);
            }
        };
    }
}
