import { createBasemapLayer } from '../config/basemaps.js';
import { ANNOTATION_LAYER_ID } from '../config/constants.js';
import { createExportCanvas, createPdfBlobFromCanvas, downloadBlob, downloadCanvas } from '../services/export-service.js';
import { addWmsLayer, changeBasemapLayer, ensureAnnotationLayer, updateManagedLayerStyle } from '../map/layer-manager.js';
import { getCurrentSearchResult, getLayerRecord, getMap, getState } from '../state/store.js';
import { createGpLayerConfig } from '../services/gp-service.js';
import { createWmsLayerConfig } from '../services/wms-service.js';
import { addLayerItem } from '../ui/layers-panel.js';
import { closeModal } from '../ui/modal.js';
import { restoreSearchState } from '../ui/location-search.js';
import { showToast } from '../ui/toast.js';
import { syncLabelsToggle } from './labels-tool.js';
import ol from '../lib/ol.js';

const SHARE_TOKEN_KEY = 's';
const SHARE_TOKEN_VERSION = 1;

let previewMap = null;
let previewSyncScheduled = false;
let previewListenersBound = false;
let sharedStateRestoreAttempted = false;

function setShareFeedback(message = '', type = 'neutral') {
    const status = document.getElementById('shareFeedback');
    if (!status) {
        return;
    }

    status.textContent = message || 'Share link updates here when you copy or regenerate the current map state.';
    status.dataset.state = type;
}

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

function cloneWmsSource(source) {
    const urls = source.getUrls?.();
    const url = urls?.[0] || source.getUrl?.();

    return new ol.source.TileWMS({
        url,
        params: { ...source.getParams() },
        serverType: source.get('serverType') || 'geoserver',
        crossOrigin: 'anonymous',
        transition: 0
    });
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
            source: source instanceof ol.source.TileWMS ? cloneWmsSource(source) : source,
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

function serializeViewState(map) {
    const view = map?.getView();
    const center = view?.getCenter();
    if (!view || !Array.isArray(center)) {
        return null;
    }

    const [longitude, latitude] = ol.proj.toLonLat(center, view.getProjection());
    return {
        center: [Number(longitude.toFixed(6)), Number(latitude.toFixed(6))],
        zoom: Number((view.getZoom() ?? 1).toFixed(2)),
        rotation: Number((view.getRotation() || 0).toFixed(6))
    };
}

function serializeAnnotations() {
    const annotationLayer = getLayerRecord(ANNOTATION_LAYER_ID);
    if (!annotationLayer?.source) {
        return [];
    }

    return annotationLayer.source.getFeatures()
        .map((feature) => {
            const geometry = feature.getGeometry();
            if (!(geometry instanceof ol.geom.Point)) {
                return null;
            }

            const [longitude, latitude] = ol.proj.toLonLat(geometry.getCoordinates());
            return {
                text: feature.get('text') || '',
                fontSize: Number(feature.get('fontSize') || 12),
                fontColor: feature.get('fontColor') || '#000000',
                coordinates: [Number(longitude.toFixed(6)), Number(latitude.toFixed(6))]
            };
        })
        .filter(Boolean);
}

function serializeLayerSettings() {
    return Object.entries(getState().uploadedLayers)
        .filter(([layerName]) => layerName !== ANNOTATION_LAYER_ID)
        .map(([layerName, record]) => {
            const baseState = {
                name: layerName,
                visible: record.layer?.getVisible?.() !== false,
                opacity: Number((record.opacity ?? record.layer?.getOpacity?.() ?? 1).toFixed(3)),
                sourceCrs: record.sourceCrs || 'Unknown CRS',
                sourceCrsDetected: Boolean(record.sourceCrsDetected)
            };

            if (record.isGP) {
                return {
                    ...baseState,
                    type: 'gp',
                    gpUrl: record.gpUrl || '',
                    gpLayerName: record.gpLayerName || '',
                    gpLayerType: record.gpLayerType || '',
                    gpTileUrl: record.gpTileUrl || '',
                    displayName: record.displayName || layerName
                };
            }

            if (record.isWMS) {
                return {
                    ...baseState,
                    type: 'wms',
                    wmsUrl: record.wmsUrl || '',
                    wmsLayerName: record.wmsLayerName || '',
                    displayName: record.displayName || layerName
                };
            }

            return {
                ...baseState,
                type: 'vector',
                color: record.color || '',
                labelsVisible: Boolean(record.labelsVisible)
            };
        });
}

function serializeUiSettings() {
    return {
        labels: Boolean(document.getElementById('labelsToggle')?.checked),
        scaleBar: document.getElementById('scaleBarToggle')?.checked !== false,
        northArrow: document.getElementById('northArrowToggle')?.checked !== false
    };
}

function buildShareState() {
    const map = getMap();
    return {
        v: SHARE_TOKEN_VERSION,
        basemap: getState().activeBasemap,
        view: serializeViewState(map),
        search: getCurrentSearchResult(),
        annotations: serializeAnnotations(),
        layers: serializeLayerSettings(),
        settings: serializeUiSettings()
    };
}

function encodeShareState(state) {
    const json = JSON.stringify(state);
    const bytes = new TextEncoder().encode(json);
    let binary = '';

    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });

    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function decodeShareState(token) {
    const normalizedToken = token.replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalizedToken.length % 4 === 0
        ? ''
        : '='.repeat(4 - (normalizedToken.length % 4));
    const binary = atob(`${normalizedToken}${padding}`);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
}

