import { createBasemapLayer } from '../config/basemaps.js';
import { createExportCanvas, downloadCanvas } from '../services/export-service.js';
import { getMap, getState } from '../state/store.js';
import { randomToken } from '../utils/format.js';
import { closeModal } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';
import ol from '../lib/ol.js';

let previewMap = null;
let previewSyncScheduled = false;
let previewListenersBound = false;

function getExportPreviewElements() {
    return {
        container: document.getElementById('mapPreviewContainer'),
        target: document.getElementById('mapPreviewMap'),
        placeholder: document.getElementById('mapPreviewPlaceholder')
    };
}

function isRenderableCanvas(canvas) {
    return Boolean(canvas?.width && canvas?.height);
}

function getCanvasTransform(canvas) {
    const transform = canvas.style.transform;
    if (transform) {
        const match = transform.match(/^matrix\((.+)\)$/);
        if (match) {
            return match[1].split(',').map(Number);
        }
    }

    return [
        parseFloat(canvas.style.width || canvas.width) / canvas.width,
        0,
        0,
        parseFloat(canvas.style.height || canvas.height) / canvas.height,
        0,
        0
    ];
}

function drawMapViewportToContext(map, context, outputWidth, outputHeight) {
    const viewport = map?.getViewport();
    const size = map?.getSize();
    if (!viewport || !size) {
        return false;
    }

    map.renderSync();

    const [mapWidth, mapHeight] = size;
    const scaleX = outputWidth / mapWidth;
    const scaleY = outputHeight / mapHeight;
    const canvases = viewport.querySelectorAll('.ol-layer canvas, canvas.ol-layer');
    let drewLayer = false;

    canvases.forEach((canvas) => {
        if (!isRenderableCanvas(canvas)) {
            return;
        }

        const parentOpacity = canvas.parentElement ? Number(canvas.parentElement.style.opacity || 1) : 1;
        const canvasOpacity = Number(canvas.style.opacity || 1);
        const backgroundColor = canvas.parentElement?.style.backgroundColor;
        const matrix = getCanvasTransform(canvas);

        context.save();
        context.globalAlpha = Number.isNaN(parentOpacity * canvasOpacity) ? 1 : parentOpacity * canvasOpacity;
        context.setTransform(
            matrix[0] * scaleX,
            matrix[1] * scaleY,
            matrix[2] * scaleX,
            matrix[3] * scaleY,
            matrix[4] * scaleX,
            matrix[5] * scaleY
        );

        if (backgroundColor) {
            context.fillStyle = backgroundColor;
            context.fillRect(0, 0, canvas.width, canvas.height);
        }

        context.drawImage(canvas, 0, 0);
        context.restore();
        drewLayer = true;
    });
    context.setTransform(1, 0, 0, 1, 0, 0);

    return drewLayer;
}

function clonePreviewLayer(layer, index) {
    const source = layer.getSource?.();
    if (!source) {
        return null;
    }

    const commonOptions = {
        opacity: layer.getOpacity(),
        visible: layer.getVisible(),
        zIndex: layer.getZIndex()
    };

    if (index === 0) {
        const basemapLayer = createBasemapLayer(getState().activeBasemap);
        basemapLayer.setOpacity(commonOptions.opacity);
        basemapLayer.setVisible(commonOptions.visible);
        basemapLayer.setZIndex(commonOptions.zIndex);
        return basemapLayer;
    }

    if (layer instanceof ol.layer.Vector) {
        const previewLayer = new ol.layer.Vector({
            source,
            style: layer.getStyle(),
            opacity: commonOptions.opacity,
            visible: commonOptions.visible
        });
        previewLayer.setZIndex(commonOptions.zIndex);
        return previewLayer;
    }

    if (layer instanceof ol.layer.Tile) {
        const previewLayer = new ol.layer.Tile({
            source,
            opacity: commonOptions.opacity,
            visible: commonOptions.visible
        });
        previewLayer.setZIndex(commonOptions.zIndex);
        return previewLayer;
    }

    return null;
}

function ensurePreviewMap() {
    if (previewMap) {
        return previewMap;
    }

    const { target } = getExportPreviewElements();
    if (!target) {
        return null;
    }

    const mainMap = getMap();
    const projection = mainMap?.getView().getProjection();

    previewMap = new ol.Map({
        target,
        controls: [],
        layers: [],
        view: new ol.View({
            center: mainMap?.getView().getCenter() ?? [0, 0],
            zoom: mainMap?.getView().getZoom() ?? 1,
            projection
        })
    });

    previewMap.getInteractions().clear();

    return previewMap;
}

function rebuildPreviewLayers(mainMapInstance) {
    const previewInstance = ensurePreviewMap();
    if (!previewInstance || !mainMapInstance) {
        return;
    }

    const previewLayers = previewInstance.getLayers();
    previewLayers.clear();

    mainMapInstance.getLayers().forEach((layer, index) => {
        const previewLayer = clonePreviewLayer(layer, index);
        if (previewLayer) {
            previewLayers.push(previewLayer);
        }
    });
}

