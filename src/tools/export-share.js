import { createBasemapLayer } from '../config/basemaps.js';
import { createExportCanvas, createPdfBlobFromCanvas, downloadBlob, downloadCanvas } from '../services/export-service.js';
import { getLayerRecord, getMap, getState } from '../state/store.js';
import { closeModal } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';
import ol from '../lib/ol.js';

const EXPORT_LONG_EDGE_PX = 2560;
const EXPORT_MAX_PIXEL_AREA = 12000000;

const previewStates = {
    export: { map: null, renderToken: 0 },
    share: { map: null, renderToken: 0 }
};
let previewSyncScheduled = false;
let previewListenersBound = false;
let previewDebugSequence = 0;
const shareState = {
    selectedFormat: 'png',
    recipientEmail: '',
    pending: false,
    success: false,
    error: null
};

function getDebugRect(element) {
    const rect = element?.getBoundingClientRect?.();
    if (!rect) {
        return null;
    }

    return {
        width: Number(rect.width.toFixed(2)),
        height: Number(rect.height.toFixed(2)),
        left: Number(rect.left.toFixed(2)),
        top: Number(rect.top.toFixed(2))
    };
}

function getDebugMapSize(map) {
    const size = map?.getSize?.();
    return Array.isArray(size) ? [...size] : null;
}

function getDebugLayerSummary(map) {
    const layers = [];
    map?.getLayers?.().forEach((layer, index) => {
        const source = layer.getSource?.();
        layers.push({
            index,
            visible: layer.getVisible?.(),
            opacity: layer.getOpacity?.(),
            sourceType: source?.constructor?.name || null,
            sourceState: source?.getState?.() || null,
            basemapId: layer.get?.('basemapId') || null
        });
    });
    return layers;
}

function getDebugCanvasSummary(map) {
    const viewport = map?.getViewport?.();
    if (!viewport) {
        return [];
    }

    return Array.from(viewport.querySelectorAll('.ol-layer canvas, canvas.ol-layer')).map((canvas) => ({
        width: canvas.width,
        height: canvas.height,
        styleWidth: canvas.style.width,
        styleHeight: canvas.style.height,
        opacity: window.getComputedStyle(canvas).opacity
    }));
}

function getDebugMapRole(map) {
    if (map === previewStates.export.map) {
        return 'export-preview';
    }

    if (map === previewStates.share.map) {
        return 'share-preview';
    }

    if (map === getMap()) {
        return 'main';
    }

    return 'other';
}

function debugPreview(event, details = {}) {
    if (!window.__GP_PREVIEW_DEBUG__) {
        return;
    }

    const previewKind = details.previewKind || getActivePreviewKind();
    const { container, target, placeholder } = getPreviewElements(previewKind);
    const previewState = previewStates[previewKind];
    const mainMap = getMap();
    const entry = {
        sequence: ++previewDebugSequence,
        time: Number(performance.now().toFixed(2)),
        event,
        previewKind,
        previewRenderToken: previewState.renderToken,
        previewSyncScheduled,
        ready: container?.classList.contains('ready') || false,
        placeholderHidden: placeholder?.getAttribute('aria-hidden') || null,
        mainSize: getDebugMapSize(mainMap),
        mainTargetRect: getDebugRect(mainMap?.getTargetElement?.()),
        previewTargetRect: getDebugRect(target),
        previewSize: getDebugMapSize(previewState.map),
        mainLayers: getDebugLayerSummary(mainMap),
        previewLayers: getDebugLayerSummary(previewState.map),
        previewCanvases: getDebugCanvasSummary(previewState.map),
        activeBasemap: getState().activeBasemap,
        ...details
    };

    window.__GP_PREVIEW_DEBUG__.push(entry);
    console.info('[preview-debug]', entry);
}

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
export function updateExportFormatLabel() {
    const button = document.getElementById('downloadBtn');
    const format = document.querySelector('input[name="exportFormat"]:checked')?.value || 'png';
    if (button && !button.disabled) {
        button.innerHTML = '<i class="fas fa-download"></i> Download';
    }

    const helper = document.getElementById('exportFormatHelper');
    const helperText = {
        png: 'Lossless image format suitable for maps and presentations.',
        jpeg: 'Compressed image format with a smaller file size.',
        pdf: 'Document format suitable for viewing and printing.'
    };
    if (helper) {
        helper.textContent = helperText[format] || helperText.png;
    }
}