function getShareLinkInput() {
    return document.getElementById('shareLinkInput');
}

function updateShareLinkInput(link) {
    const input = getShareLinkInput();
    if (input) {
        input.value = link;
    }
}

function getShareUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set(SHARE_TOKEN_KEY, encodeShareState(buildShareState()));
    return url.toString();
}

function setCheckboxValue(id, checked) {
    const checkbox = document.getElementById(id);
    if (!checkbox) {
        return;
    }

    checkbox.checked = checked;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
}

function syncLayerItemControls(layerName, layerState) {
    const layerItem = Array.from(document.querySelectorAll('.layer-item'))
        .find((item) => item.querySelector('.layer-name')?.textContent === layerName);

    if (!layerItem) {
        return;
    }

    const toggle = layerItem.querySelector('.layer-toggle');
    const slider = layerItem.querySelector('.transparency-slider');
    const value = layerItem.querySelector('.transparency-value');
    const colorPicker = layerItem.querySelector('.color-picker');

    if (toggle) {
        toggle.checked = layerState.visible !== false;
    }

    if (slider) {
        const opacityValue = Math.round((layerState.opacity ?? 1) * 100);
        slider.value = String(opacityValue);
        if (value) {
            value.textContent = `${opacityValue}%`;
        }
    }

    if (colorPicker && layerState.color) {
        colorPicker.value = layerState.color;
    }
}

function applyLayerState(layerState) {
    if (!layerState?.name) {
        return;
    }

    let record = getLayerRecord(layerState.name);

    if (!record && layerState.type === 'wms' && layerState.wmsUrl && layerState.wmsLayerName) {
        const { source, layer } = createWmsLayerConfig(layerState.wmsUrl, layerState.wmsLayerName);
        record = addWmsLayer(layerState.name, source, layer, {
            wmsUrl: layerState.wmsUrl,
            wmsLayerName: layerState.wmsLayerName,
            displayName: layerState.displayName || layerState.name,
            sourceCrs: layerState.sourceCrs || 'Unknown CRS',
            sourceCrsDetected: Boolean(layerState.sourceCrsDetected)
        });
        addLayerItem(layerState.name, record.color || '#2563eb', 0, {
            isWMS: true,
            visible: layerState.visible !== false
        });
    }

    if (!record && layerState.type === 'gp' && layerState.gpUrl && layerState.gpLayerName) {
        const layerInfo = {
            name: layerState.gpLayerName,
            title: layerState.displayName || layerState.name,
            type: layerState.gpLayerType || 'xyz',
            tileUrl: layerState.gpTileUrl || ''
        };
        const { source, layer } = createGpLayerConfig(layerState.gpUrl, layerInfo);
        record = addWmsLayer(layerState.name, source, layer, {
            isGP: true,
            gpUrl: layerState.gpUrl,
            gpLayerName: layerState.gpLayerName,
            gpLayerType: layerState.gpLayerType || 'xyz',
            gpTileUrl: layerState.gpTileUrl || '',
            displayName: layerState.displayName || layerState.name,
            sourceCrs: layerState.sourceCrs || 'Unknown CRS',
            sourceCrsDetected: Boolean(layerState.sourceCrsDetected)
        });
        addLayerItem(layerState.name, record.color || '#2563eb', 0, {
            isWMS: true,
            isGP: true,
            visible: layerState.visible !== false
        });
    }

    if (!record?.layer) {
        return;
    }

    const visible = layerState.visible !== false;
    const opacity = Number.isFinite(layerState.opacity) ? layerState.opacity : 1;

    record.layer.setVisible(visible);
    record.layer.setOpacity(opacity);
    record.opacity = opacity;
    record.sourceCrs = layerState.sourceCrs || record.sourceCrs || 'Unknown CRS';
    record.sourceCrsDetected = Boolean(layerState.sourceCrsDetected || record.sourceCrsDetected);

    if (!record.isWMS && layerState.color) {
        record.color = layerState.color;
    }

    if (!record.isWMS && typeof layerState.labelsVisible === 'boolean') {
        record.labelsVisible = layerState.labelsVisible;
        updateManagedLayerStyle(layerState.name);
    }

    syncLayerItemControls(layerState.name, layerState);
}

