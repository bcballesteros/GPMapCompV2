import { DEFAULT_LINE_STROKE_WIDTH, DEFAULT_POINT_SIZE } from '../config/constants.js';
import { removeManagedLayer, updateManagedLayerStyle } from '../map/layer-manager.js';
import { getLayerRecord, getState, setCurrentLayerName } from '../state/store.js';
import { syncLabelsToggle } from '../tools/labels-tool.js';
import { commitLayerOpacity as commitLayerOpacityValue, updateLayerOpacity as updateLayerOpacityValue } from '../tools/transparency-tool.js';

let layerNameTooltipElement = null;
let layerNameTooltipListenersBound = false;

function getEmptyStateMarkup() {
    return `
        <div class="empty-state">
            <div class="empty-state-icon" aria-hidden="true"><i class="fas fa-layer-group"></i></div>
            <div class="empty-state-title">No layers in this workspace</div>
            <div class="empty-state-text">Add a dataset to start styling, inspecting, and exporting your map composition.</div>
            <div class="empty-state-formats">Supported uploads: Shapefile (.zip), KML (.kml), GeoJSON (.geojson/.json), CSV (.csv)</div>
        </div>
    `;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function ensureLayerNameTooltip() {
    if (layerNameTooltipElement || typeof document === 'undefined') {
        return layerNameTooltipElement;
    }

    layerNameTooltipElement = document.createElement('div');
    layerNameTooltipElement.className = 'layer-name-tooltip';
    layerNameTooltipElement.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layerNameTooltipElement);

    if (!layerNameTooltipListenersBound) {
        const hideTooltip = () => hideLayerNameTooltip();
        window.addEventListener('scroll', hideTooltip, true);
        window.addEventListener('resize', hideTooltip);
        layerNameTooltipListenersBound = true;
    }

    return layerNameTooltipElement;
}

function isLayerNameTruncated(nameElement) {
    return Boolean(nameElement && nameElement.scrollWidth > nameElement.clientWidth + 1);
}

function positionLayerNameTooltip(anchorElement, tooltipElement) {
    if (!anchorElement || !tooltipElement) {
        return;
    }

    const rect = anchorElement.getBoundingClientRect();
    const spacing = 10;
    const viewportPadding = 12;
    const tooltipRect = tooltipElement.getBoundingClientRect();
    const maxLeft = window.innerWidth - tooltipRect.width - viewportPadding;
    const centeredLeft = rect.left + ((rect.width - tooltipRect.width) / 2);
    const left = Math.min(Math.max(centeredLeft, viewportPadding), Math.max(viewportPadding, maxLeft));

    let top = rect.bottom + spacing;
    if (top + tooltipRect.height > window.innerHeight - viewportPadding) {
        top = rect.top - tooltipRect.height - spacing;
    }
    if (top < viewportPadding) {
        top = viewportPadding;
    }

    tooltipElement.style.left = `${left}px`;
    tooltipElement.style.top = `${top}px`;
}

function showLayerNameTooltip(nameElement) {
    const tooltipElement = ensureLayerNameTooltip();
    if (!tooltipElement || !isLayerNameTruncated(nameElement)) {
        hideLayerNameTooltip();
        return;
    }

    tooltipElement.textContent = nameElement.textContent;
    tooltipElement.classList.add('visible');
    positionLayerNameTooltip(nameElement, tooltipElement);
}

function hideLayerNameTooltip() {
    if (!layerNameTooltipElement) {
        return;
    }

    layerNameTooltipElement.classList.remove('visible');
}

function attachLayerNameTooltip(layerItem) {
    const nameElement = layerItem?.querySelector('.layer-name');
    if (!nameElement) {
        return;
    }

    const showTooltip = () => showLayerNameTooltip(nameElement);
    const hideTooltip = () => hideLayerNameTooltip();
    const updateTooltip = () => {
        if (layerNameTooltipElement?.classList.contains('visible')) {
            showLayerNameTooltip(nameElement);
        }
    };

    nameElement.addEventListener('mouseenter', showTooltip);
    nameElement.addEventListener('focus', showTooltip);
    nameElement.addEventListener('mousemove', updateTooltip);
    nameElement.addEventListener('mouseleave', hideTooltip);
    nameElement.addEventListener('blur', hideTooltip);
}