function getShareFeedbackElement() {
    return document.getElementById('shareFeedback');
}

function setShareFeedback(message, type = 'info') {
    const feedback = getShareFeedbackElement();
    if (!feedback) {
        return;
    }

    feedback.textContent = message;
    feedback.dataset.state = type;
}

function getPreviewElements(previewKind = 'export') {
    const prefix = previewKind === 'share' ? 'share' : 'map';
    return {
        container: document.getElementById(`${prefix}PreviewContainer`),
        target: document.getElementById(`${prefix}PreviewMap`),
        placeholder: document.getElementById(`${prefix}PreviewPlaceholder`)
    };
}

function getActivePreviewKind() {
    return document.getElementById('shareModal')?.classList.contains('active')
        ? 'share'
        : 'export';
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

function cloneXyzSource(source) {
    return new ol.source.XYZ({
        url: source.getUrls?.()?.[0] || source.getUrl?.(),
        urls: source.getUrls?.(),
        attributions: source.getAttributions?.(),
        crossOrigin: 'anonymous',
        minZoom: source.getMinZoom?.(),
        maxZoom: source.getMaxZoom?.(),
        projection: source.getProjection?.(),
        tileGrid: source.getTileGrid?.(),
        wrapX: source.getWrapX?.(),
        transition: 0
    });
}

function cloneMapLayer(layer, index) {
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
        let tileSource = source;
        if (source instanceof ol.source.TileWMS) {
            tileSource = cloneWmsSource(source);
        } else if (source instanceof ol.source.XYZ) {
            tileSource = cloneXyzSource(source);
        }

        const previewLayer = new ol.layer.Tile({
            source: tileSource,
            opacity: commonOptions.opacity,
            visible: commonOptions.visible
        });
        previewLayer.setZIndex(commonOptions.zIndex);
        return previewLayer;
    }

    return null;
}

function clonePreviewLayer(layer, index) {
    return cloneMapLayer(layer, index);
}

function ensurePreviewMap(previewKind = 'export', target = getPreviewElements(previewKind).target) {
    const previewState = previewStates[previewKind];
    if (previewState.map) {
        if (previewState.map.getTargetElement?.() !== target && target) {
            previewState.map.setTarget(target);
        }
        debugPreview('ensurePreviewMap:reuse');
        return previewState.map;
    }

    if (!target) {
        debugPreview('ensurePreviewMap:missing-target');
        return null;
    }

    const mainMap = getMap();
    const projection = mainMap?.getView().getProjection();
    debugPreview('ensurePreviewMap:create:before');

    previewState.map = new ol.Map({
        target,
        controls: [],
        layers: [],
        view: new ol.View({
            center: mainMap?.getView().getCenter() ?? [0, 0],
            zoom: mainMap?.getView().getZoom() ?? 1,
            projection
        })
    });

    previewState.map.getInteractions().clear();
    debugPreview('ensurePreviewMap:create:after');

    return previewState.map;
}

function rebuildPreviewLayers(mainMapInstance, previewKind = 'export') {
    const previewInstance = ensurePreviewMap(previewKind);
    if (!previewInstance || !mainMapInstance) {
        debugPreview('rebuildPreviewLayers:exit', {
            hasPreviewInstance: Boolean(previewInstance),
            hasMainMapInstance: Boolean(mainMapInstance)
        });
        return;
    }

    debugPreview('rebuildPreviewLayers:before');
    const previewLayers = previewInstance.getLayers();
    previewLayers.clear();

    mainMapInstance.getLayers().forEach((layer, index) => {
        const previewLayer = clonePreviewLayer(layer, index);
        if (previewLayer) {
            previewLayers.push(previewLayer);
        }
    });
    debugPreview('rebuildPreviewLayers:after');
}