function restoreAnnotations(annotationStates = []) {
    const annotationLayer = ensureAnnotationLayer();
    annotationLayer.source.clear();

    annotationStates.forEach((annotationState) => {
        if (!annotationState?.text || !Array.isArray(annotationState.coordinates)) {
            return;
        }

        const [longitude, latitude] = annotationState.coordinates.map(Number);
        if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
            return;
        }

        const feature = new ol.Feature({
            geometry: new ol.geom.Point(ol.proj.fromLonLat([longitude, latitude])),
            text: annotationState.text,
            fontSize: Number(annotationState.fontSize) || 12,
            fontColor: annotationState.fontColor || '#000000',
            isAnnotation: true,
            isDragging: false
        });

        annotationLayer.source.addFeature(feature);
    });

    annotationLayer.layer.changed();
}

function restoreViewState(viewState) {
    const map = getMap();
    const view = map?.getView();
    if (!map || !view || !viewState?.center) {
        return;
    }

    const [longitude, latitude] = viewState.center.map(Number);
    if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
        view.setCenter(ol.proj.fromLonLat([longitude, latitude]));
    }

    if (Number.isFinite(viewState.zoom)) {
        view.setZoom(viewState.zoom);
    }

    if (Number.isFinite(viewState.rotation)) {
        view.setRotation(viewState.rotation);
    }
}

function getTimeStampForFileName() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
}

function createExportFileName(extension) {
    return `NAMRIA_GPMapComp_${getTimeStampForFileName()}.${extension}`;
}

function getLocalExportDate() {
    const now = new Date();
    return [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0')
    ].join('-');
}

function getMapProjectionLabel() {
    const projection = getMap()?.getView?.()?.getProjection?.();
    const projectionCode = projection?.getCode?.();

    if (!projectionCode) {
        return 'Unknown CRS';
    }

    if (projectionCode === 'EPSG:3857') {
        return 'EPSG:3857 Web Mercator';
    }

    if (projectionCode === 'EPSG:4326') {
        return 'EPSG:4326 WGS 84';
    }

    return projectionCode;
}

function getExportCrsLabel() {
    const activeLayerName = getState().currentLayerName;
    const activeLayerRecord = activeLayerName ? getLayerRecord(activeLayerName) : null;
    const activeLayerCrs = activeLayerRecord?.sourceCrs;

    if (
        activeLayerRecord?.sourceCrsDetected
        && activeLayerCrs
        && activeLayerCrs !== 'Unknown CRS'
    ) {
        return activeLayerCrs;
    }

    return getMapProjectionLabel();
}