export function addLayerItem(name, color, featureCount, options = {}) {
    const layerList = document.getElementById('layerList');
    if (layerList.querySelector('.empty-state')) {
        layerList.innerHTML = '';
    }

    const isWms = Boolean(options.isWMS);
    const record = getLayerRecord(name);
    const isGp = Boolean(options.isGP || record?.isGP);
    const isPointLayer = Boolean(record?.isPointLayer);
    const isLineLayer = Boolean(record?.isLineLayer);
    const isPolygonLayer = Boolean(record?.isPolygonLayer);
    const opacityValue = Math.round((record?.opacity ?? 1) * 100);
    const pointSizeValue = Math.round(record?.pointSize ?? DEFAULT_POINT_SIZE);
    const lineStrokeWidthValue = Math.round(record?.lineStrokeWidth ?? DEFAULT_LINE_STROKE_WIDTH);
    const polygonFillColor = record?.polygonFillColor || color;
    const polygonStrokeColor = record?.polygonStrokeColor || color;
    const polygonStrokeWidthValue = Math.round(record?.polygonStrokeWidth ?? DEFAULT_LINE_STROKE_WIDTH);
    const statsText = isWms
        ? `${isGp ? 'GP Layer' : 'WMS Layer'} • Remote`
        : `${featureCount} features • ${getState().uploadedLayers[name]?.geometryType || 'Mixed'}`;

    const colorControl = isWms || isPolygonLayer
        ? ''
        : `
            <div class="control-row">
                <label>
                    <span>${isPointLayer ? 'Point color:' : 'Color:'}</span>
                    <input type="color" class="color-picker" value="${color}" onchange="updateLayerColor(this)">
                </label>
            </div>
        `;
    const polygonStyleControls = !isWms && isPolygonLayer
        ? `
            <div class="control-row">
                <label>
                    <span>Fill color:</span>
                    <input type="color" class="color-picker polygon-fill-picker" value="${polygonFillColor}">
                </label>
            </div>
            <div class="control-row">
                <label>
                    <span>Border color:</span>
                    <input type="color" class="color-picker polygon-stroke-picker" value="${polygonStrokeColor}">
                </label>
            </div>
            <div class="control-row control-row-stack polygon-width-row">
                <div class="transparency-header">
                    <span class="control-label">Border width</span>
                    <span class="polygon-width-value">${polygonStrokeWidthValue}px</span>
                </div>
                <div class="transparency-control">
                    <input
                        type="range"
                        class="polygon-width-slider"
                        min="0"
                        max="12"
                        step="1"
                        value="${polygonStrokeWidthValue}"
                        title="Adjust polygon border width"
                        aria-label="Adjust polygon border width"
                    >
                </div>
            </div>
        `
        : '';
    const lineWidthControl = !isWms && isLineLayer
        ? `
            <div class="control-row control-row-stack line-width-row">
                <div class="transparency-header">
                    <span class="control-label">Stroke width</span>
                    <span class="line-width-value">${lineStrokeWidthValue}px</span>
                </div>
                <div class="transparency-control">
                    <input
                        type="range"
                        class="line-width-slider"
                        min="1"
                        max="12"
                        step="1"
                        value="${lineStrokeWidthValue}"
                        title="Adjust line stroke width"
                        aria-label="Adjust line stroke width"
                    >
                </div>
            </div>
        `
        : '';
    const pointSizeControl = !isWms && isPointLayer
        ? `
            <div class="control-row control-row-stack point-size-row">
                <div class="transparency-header">
                    <span class="control-label">Point size</span>
                    <span class="point-size-value">${pointSizeValue}px</span>
                </div>
                <div class="transparency-control">
                    <input
                        type="range"
                        class="point-size-slider"
                        min="2"
                        max="18"
                        step="1"
                        value="${pointSizeValue}"
                        title="Adjust point size"
                        aria-label="Adjust point size"
                    >
                </div>
            </div>
        `
        : '';
    const opacityLabel = !isWms && isPointLayer
        ? 'Point opacity'
        : !isWms && isLineLayer
            ? 'Line opacity'
            : 'Opacity';

    const isVisible = options.visible !== false;
    const safeName = escapeHtml(name);
    const layerHTML = `
        <div class="layer-item" onclick="selectLayer(this)">
            <input type="checkbox" class="layer-toggle" ${isVisible ? 'checked' : ''} title="Toggle layer visibility">
            <div class="layer-info">
                <div class="layer-name-wrap" data-tooltip="${safeName}">
                    <div class="layer-name" tabindex="0" aria-label="Layer name: ${safeName}">${safeName}</div>
                </div>
                <div class="layer-stats">${statsText}</div>
                <div class="layer-controls">
                    ${colorControl}
                    ${polygonStyleControls}
                    ${lineWidthControl}
                    ${pointSizeControl}
                    <div class="control-row control-row-stack">
                        <div class="transparency-header">
                            <span class="control-label">${opacityLabel}</span>
                            <span class="transparency-value">${opacityValue}%</span>
                        </div>
                        <div class="transparency-control">
                            <input
                                type="range"
                                class="transparency-slider"
                                min="0"
                                max="100"
                                value="${opacityValue}"
                                title="Adjust ${opacityLabel.toLowerCase()}"
                                aria-label="Adjust ${opacityLabel.toLowerCase()}"
                            >
                        </div>
                    </div>
                    <div class="control-row control-row-action">
                        <button class="layer-action-btn danger layer-action-btn-full" onclick="removeLayer(event)" title="Remove Layer"><i class="fas fa-trash"></i> Remove</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    layerList.insertAdjacentHTML('beforeend', layerHTML);

    const newItem = layerList.lastElementChild;
    selectLayer(newItem);
    attachLayerNameTooltip(newItem);
    const checkbox = newItem.querySelector('.layer-toggle');
    const colorPicker = newItem.querySelector('.color-picker:not(.polygon-fill-picker):not(.polygon-stroke-picker)');
    const polygonFillPicker = newItem.querySelector('.polygon-fill-picker');
    const polygonStrokePicker = newItem.querySelector('.polygon-stroke-picker');
    const opacitySlider = newItem.querySelector('.transparency-slider');
    const pointSizeSlider = newItem.querySelector('.point-size-slider');
    const lineWidthSlider = newItem.querySelector('.line-width-slider');
    const polygonWidthSlider = newItem.querySelector('.polygon-width-slider');

    checkbox.addEventListener('change', (event) => {
        event.stopPropagation();
        const record = getLayerRecord(name);
        if (record?.layer) {
            record.layer.setVisible(event.target.checked);
        }
    });

    if (colorPicker) {
        colorPicker.addEventListener('pointerdown', (event) => event.stopPropagation());
        colorPicker.addEventListener('click', (event) => event.stopPropagation());
        colorPicker.addEventListener('input', () => updateLayerColor(colorPicker));
    }

    if (polygonFillPicker) {
        polygonFillPicker.addEventListener('pointerdown', (event) => event.stopPropagation());
        polygonFillPicker.addEventListener('click', (event) => event.stopPropagation());
        polygonFillPicker.addEventListener('input', () => updatePolygonFillColor(polygonFillPicker));
    }

    if (polygonStrokePicker) {
        polygonStrokePicker.addEventListener('pointerdown', (event) => event.stopPropagation());
        polygonStrokePicker.addEventListener('click', (event) => event.stopPropagation());
        polygonStrokePicker.addEventListener('input', () => updatePolygonStrokeColor(polygonStrokePicker));
    }

    if (opacitySlider) {
        const commitOpacity = () => commitLayerOpacityValue(opacitySlider);

        opacitySlider.addEventListener('pointerdown', (event) => event.stopPropagation());
        opacitySlider.addEventListener('click', (event) => event.stopPropagation());
        opacitySlider.addEventListener('input', () => updateLayerOpacityValue(opacitySlider));
        opacitySlider.addEventListener('change', commitOpacity);
    }

    if (pointSizeSlider) {
        pointSizeSlider.addEventListener('pointerdown', (event) => event.stopPropagation());
        pointSizeSlider.addEventListener('click', (event) => event.stopPropagation());
        pointSizeSlider.addEventListener('input', () => updatePointSize(pointSizeSlider));
        pointSizeSlider.addEventListener('change', () => updatePointSize(pointSizeSlider));
    }

    if (lineWidthSlider) {
        lineWidthSlider.addEventListener('pointerdown', (event) => event.stopPropagation());
        lineWidthSlider.addEventListener('click', (event) => event.stopPropagation());
        lineWidthSlider.addEventListener('input', () => updateLineStrokeWidth(lineWidthSlider));
        lineWidthSlider.addEventListener('change', () => updateLineStrokeWidth(lineWidthSlider));
    }

    if (polygonWidthSlider) {
        polygonWidthSlider.addEventListener('pointerdown', (event) => event.stopPropagation());
        polygonWidthSlider.addEventListener('click', (event) => event.stopPropagation());
        polygonWidthSlider.addEventListener('input', () => updatePolygonStrokeWidth(polygonWidthSlider));
        polygonWidthSlider.addEventListener('change', () => updatePolygonStrokeWidth(polygonWidthSlider));
    }
}

export function selectLayer(element) {
    document.querySelectorAll('.layer-item').forEach((item) => item.classList.remove('active'));
    element.classList.add('active');

    const layerName = element.querySelector('.layer-name').textContent;
    setCurrentLayerName(layerName);
}

export function updateLayerColor(colorPicker) {
    const newColor = colorPicker.value;
    const layerItem = colorPicker.closest('.layer-item');
    const layerName = layerItem.querySelector('.layer-name').textContent;
    const record = getLayerRecord(layerName);

    if (!record) {
        return;
    }

    record.color = newColor;
    updateManagedLayerStyle(layerName);
}

export function updatePolygonFillColor(colorPicker) {
    const newColor = colorPicker.value;
    const layerItem = colorPicker.closest('.layer-item');
    const layerName = layerItem.querySelector('.layer-name').textContent;
    const record = getLayerRecord(layerName);

    if (!record || record.isWMS || !record.isPolygonLayer) {
        return;
    }

    record.color = newColor;
    record.polygonFillColor = newColor;
    updateManagedLayerStyle(layerName);
}

export function updatePolygonStrokeColor(colorPicker) {
    const newColor = colorPicker.value;
    const layerItem = colorPicker.closest('.layer-item');
    const layerName = layerItem.querySelector('.layer-name').textContent;
    const record = getLayerRecord(layerName);

    if (!record || record.isWMS || !record.isPolygonLayer) {
        return;
    }

    record.polygonStrokeColor = newColor;
    updateManagedLayerStyle(layerName);
}

export function updatePointSize(slider) {
    const pointSize = Number(slider.value);
    const layerItem = slider.closest('.layer-item');
    const layerName = layerItem.querySelector('.layer-name').textContent;
    const record = getLayerRecord(layerName);

    const valueEl = layerItem?.querySelector('.point-size-value');
    if (valueEl) {
        valueEl.textContent = `${pointSize}px`;
    }

    if (!record || record.isWMS || !record.isPointLayer || !Number.isFinite(pointSize)) {
        return;
    }

    record.pointSize = pointSize;
    updateManagedLayerStyle(layerName);
}

export function updateLineStrokeWidth(slider) {
    const strokeWidth = Number(slider.value);
    const layerItem = slider.closest('.layer-item');
    const layerName = layerItem.querySelector('.layer-name').textContent;
    const record = getLayerRecord(layerName);

    const valueEl = layerItem?.querySelector('.line-width-value');
    if (valueEl) {
        valueEl.textContent = `${strokeWidth}px`;
    }

    if (!record || record.isWMS || !record.isLineLayer || !Number.isFinite(strokeWidth)) {
        return;
    }

    record.lineStrokeWidth = strokeWidth;
    updateManagedLayerStyle(layerName);
}

export function updatePolygonStrokeWidth(slider) {
    const strokeWidth = Number(slider.value);
    const layerItem = slider.closest('.layer-item');
    const layerName = layerItem.querySelector('.layer-name').textContent;
    const record = getLayerRecord(layerName);

    const valueEl = layerItem?.querySelector('.polygon-width-value');
    if (valueEl) {
        valueEl.textContent = `${strokeWidth}px`;
    }

    if (!record || record.isWMS || !record.isPolygonLayer || !Number.isFinite(strokeWidth)) {
        return;
    }

    record.polygonStrokeWidth = strokeWidth;
    updateManagedLayerStyle(layerName);
}

export function updateLayerOpacity(slider) {
    updateLayerOpacityValue(slider);
}

export function commitLayerOpacity(slider) {
    commitLayerOpacityValue(slider);
}

export function removeLayer(event) {
    event.stopPropagation();

    const layerItem = event.target.closest('.layer-item');
    const layerName = layerItem.querySelector('.layer-name').textContent;
    removeLayerItem(layerName);
}

export function removeLayerItem(layerName) {
    const layerList = document.getElementById('layerList');
    const layerItem = Array.from(layerList?.querySelectorAll('.layer-item') || [])
        .find((item) => item.querySelector('.layer-name')?.textContent === layerName);

    if (!layerItem) {
        removeManagedLayer(layerName);
        return;
    }

    const wasActive = layerItem.classList.contains('active');
    removeManagedLayer(layerName);
    hideLayerNameTooltip();

    layerItem.remove();

    if (layerList.children.length === 0) {
        layerList.innerHTML = getEmptyStateMarkup();
        setCurrentLayerName(null);
    } else if (wasActive) {
        const nextItem = layerList.querySelector('.layer-item');
        if (nextItem) {
            selectLayer(nextItem);
        } else {
            setCurrentLayerName(null);
        }
    }

    syncLabelsToggle();
}