function syncPreviewView(mainMapInstance, previewKind = 'export') {
    const previewInstance = ensurePreviewMap(previewKind);
    if (!previewInstance || !mainMapInstance) {
        debugPreview('syncPreviewView:exit', {
            hasPreviewInstance: Boolean(previewInstance),
            hasMainMapInstance: Boolean(mainMapInstance)
        });
        return;
    }

    debugPreview('syncPreviewView:before-updateSize');
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
    debugPreview('syncPreviewView:after', {
        mainSize,
        previewSize,
        center: previewView.getCenter(),
        zoom: previewView.getZoom(),
        rotation: previewView.getRotation()
    });
}

function bindPreviewSyncListeners() {
    if (previewListenersBound) {
        return;
    }

    const mainMap = getMap();
    if (!mainMap) {
        return;
    }

    const scheduleSync = (reason = 'unknown') => {
        debugPreview('scheduleSync:called', { reason });
        if (previewSyncScheduled) {
            debugPreview('scheduleSync:exit-already-scheduled', { reason });
            return;
        }

        previewSyncScheduled = true;
        requestAnimationFrame(() => {
            previewSyncScheduled = false;
            debugPreview('scheduleSync:invoke-render', { reason });
            const previewKind = getActivePreviewKind();
            renderMapPreview(`sync:${reason}`, previewKind).catch((error) => {
                console.warn(`[preview] ${previewKind} refresh failed`, error);
            });
        });
    };

    mainMap.on('moveend', () => scheduleSync('moveend'));
    mainMap.getLayers().on('add', (event) => {
        event.element?.on('change', () => scheduleSync('layer-change'));
        scheduleSync('layers-add');
    });
    mainMap.getLayers().on('remove', () => scheduleSync('layers-remove'));
    mainMap.getLayers().forEach((layer) => layer.on('change', () => scheduleSync('layer-change')));
    previewListenersBound = true;
    debugPreview('bindPreviewSyncListeners:bound');
}

function rebuildMapLayers(targetMap, sourceMap) {
    const targetLayers = targetMap.getLayers();
    targetLayers.clear();

    sourceMap.getLayers().forEach((layer, index) => {
        const clonedLayer = cloneMapLayer(layer, index);
        if (clonedLayer) {
            targetLayers.push(clonedLayer);
        }
    });
}

function waitForAnimationFrame() {
    return new Promise((resolve) => {
        requestAnimationFrame(resolve);
    });
}

function getRenderedElementRect(element) {
    if (!element?.isConnected) {
        return null;
    }

    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || rect.width <= 0 || rect.height <= 0) {
        return null;
    }

    return rect;
}

function waitForElementRenderedSize(element) {
    if (getRenderedElementRect(element)) {
        debugPreview('waitForElementRenderedSize:ready-immediate', {
            rect: getDebugRect(element)
        });
        return Promise.resolve();
    }

    debugPreview('waitForElementRenderedSize:wait-start', {
        rect: getDebugRect(element)
    });
    return new Promise((resolve) => {
        let resizeObserver = null;
        let mutationObserver = null;
        let animationFrameId = null;

        const cleanup = () => {
            if (animationFrameId !== null) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }

            resizeObserver?.disconnect();
            mutationObserver?.disconnect();
        };

        const check = () => {
            if (!getRenderedElementRect(element)) {
                return false;
            }

            cleanup();
            debugPreview('waitForElementRenderedSize:ready-after-wait', {
                rect: getDebugRect(element)
            });
            resolve();
            return true;
        };

        const scheduleCheck = () => {
            if (animationFrameId !== null) {
                return;
            }

            animationFrameId = requestAnimationFrame(() => {
                animationFrameId = null;
                check();
            });
        };

        if (typeof ResizeObserver === 'function') {
            resizeObserver = new ResizeObserver(scheduleCheck);
            resizeObserver.observe(element);

            let parent = element.parentElement;
            while (parent && parent !== document.body) {
                resizeObserver.observe(parent);
                parent = parent.parentElement;
            }
        }

        if (typeof MutationObserver === 'function') {
            mutationObserver = new MutationObserver(scheduleCheck);
            mutationObserver.observe(document.documentElement, {
                attributes: true,
                attributeFilter: ['class', 'hidden', 'style'],
                childList: true,
                subtree: true
            });
        }

        scheduleCheck();
    });
}

