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

function setExportBusyState(isBusy) {
    const downloadButton = document.getElementById('downloadBtn');
    if (!downloadButton) {
        return;
    }

    downloadButton.disabled = isBusy;
    downloadButton.setAttribute('aria-busy', isBusy ? 'true' : 'false');
    downloadButton.innerHTML = isBusy
        ? '<i class="fas fa-spinner fa-spin"></i> Exporting'
        : '<i class="fas fa-download"></i> Download';
}

function setShareFeedback(message, type = 'neutral') {
    showToast(message, type);
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
    const computedStyle = window.getComputedStyle(canvas);
    const transform = computedStyle.transform;
    const rect = canvas.getBoundingClientRect();
    const widthRatio = rect.width && canvas.width ? rect.width / canvas.width : 1;
    const heightRatio = rect.height && canvas.height ? rect.height / canvas.height : 1;

    if (transform && transform !== 'none') {
        const match = transform.match(/^matrix\((.+)\)$/);
        if (match) {
            const matrix = match[1].split(',').map(Number);
            return [
                matrix[0] * widthRatio,
                matrix[1] * heightRatio,
                matrix[2] * widthRatio,
                matrix[3] * heightRatio,
                matrix[4] * widthRatio,
                matrix[5] * heightRatio
            ];
        }
    }

    return [
        widthRatio,
        0,
        0,
        heightRatio,
        0,
        0
    ];
}