function syncPreviewView(mainMapInstance) {
    const previewInstance = ensurePreviewMap();
    if (!previewInstance || !mainMapInstance) {
        return;
    }

    previewInstance.updateSize();

    const mainSize = mainMapInstance.getSize();
    const previewSize = previewInstance.getSize();
    const mainView = mainMapInstance.getView();
    const previewView = previewInstance.getView();

    if (mainSize && previewSize) {
        const extent = mainView.calculateExtent(mainSize);
        previewView.fit(extent, {
            size: previewSize,
            duration: 0,
            nearest: true
        });
    } else {
        previewView.setCenter(mainView.getCenter());
        previewView.setZoom(mainView.getZoom());
    }

    previewView.setRotation(mainView.getRotation() || 0);
}

function bindPreviewSyncListeners() {
    if (previewListenersBound) {
        return;
    }

    const mainMap = getMap();
    if (!mainMap) {
        return;
    }

    const scheduleSync = () => {
        if (previewSyncScheduled) {
            return;
        }

        previewSyncScheduled = true;
        requestAnimationFrame(() => {
            previewSyncScheduled = false;
            renderMapPreview();
        });
    };

    mainMap.on('moveend', scheduleSync);
    mainMap.getLayers().on('add', (event) => {
        event.element?.on('change', scheduleSync);
        scheduleSync();
    });
    mainMap.getLayers().on('remove', scheduleSync);
    mainMap.getLayers().forEach((layer) => layer.on('change', scheduleSync));
    previewListenersBound = true;
}

export function renderMapPreview() {
    const { container, placeholder } = getExportPreviewElements();
    const mainMap = getMap();

    if (!container || !placeholder || !mainMap) {
        return;
    }

    bindPreviewSyncListeners();

    requestAnimationFrame(() => {
        const previewInstance = ensurePreviewMap();
        if (!previewInstance) {
            return;
        }

        rebuildPreviewLayers(mainMap);
        syncPreviewView(mainMap);
        previewInstance.renderSync();
        container.classList.add('ready');
        placeholder.setAttribute('aria-hidden', 'true');
    });
}

export function downloadMap() {
    const format = document.getElementById('exportFormat').value;
    const resolution = document.getElementById('exportResolution').value;
    const [width, height] = resolution.split('x').map(Number);
    const map = getMap();

    try {
        showToast('Exporting', 'Generating map export...', 'info');

        const canvas = createExportCanvas(width, height);
        const context = canvas.getContext('2d');
        if (!context) {
            throw new Error('Failed to get canvas context');
        }

        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        drawMapViewportToContext(map, context, width, height);

        context.fillStyle = '#333333';
        context.font = 'bold 18px Arial';
        context.fillText('Geoportal Philippines Map', 20, 30);
        context.font = '12px Arial';
        context.fillStyle = '#666666';
        context.fillText(`Exported: ${new Date().toLocaleString()}`, 20, 50);

        if (format === 'png') {
            downloadCanvas(canvas, 'image/png', `map_export_${Date.now()}.png`, undefined, (blob) => {
                if (!blob) {
                    showToast('Error', 'Failed to create image/png blob', 'error');
                    return;
                }

                showToast('Success', 'Map exported as PNG', 'success');
                closeModal('exportModal');
            });
            return;
        }

        if (format === 'jpeg') {
            downloadCanvas(canvas, 'image/jpeg', `map_export_${Date.now()}.jpg`, 0.95, (blob) => {
                if (!blob) {
                    showToast('Error', 'Failed to create image/jpeg blob', 'error');
                    return;
                }

                showToast('Success', 'Map exported as JPEG', 'success');
                closeModal('exportModal');
            });
            return;
        }

        downloadCanvas(canvas, 'image/png', `map_export_${Date.now()}.png`, undefined, (blob) => {
            if (!blob) {
                showToast('Error', 'Failed to create image/png blob', 'error');
                return;
            }

            showToast('Info', 'PDF export downloads as high-resolution PNG', 'info');
            closeModal('exportModal');
        });
    } catch (error) {
        console.error('Export error:', error);
        showToast('Error', `Failed to export map: ${error.message}`, 'error');
    }
}

export function copyToClipboard() {
    const clickEvent = window.event;
    const input = clickEvent?.target?.previousElementSibling;

    if (!input) {
        return;
    }

    input.select();
    document.execCommand('copy');
    clickEvent.target.innerHTML = '<i class="fas fa-check"></i> Copied';

    setTimeout(() => {
        clickEvent.target.innerHTML = '<i class="fas fa-copy"></i> Copy';
    }, 2000);
}

export function generateLink() {
    document.querySelector('#shareModal input').value = `geoportal.gov.ph/map/${randomToken()}`;
    showToast('Generated', 'New share link created', 'success', 2000);
}