function hasUsableMapSize(map) {
    const size = map?.getSize?.();
    return Array.isArray(size) && size[0] > 0 && size[1] > 0;
}

async function ensureMapRenderedSize(map, targetElement) {
    const renderTarget = targetElement || map?.getTargetElement?.();
    if (!map || !renderTarget) {
        debugPreview('ensureMapRenderedSize:exit', {
            role: getDebugMapRole(map),
            hasMap: Boolean(map),
            hasRenderTarget: Boolean(renderTarget)
        });
        return false;
    }

    debugPreview('ensureMapRenderedSize:before', {
        role: getDebugMapRole(map),
        targetRect: getDebugRect(renderTarget)
    });
    await waitForElementRenderedSize(renderTarget);
    map.updateSize();
    debugPreview('ensureMapRenderedSize:after-first-update', {
        role: getDebugMapRole(map)
    });
    await waitForAnimationFrame();
    map.updateSize();
    debugPreview('ensureMapRenderedSize:after-second-update', {
        role: getDebugMapRole(map),
        usable: hasUsableMapSize(map)
    });

    return hasUsableMapSize(map);
}

function hasRenderedMapCanvas(map) {
    const viewport = map?.getViewport?.();
    if (!viewport || !hasUsableMapSize(map)) {
        return false;
    }

    return Array.from(viewport.querySelectorAll('.ol-layer canvas, canvas.ol-layer')).some(isRenderableCanvas);
}

async function waitForPreviewFrame(map) {
    debugPreview('waitForPreviewFrame:start');
    await waitForMapSettledRender(map);
    if (hasRenderedMapCanvas(map)) {
        debugPreview('waitForPreviewFrame:canvas-after-settled');
        return true;
    }

    map?.updateSize?.();
    debugPreview('waitForPreviewFrame:no-canvas-retry');
    await waitForAnimationFrame();
    await waitForMapSettledRender(map, { sync: true });

    const hasCanvas = hasRenderedMapCanvas(map);
    debugPreview('waitForPreviewFrame:done', { hasCanvas });
    return hasCanvas;
}

function getVisibleLayerSources(map) {
    const sources = [];

    map?.getLayers?.().forEach((layer) => {
        if (layer.getVisible?.() === false) {
            return;
        }

        const source = layer.getSource?.();
        if (source) {
            sources.push(source);
        }
    });

    return sources;
}

function waitForViewIdle(map) {
    const view = map?.getView?.();
    if (!view || (!view.getAnimating?.() && !view.getInteracting?.())) {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        const key = view.on('change', () => {
            if (view.getAnimating?.() || view.getInteracting?.()) {
                return;
            }

            ol.Observable.unByKey(key);
            resolve();
        });
    });
}