function drawMapViewportToContext(map, context, outputWidth, outputHeight, offsetX = 0, offsetY = 0) {
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
            matrix[4] * scaleX + offsetX,
            matrix[5] * scaleY + offsetY
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
                pointSize: Number(record.pointSize) || undefined,
                svgMarkerDataUrl: record.svgMarkerDataUrl || undefined,
                lineStrokeWidth: Number(record.lineStrokeWidth) || undefined,
                polygonFillColor: record.polygonFillColor || undefined,
                polygonStrokeColor: record.polygonStrokeColor || undefined,
                polygonStrokeWidth: Number(record.polygonStrokeWidth) || undefined,
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
    const polygonFillPicker = layerItem.querySelector('.polygon-fill-picker');
    const polygonStrokePicker = layerItem.querySelector('.polygon-stroke-picker');
    const pointSizeSlider = layerItem.querySelector('.point-size-slider');
    const pointSizeValue = layerItem.querySelector('.point-size-value');
    const lineWidthSlider = layerItem.querySelector('.line-width-slider');
    const lineWidthValue = layerItem.querySelector('.line-width-value');
    const polygonWidthSlider = layerItem.querySelector('.polygon-width-slider');
    const polygonWidthValue = layerItem.querySelector('.polygon-width-value');

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

    if (polygonFillPicker && layerState.polygonFillColor) {
        polygonFillPicker.value = layerState.polygonFillColor;
    }

    if (polygonStrokePicker && layerState.polygonStrokeColor) {
        polygonStrokePicker.value = layerState.polygonStrokeColor;
    }

    if (pointSizeSlider && Number.isFinite(layerState.pointSize)) {
        pointSizeSlider.value = String(layerState.pointSize);
        if (pointSizeValue) {
            pointSizeValue.textContent = `${layerState.pointSize}px`;
        }
    }

    if (lineWidthSlider && Number.isFinite(layerState.lineStrokeWidth)) {
        lineWidthSlider.value = String(layerState.lineStrokeWidth);
        if (lineWidthValue) {
            lineWidthValue.textContent = `${layerState.lineStrokeWidth}px`;
        }
    }

    if (polygonWidthSlider && Number.isFinite(layerState.polygonStrokeWidth)) {
        polygonWidthSlider.value = String(layerState.polygonStrokeWidth);
        if (polygonWidthValue) {
            polygonWidthValue.textContent = `${layerState.polygonStrokeWidth}px`;
        }
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

    if (!record.isWMS && Number.isFinite(layerState.pointSize)) {
        record.pointSize = layerState.pointSize;
    }

    if (!record.isWMS && typeof layerState.svgMarkerDataUrl === 'string') {
        record.svgMarkerDataUrl = layerState.svgMarkerDataUrl;
    }

    if (!record.isWMS && Number.isFinite(layerState.lineStrokeWidth)) {
        record.lineStrokeWidth = layerState.lineStrokeWidth;
    }

    if (!record.isWMS && layerState.polygonFillColor) {
        record.polygonFillColor = layerState.polygonFillColor;
        record.color = layerState.polygonFillColor;
    }

    if (!record.isWMS && layerState.polygonStrokeColor) {
        record.polygonStrokeColor = layerState.polygonStrokeColor;
    }

    if (!record.isWMS && Number.isFinite(layerState.polygonStrokeWidth)) {
        record.polygonStrokeWidth = layerState.polygonStrokeWidth;
    }

    if (!record.isWMS && typeof layerState.labelsVisible === 'boolean') {
        record.labelsVisible = layerState.labelsVisible;
    }

    if (!record.isWMS) {
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

function drawExportFooter(context, canvasWidth, canvasHeight, footerHeight) {
    if (footerHeight <= 0 || canvasWidth <= 0 || canvasHeight <= 0) {
        return;
    }

    const padding = Math.max(8, Math.round(canvasWidth * 0.008));
    const footerY = canvasHeight - footerHeight;
    const footerWidth = canvasWidth;

    const exportDate = getLocalExportDate();
    const crsLabel = getExportCrsLabel();
    const disclaimerText = `Generated from NAMRIA GP Map Composer · ${crsLabel} · ${exportDate}`;

    context.save();

    // Draw a subtle low-contrast footer strip below the map
    context.fillStyle = 'rgba(0, 0, 0, 0.05)';
    context.fillRect(0, footerY, footerWidth, footerHeight);

    context.strokeStyle = 'rgba(0, 0, 0, 0.08)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, footerY + 0.5);
    context.lineTo(footerWidth, footerY + 0.5);
    context.stroke();

    context.fillStyle = 'rgba(24, 24, 24, 0.8)';
    const fontSize = Math.max(10, Math.round(footerHeight * 0.55));
    context.font = `${fontSize}px 'Helvetica Neue', Arial, sans-serif`;
    context.textBaseline = 'middle';
    context.textAlign = 'left';

    let displayText = disclaimerText;
    const maxTextWidth = footerWidth - padding * 2;

    while (displayText.length > 0 && context.measureText(displayText + '...').width > maxTextWidth) {
        displayText = displayText.slice(0, -1);
    }
    if (displayText.length > 0 && displayText !== disclaimerText) {
        displayText = displayText.trimEnd() + '...';
    }

    context.fillText(displayText, padding, footerY + footerHeight / 2);
    context.restore();
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
    if (!mainMap) {
        throw new Error('Map is not ready');
    }

    // CRITICAL: Get map container and save original dimensions
    const mapContainer = document.getElementById('mapContainer');
    if (!mapContainer) {
        throw new Error('Map container not found');
    }

    const originalWidth = mapContainer.offsetWidth;
    const originalHeight = mapContainer.offsetHeight;
    const originalDisplay = mapContainer.style.display;
    const originalPosition = mapContainer.style.position;
    const originalTop = mapContainer.style.top;
    const originalLeft = mapContainer.style.left;

    try {
        const footerHeight = Math.max(24, Math.round(height * 0.025));
        const mapExportHeight = height - footerHeight;

        // CRITICAL: Capture current view state BEFORE any resize
        const view = mainMap.getView?.();
        const savedCenter = view?.getCenter ? (view.getCenter() ? Array.from(view.getCenter()) : null) : null;
        const savedResolution = typeof view?.getResolution === 'function' ? view.getResolution() : (typeof view?.getZoom === 'function' ? view.getZoom() : null);
        const savedRotation = typeof view?.getRotation === 'function' ? view.getRotation() : 0;

        // CRITICAL FIX: Use EXACT export resolution, NO aspect ratio constraint
        // This ensures user-selected resolution is respected (e.g., 1920x1080, 2560x1440, 4K)
        const exportMapWidth = width;
        const exportMapHeight = mapExportHeight;

        // CRITICAL: Resize map container to EXACT export dimensions
        mapContainer.style.display = 'block';
        mapContainer.style.position = 'fixed';
        mapContainer.style.top = '-9999px';
        mapContainer.style.left = '-9999px';
        mapContainer.style.width = `${exportMapWidth}px`;
        mapContainer.style.height = `${exportMapHeight}px`;
        mapContainer.style.overflow = 'hidden';
        mapContainer.style.pointerEvents = 'none';

        // CRITICAL: Update map size so OL recognizes new container dimensions
        mainMap.updateSize();

        // CRITICAL: Re-apply saved view state to new container size
        const postView = mainMap.getView();
        if (postView) {
            if (Array.isArray(savedCenter) && savedCenter.length === 2) {
                postView.setCenter(savedCenter);
            }
            if (Number.isFinite(savedResolution)) {
                // setResolution preserves exact map extent/scale
                if (typeof postView.setResolution === 'function') {
                    postView.setResolution(savedResolution);
                } else if (typeof postView.setZoom === 'function') {
                    postView.setZoom(savedResolution);
                }
            }
            if (Number.isFinite(savedRotation)) {
                postView.setRotation(savedRotation);
            }
        }

        // Force synchronous render and then wait for rendercomplete
        mainMap.renderSync();
        await waitForRenderComplete(mainMap);

        // CRITICAL: Create canvas at EXACT export dimensions (no scaling fallback)
        const mapCanvas = createExportCanvas(exportMapWidth, exportMapHeight);
        const mapContext = mapCanvas.getContext('2d');

        if (!mapContext) {
            throw new Error('Failed to get map canvas context');
        }

        mapContext.imageSmoothingEnabled = true;
        mapContext.imageSmoothingQuality = 'high';

        // Draw map directly at full resolution (no offset needed - already at target size)
        const rendered = drawMapViewportToContext(
            mainMap,
            mapContext,
            exportMapWidth,
            exportMapHeight,
            0,
            0
        );

        if (!rendered) {
            throw new Error('Map renderer did not produce an exportable frame');
        }

        // Create final export canvas with map + footer at requested resolution
        const exportCanvas = createExportCanvas(width, height);
        const context = exportCanvas.getContext('2d');

        if (!context) {
            throw new Error('Failed to get canvas context');
        }

        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';

        // Fill background
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);

        // CRITICAL FIX: Draw map directly at top of canvas (no aspect ratio margins)
        // Map is already at correct size, so draw at 1:1 without centering offsets
        context.drawImage(
            mapCanvas,
            0,
            0,
            exportMapWidth,
            exportMapHeight,
            0,
            0,
            exportMapWidth,
            exportMapHeight
        );

        // Draw footer in dedicated space below map
        drawExportFooter(context, width, height, footerHeight);

        return exportCanvas;
    } finally {
        // CRITICAL: Always restore original map container dimensions
        // This ensures the UI returns to normal state
        mapContainer.style.width = `${originalWidth}px`;
        mapContainer.style.height = `${originalHeight}px`;
        mapContainer.style.display = originalDisplay;
        mapContainer.style.position = originalPosition;
        mapContainer.style.top = originalTop;
        mapContainer.style.left = originalLeft;
        mapContainer.style.overflow = '';
        mapContainer.style.pointerEvents = '';

        // Update map size back to normal
        mainMap.updateSize();
    }
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

    setExportBusyState(true);

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
        showToast('Error', 'Export failed. Please try again.', 'error');
    } finally {
        setExportBusyState(false);
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