function fitTextToWidth(context, text, maxWidth) {
    if (context.measureText(text).width <= maxWidth) {
        return text;
    }

    const ellipsis = '...';
    let trimmedText = text;

    while (trimmedText.length > 0 && context.measureText(`${trimmedText}${ellipsis}`).width > maxWidth) {
        trimmedText = trimmedText.slice(0, -1);
    }

    return trimmedText ? `${trimmedText}${ellipsis}` : ellipsis;
}

function drawExportDisclaimer(context, width, height) {
    const exportDate = getLocalExportDate();
    const footerHeight = Math.max(34, Math.round(height * 0.045));
    const fontSize = Math.max(11, Math.round(height * 0.0115));
    const horizontalPadding = Math.max(16, Math.round(width * 0.012));
    const baseLineY = height - Math.round((footerHeight - fontSize) / 2) + 1;
    const gutter = Math.max(20, Math.round(width * 0.018));
    const textColumnWidth = (width - (horizontalPadding * 2) - gutter) / 2;
    const leftText = `Generated from NAMRIA GP Map Composer | Projection: ${getExportCrsLabel()}`;
    const rightText = `Exported: ${exportDate} | For reference use only`;

    context.save();
    context.fillStyle = 'rgba(255, 255, 255, 0.88)';
    context.fillRect(0, height - footerHeight, width, footerHeight);
    context.strokeStyle = 'rgba(15, 23, 42, 0.12)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, height - footerHeight + 0.5);
    context.lineTo(width, height - footerHeight + 0.5);
    context.stroke();

    context.fillStyle = '#475569';
    context.font = `500 ${fontSize}px Inter, "Segoe UI", sans-serif`;
    context.textBaseline = 'alphabetic';
    context.textAlign = 'left';
    context.fillText(fitTextToWidth(context, leftText, textColumnWidth), horizontalPadding, baseLineY);

    context.fillStyle = '#64748b';
    context.font = `500 ${fontSize}px Inter, "Segoe UI", sans-serif`;
    context.textAlign = 'right';
    context.fillText(fitTextToWidth(context, rightText, textColumnWidth), width - horizontalPadding, baseLineY);
    context.restore();
}

function createOffscreenExportTarget(width, height) {
    const target = document.createElement('div');
    target.style.position = 'fixed';
    target.style.left = '-100000px';
    target.style.top = '0';
    target.style.width = `${width}px`;
    target.style.height = `${height}px`;
    target.style.pointerEvents = 'none';
    target.style.opacity = '0';
    document.body.appendChild(target);
    return target;
}

function waitForRenderComplete(map) {
    return new Promise((resolve) => {
        let resolved = false;
        const finish = () => {
            if (resolved) {
                return;
            }

            resolved = true;
            clearTimeout(timeoutId);
            resolve();
        };

        const timeoutId = window.setTimeout(finish, 3500);
        map.once('rendercomplete', finish);
        map.renderSync();
    });
}

async function renderMapToCanvas(width, height) {
    const mainMap = getMap();
    const mainView = mainMap?.getView();
    if (!mainMap || !mainView) {
        throw new Error('Map is not ready');
    }

    const target = createOffscreenExportTarget(width, height);
    const exportMap = new ol.Map({
        target,
        controls: [],
        layers: [],
        view: new ol.View({
            center: mainView.getCenter(),
            zoom: mainView.getZoom(),
            rotation: mainView.getRotation(),
            projection: mainView.getProjection()
        })
    });
    exportMap.getInteractions().clear();

    mainMap.getLayers().forEach((layer, index) => {
        const clonedLayer = clonePreviewLayer(layer, index);
        if (clonedLayer) {
            exportMap.addLayer(clonedLayer);
        }
    });

    exportMap.setSize([width, height]);
    await waitForRenderComplete(exportMap);

    const canvas = createExportCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) {
        exportMap.setTarget(null);
        target.remove();
        throw new Error('Failed to get canvas context');
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);

    try {
        const rendered = drawMapViewportToContext(exportMap, context, width, height);
        if (!rendered) {
            throw new Error('Map renderer did not produce an exportable frame');
        }

        drawExportDisclaimer(context, width, height);
    } finally {
        exportMap.setTarget(null);
        target.remove();
    }

    return canvas;
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