function waitForMapRenderComplete(map, { sync = false } = {}) {
    if (!map) {
        debugPreview('waitForMapRenderComplete:exit-no-map');
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        const role = getDebugMapRole(map);
        const sourceEvents = [];
        let pendingLoads = 0;
        let renderComplete = false;
        let resolved = false;

        debugPreview('waitForMapRenderComplete:start', {
            role,
            sync,
            sourceCount: getVisibleLayerSources(map).length
        });

        const cleanup = () => {
            sourceEvents.forEach((key) => ol.Observable.unByKey(key));
        };

        const finishIfReady = () => {
            if (resolved || !renderComplete || pendingLoads > 0) {
                debugPreview('waitForMapRenderComplete:not-ready', {
                    role,
                    sync,
                    pendingLoads,
                    renderComplete,
                    resolved
                });
                return;
            }

            resolved = true;
            cleanup();
            debugPreview('waitForMapRenderComplete:resolved', {
                role,
                sync,
                pendingLoads,
                renderComplete
            });
            resolve();
        };

        const handleLoadStart = (eventName, source) => {
            pendingLoads += 1;
            renderComplete = false;
            debugPreview('source-load:start', {
                role,
                eventName,
                pendingLoads,
                sourceType: source?.constructor?.name || null,
                sourceState: source?.getState?.() || null
            });
        };

        const handleLoadEnd = (eventName, source) => {
            pendingLoads = Math.max(0, pendingLoads - 1);
            debugPreview('source-load:end', {
                role,
                eventName,
                pendingLoads,
                sourceType: source?.constructor?.name || null,
                sourceState: source?.getState?.() || null
            });
            finishIfReady();
        };

        getVisibleLayerSources(map).forEach((source) => {
            [
                'tileloadstart',
                'tileloadend',
                'tileloaderror',
                'imageloadstart',
                'imageloadend',
                'imageloaderror'
            ].forEach((eventName) => {
                const listener = eventName.endsWith('start')
                    ? () => handleLoadStart(eventName, source)
                    : () => handleLoadEnd(eventName, source);
                sourceEvents.push(source.on(eventName, listener));
            });
        });

        map.once('rendercomplete', () => {
            renderComplete = true;
            debugPreview('map-rendercomplete', {
                role,
                sync,
                pendingLoads
            });
            finishIfReady();
        });

        if (sync) {
            debugPreview('waitForMapRenderComplete:renderSync', { role });
            map.renderSync();
            return;
        }

        debugPreview('waitForMapRenderComplete:render', { role });
        map.render();
    });
}

async function waitForMapSettledRender(map, options) {
    debugPreview('waitForMapSettledRender:start', {
        role: getDebugMapRole(map),
        options: options || {}
    });
    await waitForViewIdle(map);
    await waitForMapRenderComplete(map, options);
    debugPreview('waitForMapSettledRender:done', {
        role: getDebugMapRole(map),
        options: options || {}
    });
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
    const disclaimerText = `Generated from NAMRIA GP Map Composer | ${crsLabel} | ${exportDate}`;

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

function getExportCanvasSize(map) {
    const [mapWidth = 0, mapHeight = 0] = map?.getSize?.() || [];

    if (mapWidth <= 0 || mapHeight <= 0) {
        return {
            width: EXPORT_LONG_EDGE_PX,
            mapHeight: Math.round(EXPORT_LONG_EDGE_PX * 9 / 16)
        };
    }

    const longEdgeScale = EXPORT_LONG_EDGE_PX / Math.max(mapWidth, mapHeight);
    const areaScale = Math.sqrt(EXPORT_MAX_PIXEL_AREA / (mapWidth * mapHeight));
    const scale = Math.min(longEdgeScale, areaScale);

    return {
        width: Math.max(1, Math.round(mapWidth * scale)),
        mapHeight: Math.max(1, Math.round(mapHeight * scale))
    };
}

function createExportMapTarget(width, height) {
    const target = document.createElement('div');
    target.style.position = 'fixed';
    target.style.left = '-100000px';
    target.style.top = '0';
    target.style.width = `${width}px`;
    target.style.height = `${height}px`;
    target.style.overflow = 'hidden';
    target.style.pointerEvents = 'none';
    target.setAttribute('aria-hidden', 'true');
    document.body.appendChild(target);
    return target;
}

function syncExportView(exportMap, mainMap, exportSize) {
    const mainView = mainMap.getView();
    const mainSize = mainMap.getSize();
    const exportView = exportMap.getView();

    if (mainSize) {
        exportView.fit(mainView.calculateExtent(mainSize), {
            size: exportSize,
            duration: 0,
            nearest: false
        });
    } else {
        exportView.setCenter(mainView.getCenter());
        exportView.setResolution(mainView.getResolution());
    }

    exportView.setRotation(mainView.getRotation() || 0);
}

async function renderExportMapToCanvas(mainMap, width, height) {
    const target = createExportMapTarget(width, height);
    const mainView = mainMap.getView();
    const exportMap = new ol.Map({
        target,
        controls: [],
        interactions: [],
        layers: [],
        pixelRatio: 1,
        view: new ol.View({
            center: mainView.getCenter(),
            resolution: mainView.getResolution(),
            rotation: mainView.getRotation() || 0,
            projection: mainView.getProjection()
        })
    });

    try {
        rebuildMapLayers(exportMap, mainMap);
        exportMap.updateSize();
        syncExportView(exportMap, mainMap, [width, height]);
        await waitForMapSettledRender(exportMap, { sync: true });

        const mapCanvas = createExportCanvas(width, height);
        const mapContext = mapCanvas.getContext('2d');

        if (!mapContext) {
            throw new Error('Failed to get map canvas context');
        }

        mapContext.imageSmoothingEnabled = false;

        const rendered = drawMapViewportToContext(
            exportMap,
            mapContext,
            width,
            height,
            0,
            0
        );

        if (!rendered) {
            throw new Error('Map renderer did not produce an exportable frame');
        }

        return mapCanvas;
    } finally {
        exportMap.setTarget(null);
        target.remove();
    }
}

async function renderMapToCanvas() {
    const mainMap = getMap();
    if (!mainMap) {
        throw new Error('Map is not ready');
    }

    const { width, mapHeight } = getExportCanvasSize(mainMap);
    const footerHeight = Math.max(24, Math.round(mapHeight * 0.025));
    const height = mapHeight + footerHeight;

    await waitForMapSettledRender(mainMap, { sync: true });

    const mapCanvas = await renderExportMapToCanvas(mainMap, width, mapHeight);

    const exportCanvas = createExportCanvas(width, height);
    const context = exportCanvas.getContext('2d');

    if (!context) {
        throw new Error('Failed to get canvas context');
    }

    context.imageSmoothingEnabled = false;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(
        mapCanvas,
        0,
        0,
        width,
        mapHeight,
        0,
        0,
        width,
        mapHeight
    );

    drawExportFooter(context, width, height, footerHeight);

    return exportCanvas;
}

export async function renderMapPreview(reason = 'direct', previewKind = 'export') {
    const { container, target, placeholder } = getPreviewElements(previewKind);
    const mainMap = getMap();

    debugPreview('renderMapPreview:start', {
        reason,
        hasContainer: Boolean(container),
        hasTarget: Boolean(target),
        hasPlaceholder: Boolean(placeholder),
        hasMainMap: Boolean(mainMap)
    });

    if (!container || !target || !placeholder || !mainMap) {
        debugPreview('renderMapPreview:exit-missing-elements', { reason });
        return;
    }

    const previewState = previewStates[previewKind] || previewStates.export;
    bindPreviewSyncListeners();
    const renderToken = ++previewState.renderToken;
    debugPreview('renderMapPreview:token-created', { reason, renderToken });

    await waitForElementRenderedSize(target);
    if (renderToken !== previewState.renderToken) {
        debugPreview('renderMapPreview:exit-token-after-target-size', {
            reason,
            renderToken,
            currentToken: previewState.renderToken
        });
        return;
    }

    const previewInstance = ensurePreviewMap(previewKind, target);
    if (!previewInstance || renderToken !== previewState.renderToken) {
        debugPreview('renderMapPreview:exit-after-ensure-preview-map', {
            reason,
            previewKind,
            renderToken,
            currentToken: previewState.renderToken,
            hasPreviewInstance: Boolean(previewInstance)
        });
        return;
    }

    await ensureMapRenderedSize(previewInstance, target);
    if (renderToken !== previewState.renderToken) {
        debugPreview('renderMapPreview:exit-token-after-preview-size', {
            reason,
            renderToken,
            currentToken: previewState.renderToken
        });
        return;
    }

    container.classList.remove('ready');
    placeholder.setAttribute('aria-hidden', 'false');
    debugPreview('renderMapPreview:placeholder-shown', { reason, renderToken });

    await ensureMapRenderedSize(mainMap);
    await waitForMapSettledRender(mainMap, { sync: true });
    if (renderToken !== previewState.renderToken) {
        debugPreview('renderMapPreview:exit-token-after-main-render', {
            reason,
            renderToken,
            currentToken: previewState.renderToken
        });
        return;
    }

    rebuildPreviewLayers(mainMap, previewKind);
    await ensureMapRenderedSize(previewInstance, target);
    syncPreviewView(mainMap, previewKind);
    const renderedFrame = await waitForPreviewFrame(previewInstance);

    if (!renderedFrame || renderToken !== previewState.renderToken) {
        debugPreview('renderMapPreview:exit-before-ready', {
            reason,
            renderToken,
            currentToken: previewState.renderToken,
            renderedFrame
        });
        return;
    }

    container.classList.add('ready');
    placeholder.setAttribute('aria-hidden', 'true');
    debugPreview('renderMapPreview:ready-applied', { reason, renderToken });
                                }

export async function downloadMap() {
    const format = document.querySelector('input[name="exportFormat"]:checked')?.value || 'png';

    setExportBusyState(true);

    try {
        const canvas = await renderMapToCanvas();

        if (format === 'png') {
            downloadCanvas(canvas, 'image/png', createExportFileName('png'), undefined, (blob) => {
                if (!blob) {
                    showToast('Export Failed', 'Could not create the PNG export.', 'error');
                    return;
                }

                showToast('Export Complete', 'PNG export completed.', 'success');
                closeModal('exportModal');
            });
            return;
        }

        if (format === 'jpeg') {
            downloadCanvas(canvas, 'image/jpeg', createExportFileName('jpg'), 0.98, (blob) => {
                if (!blob) {
                    showToast('Export Failed', 'Could not create the JPEG export.', 'error');
                    return;
                }

                showToast('Export Complete', 'JPEG export completed.', 'success');
                closeModal('exportModal');
            });
            return;
        }

        const pdfBlob = await createPdfBlobFromCanvas(canvas);
        downloadBlob(pdfBlob, createExportFileName('pdf'));
        showToast('Export Complete', 'PDF export completed.', 'success');
        closeModal('exportModal');
    } catch (error) {
        console.error('Export error:', error);
        showToast('Export Failed', 'The export could not be completed.', 'error');
    } finally {
        setExportBusyState(false);
    }
}

export function sendMap(event) {
    event?.preventDefault();

    const form = document.getElementById('shareForm');
    const emailInput = document.getElementById('recipientEmail');
    const formatInput = document.getElementById('shareFormat');
    const sendButton = document.getElementById('sendShareBtn');

    if (!form || !emailInput || !formatInput || !sendButton || !form.checkValidity()) {
        form?.reportValidity();
        return false;
    }

    shareState.recipientEmail = emailInput.value.trim();
    shareState.selectedFormat = formatInput.value;
    shareState.pending = false;
    shareState.success = false;
    shareState.error = null;

    // The delivery operation is intentionally reserved for the future backend.
    setShareFeedback('');
    sendButton.disabled = false;
    sendButton.setAttribute('aria-busy', 'false');
    return false;
}

export function setSharePending(isPending) {
    shareState.pending = Boolean(isPending);
    const sendButton = document.getElementById('sendShareBtn');
    if (!sendButton) {
        return;
    }

    sendButton.disabled = shareState.pending;
    sendButton.setAttribute('aria-busy', shareState.pending ? 'true' : 'false');
    sendButton.innerHTML = shareState.pending
        ? '<i class="fas fa-spinner fa-spin"></i> Sending...'
        : '<i class="fas fa-paper-plane"></i> Send';
}

export function setShareResult({ success = false, error = null } = {}) {
    shareState.pending = false;
    shareState.success = Boolean(success);
    shareState.error = error;
    setSharePending(false);
    setShareFeedback(success ? 'Map shared successfully.' : (error || ''), success ? 'success' : 'warning');
}