export async function downloadMap() {
    const format = document.getElementById('exportFormat')?.value || 'png';
    const resolution = document.getElementById('exportResolution')?.value || '1920x1080';
    const [width, height] = resolution.split('x').map(Number);

    try {
        const canvas = await renderMapToCanvas(width, height);

        if (format === 'png') {
            downloadCanvas(canvas, 'image/png', createExportFileName('png'), undefined, (blob) => {
                if (!blob) {
                    showToast('Error', 'Failed to create PNG export', 'error');
                    return;
                }

                showToast('Success', 'Map exported as PNG', 'success');
                closeModal('exportModal');
            });
            return;
        }

        if (format === 'jpeg') {
            downloadCanvas(canvas, 'image/jpeg', createExportFileName('jpg'), 0.92, (blob) => {
                if (!blob) {
                    showToast('Error', 'Failed to create JPEG export', 'error');
                    return;
                }

                showToast('Success', 'Map exported as JPEG', 'success');
                closeModal('exportModal');
            });
            return;
        }

        const pdfBlob = await createPdfBlobFromCanvas(canvas);
        downloadBlob(pdfBlob, createExportFileName('pdf'));
        showToast('Success', 'Map exported as PDF', 'success');
        closeModal('exportModal');
    } catch (error) {
        console.error('Export error:', error);
        showToast('Error', `Failed to export map: ${error.message}`, 'error');
    }
}

export async function copyToClipboard() {
    const input = getShareLinkInput();
    if (!input?.value) {
        return;
    }

    try {
        await navigator.clipboard.writeText(input.value);
        setShareFeedback('Share link copied to clipboard.', 'success');
    } catch (error) {
        try {
            input.focus();
            input.select();
            const copied = document.execCommand('copy');
            if (!copied) {
                throw new Error('Copy command rejected');
            }

            setShareFeedback('Share link copied to clipboard.', 'success');
        } catch (copyError) {
            setShareFeedback('Copy failed. Select the link manually and copy it.', 'warning');
            showToast('Copy Failed', 'Unable to copy the share link automatically', 'warning', 2400);
            return;
        }
    }
}

export function generateLink({ silent = false } = {}) {
    const link = getShareUrl();
    updateShareLinkInput(link);
    setShareFeedback(
        silent
            ? 'Share link updates here when you copy or regenerate the current map state.'
            : 'Fresh share link generated for the current map state.',
        silent ? 'neutral' : 'success'
    );

    if (!silent) {
        const input = getShareLinkInput();
        input?.focus();
        input?.select();
    }

    return link;
}

export function restoreSharedStateFromUrl() {
    if (sharedStateRestoreAttempted) {
        return false;
    }

    sharedStateRestoreAttempted = true;

    const url = new URL(window.location.href);
    const token = url.searchParams.get(SHARE_TOKEN_KEY);
    if (!token) {
        updateShareLinkInput(generateLink({ silent: true }));
        return false;
    }

    try {
        const state = decodeShareState(token);
        if (!state || state.v !== SHARE_TOKEN_VERSION) {
            throw new Error('Unsupported share token');
        }

        if (state.basemap) {
            changeBasemapLayer(state.basemap);
            const basemapSelect = document.getElementById('basemapSelect');
            if (basemapSelect) {
                basemapSelect.value = state.basemap;
            }
        }

        restoreViewState(state.view);
        restoreAnnotations(state.annotations);

        if (Array.isArray(state.layers)) {
            state.layers.forEach((layerState) => applyLayerState(layerState));
        }

        if (state.search) {
            restoreSearchState(state.search, { zoom: false });
        }

        if (state.settings) {
            setCheckboxValue('scaleBarToggle', state.settings.scaleBar !== false);
            setCheckboxValue('northArrowToggle', state.settings.northArrow !== false);
            setCheckboxValue('labelsToggle', Boolean(state.settings.labels));
            syncLabelsToggle();
        }

        updateShareLinkInput(generateLink({ silent: true }));
        showToast('Shared State Loaded', 'Map state restored from share link', 'success', 2200);
        return true;
    } catch (error) {
        console.error('Shared state restore failed:', error);
        updateShareLinkInput(generateLink({ silent: true }));
        showToast('Share Link Invalid', 'Unable to restore the shared map state', 'warning', 2400);
        return false;
    }
}
