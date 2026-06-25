import { DEFAULT_LINE_STROKE_WIDTH, DEFAULT_POINT_SIZE } from '../config/constants.js';
import { removeManagedLayer, updateManagedLayerStyle } from '../map/layer-manager.js';
import { getLayerRecord, getState, setCurrentLayerName } from '../state/store.js';
import { syncLabelsToggle } from '../tools/labels-tool.js';
import { commitLayerOpacity as commitLayerOpacityValue, updateLayerOpacity as updateLayerOpacityValue } from '../tools/transparency-tool.js';
import { showToast } from './toast.js';

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

const LAYER_GROUP_ORDER = ['vector', 'wms', 'annotation', 'other'];
const LAYER_GROUP_LABELS = {
    vector: 'Vector Layers',
    wms: 'WMS Layers',
    annotation: 'Annotations',
    other: 'Other Layers'
};

function getLayerGroupKey(record, options = {}) {
    if (record?.isWMS || options.isWMS) {
        return 'wms';
    }
    if (record?.isPointLayer || record?.isLineLayer || record?.isPolygonLayer) {
        return 'vector';
    }
    if (record?.isAnnotation) {
        return 'annotation';
    }
    return 'other';
}

function getLayerGroupContainer(groupKey) {
    return document.querySelector(`#layerList .layer-group[data-group="${groupKey}"]`);
}

function getLayerGroupBody(/* groupKey */) {
    // Return the logical body container for a group when present.
    // Keep backwards compatibility by returning the root list if no group body exists.
    const container = getLayerGroupContainer(arguments[0]);
    if (container) {
        const body = container.querySelector('.layer-group-body');
        if (body) return body;
    }
    return getLayerList();
}

function getLayerList() {
    return document.getElementById('layerList');
}

function createLayerGroup(groupKey) {
    const layerList = getLayerList();
    const groupLabel = LAYER_GROUP_LABELS[groupKey] || LAYER_GROUP_LABELS.other;
    const groupHTML = `
        <div class="layer-group" data-group="${groupKey}">
            <div class="layer-group-header">
                <button type="button" class="layer-group-toggle" data-group="${groupKey}" aria-expanded="true">
                    <span class="layer-group-title">${groupLabel}</span>
                    <span class="layer-group-count">0</span>
                    <i class="fas fa-chevron-down layer-group-chevron" aria-hidden="true"></i>
                </button>
            </div>
            <div class="layer-group-body" role="group" aria-label="${groupLabel}"></div>
        </div>
    `;
    const template = document.createElement('div');
    template.innerHTML = groupHTML;
    const groupElement = template.firstElementChild;

    const insertBefore = LAYER_GROUP_ORDER
        .slice(LAYER_GROUP_ORDER.indexOf(groupKey) + 1)
        .map((nextKey) => getLayerGroupContainer(nextKey))
        .find(Boolean);

    if (insertBefore) {
        layerList.insertBefore(groupElement, insertBefore);
    } else {
        layerList.appendChild(groupElement);
    }

    return groupElement;
}

function ensureLayerGroup(groupKey) {
    // Ensure a visual group header exists and return its header element.
    const container = getLayerGroupContainer(groupKey) || createLayerGroup(groupKey);
    return container.querySelector('.layer-group-header');
}

function updateLayerGroupCount(groupKey) {
    const group = getLayerGroupContainer(groupKey);
    if (!group) return;
    const body = group.querySelector('.layer-group-body') || getLayerList();
    const count = body.querySelectorAll(`.layer-item[data-group="${groupKey}"]`).length;
    const countEl = group.querySelector('.layer-group-count');
    if (countEl) countEl.textContent = String(count);
}

function collapseLayerItem(layerItem) {
    if (!layerItem) return;
    layerItem.classList.add('collapsed');
    const btn = layerItem.querySelector('.layer-expand-btn');
    if (btn) {
        btn.setAttribute('aria-expanded', 'false');
        btn.classList.remove('expanded');
    }
}

function collapseAllLayerItems(exceptItem = null) {
    document.querySelectorAll('.layer-item').forEach((item) => {
        if (item !== exceptItem) {
            collapseLayerItem(item);
        }
    });
}

function setupLayerGroupToggleListeners(layerList) {
    if (!layerList) {
        return;
    }

    layerList.addEventListener('click', (event) => {
        const toggle = event.target.closest('.layer-group-toggle');
        if (!toggle) {
            return;
        }

        event.stopPropagation();
        const group = toggle.closest('.layer-group');
        if (!group) return;

        const expanded = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', String(!expanded));
        group.classList.toggle('collapsed', expanded);

        const groupKey = group.getAttribute('data-group');
        if (groupKey) {
            document.querySelectorAll(`#layerList .layer-item[data-group="${groupKey}"]`).forEach((item) => {
                item.classList.toggle('hidden', expanded);
                collapseLayerItem(item);
            });
        }
    });
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getSvgGallery(record) {
    if (!record) {
        return [];
    }
    if (Array.isArray(record.svgMarkerGallery)) {
        return record.svgMarkerGallery;
    }
    if (record.svgMarkerDataUrl) {
        return [{
            id: 'uploaded-svg-1',
            name: 'Uploaded SVG',
            dataUrl: record.svgMarkerDataUrl
        }];
    }
    return [];
}

function getActiveSvgMarker(record) {
    const gallery = getSvgGallery(record);
    if (gallery.length === 0) {
        return null;
    }

    let index = Number.isInteger(record.activeSvgMarkerIndex) ? record.activeSvgMarkerIndex : 0;
    if (index < 0 || index >= gallery.length) {
        index = 0;
    }
    record.activeSvgMarkerIndex = index;
    return gallery[index];
}

function syncSvgMarkerState(record) {
    if (!record) {
        return;
    }

    const active = getActiveSvgMarker(record);
    record.svgMarkerDataUrl = active ? active.dataUrl : null;
    if (active) {
        record.markerPresetType = null;
    }
}

function createSvgMarkerId(fileName) {
    return `${fileName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function renderSvgMarkerGallery(record, layerItem) {
    if (!layerItem) {
        return;
    }

    const galleryContainer = layerItem.querySelector('.svg-marker-gallery');
    const statusEl = layerItem.querySelector('.svg-marker-upload-status');
    const gallery = getSvgGallery(record);
    const activeIndex = Number.isInteger(record.activeSvgMarkerIndex) ? record.activeSvgMarkerIndex : 0;
    const isSvgActive = Boolean(record.svgMarkerDataUrl && !record.markerPresetType);

    if (statusEl) {
        statusEl.textContent = gallery.length > 0 ? `${gallery.length} uploaded` : 'None';
    }

    if (!galleryContainer) {
        return;
    }

    if (gallery.length === 0) {
        galleryContainer.innerHTML = `<div class="svg-marker-gallery-empty">No uploaded SVGs</div>`;
        return;
    }

    galleryContainer.innerHTML = gallery.map((item, index) => {
        const label = escapeHtml(item.name);
        const activeClass = isSvgActive && index === activeIndex ? ' active' : '';
        return `
            <button type="button" class="svg-marker-thumbnail${activeClass}" data-svg-index="${index}" title="${label}" aria-label="Select ${label}">
                <img src="${item.dataUrl}" alt="${label}" />
                <span class="svg-marker-delete" role="button" aria-label="Delete ${label}" title="Delete ${label}">×</span>
            </button>
        `;
    }).join('');

    galleryContainer.querySelectorAll('.svg-marker-thumbnail').forEach((thumb) => {
        const deleteButton = thumb.querySelector('.svg-marker-delete');
        if (deleteButton) {
            deleteButton.addEventListener('pointerdown', (event) => event.stopPropagation());
            deleteButton.addEventListener('click', (event) => {
                event.stopPropagation();
                const index = Number(thumb.getAttribute('data-svg-index'));
                const record = getLayerRecord(layerItem.querySelector('.layer-name').textContent);
                if (!record || !Number.isFinite(index)) {
                    return;
                }
                record.activeSvgMarkerIndex = index;
                removeActiveSvgMarker(record, layerItem);
            });
        }

        thumb.addEventListener('pointerdown', (event) => event.stopPropagation());
        thumb.addEventListener('click', (event) => {
            event.stopPropagation();
            const index = Number(thumb.getAttribute('data-svg-index'));
            const record = getLayerRecord(layerItem.querySelector('.layer-name').textContent);
            if (!record || !Number.isFinite(index)) {
                return;
            }
            setActiveSvgMarker(record, index, layerItem);
        });
    });
}

function setActiveSvgMarker(record, index, layerItem) {
    const gallery = getSvgGallery(record);
    if (gallery.length === 0 || index < 0 || index >= gallery.length) {
        return;
    }

    record.activeSvgMarkerIndex = index;
    syncSvgMarkerState(record);
    updateSvgMarkerPreview(layerItem, record.svgMarkerDataUrl);
    renderSvgMarkerGallery(record, layerItem);
    updateManagedLayerStyle(layerItem.querySelector('.layer-name').textContent);
}

function removeActiveSvgMarker(record, layerItem) {
    const gallery = getSvgGallery(record).slice();
    if (gallery.length === 0) {
        return;
    }

    const indexToRemove = Number.isInteger(record.activeSvgMarkerIndex) ? record.activeSvgMarkerIndex : 0;
    gallery.splice(indexToRemove, 1);
    record.svgMarkerGallery = gallery;
    record.activeSvgMarkerIndex = Math.min(indexToRemove, gallery.length - 1);
    if (gallery.length === 0) {
        record.svgMarkerDataUrl = null;
        record.activeSvgMarkerIndex = 0;
    } else {
        syncSvgMarkerState(record);
    }

    if (layerItem) {
        syncMarkerTypeWidgets(record, layerItem);
        updateSvgMarkerPreview(layerItem, record.svgMarkerDataUrl);
        renderSvgMarkerGallery(record, layerItem);
    }
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

    if (!document._layerGroupToggleListenerAdded) {
        setupLayerGroupToggleListeners(layerList);
        document._layerGroupToggleListenerAdded = true;
    }

    const record = getLayerRecord(name);
    const isWms = Boolean(record?.isWMS) || Boolean(options.isWMS);
    const isGp = Boolean(options.isGP || record?.isGP);
    const isPointLayer = Boolean(record?.isPointLayer);
    const isLineLayer = Boolean(record?.isLineLayer);
    const isPolygonLayer = Boolean(record?.isPolygonLayer);
    const groupKey = getLayerGroupKey(record, options);
    const opacityValue = Math.round((record?.opacity ?? 1) * 100);
    const pointSizeValue = Math.round(record?.pointSize ?? DEFAULT_POINT_SIZE);
    const svgMarkerDataUrl = record?.svgMarkerDataUrl || '';
    const markerPresetType = record?.markerPresetType || null;
    const markerStrokeColor = record?.markerStrokeColor || color;
    const markerStrokeWidth = Math.round(record?.markerStrokeWidth ?? 1);
    const markerStrokeEnabled = Boolean(record?.markerStrokeEnabled);
    const lineStrokeWidthValue = Math.round(record?.lineStrokeWidth ?? DEFAULT_LINE_STROKE_WIDTH);
    const polygonFillColor = record?.polygonFillColor || color;
    const polygonStrokeColor = record?.polygonStrokeColor || color;
    const polygonStrokeWidthValue = Math.round(record?.polygonStrokeWidth ?? DEFAULT_LINE_STROKE_WIDTH);
    const statsText = isWms
        ? `${isGp ? 'GP Layer' : 'WMS Layer'} • Remote`
        : `${featureCount} features • ${getState().uploadedLayers[name]?.geometryType || 'Mixed'}`;

    // Build controls strictly by geometry type. WMS only gets opacity.
    let colorControl = '';
    let polygonStyleControls = '';
    let lineWidthControl = '';
    let pointSizeControl = '';
    let opacityLabel = 'Opacity';

    if (isWms) {
        // WMS layers: only opacity control (already handled below)
    } else if (isPointLayer) {
        colorControl = `
            <div class="control-row">
                <label>
                    <span>Point color:</span>
                    <input type="color" class="color-picker" value="${color}" onchange="updateLayerColor(this)">
                </label>
            </div>
        `;
        pointSizeControl = `
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
                <div class="control-row control-row-stack marker-style-row">
                <div class="marker-style-header">
                </div>

                <div class="control-row">
                    <label style="display:flex;align-items:center;gap:8px;width:100%;">
                        <span>Marker type:</span>
                        <!-- Native select retained for logic, visually replaced by custom icon dropdown -->
                        <select class="marker-type-select" aria-hidden="true" style="position:absolute;opacity:0;pointer-events:none;">
                            <option value="circle" ${markerPresetType === 'circle' || (!markerPresetType && !svgMarkerDataUrl) ? 'selected' : ''}>Default Circle</option>
                            <option value="square" ${markerPresetType === 'square' ? 'selected' : ''}>Square</option>
                            <option value="star" ${markerPresetType === 'star' ? 'selected' : ''}>Star</option>
                            <option value="triangle" ${markerPresetType === 'triangle' ? 'selected' : ''}>Triangle</option>
                            <option value="diamond" ${markerPresetType === 'diamond' ? 'selected' : ''}>Diamond</option>
                            <option value="custom" ${svgMarkerDataUrl ? 'selected' : ''}>Custom SVG</option>
                        </select>

                        <div class="marker-type-dropdown" data-selected="${markerPresetType || (svgMarkerDataUrl ? 'custom' : 'circle')}">
                            <button type="button" class="marker-type-current" aria-haspopup="listbox" aria-expanded="false" title="Select marker type" aria-label="Select marker type">
                                <!-- current icon preview inserted by JS on init; fallback: simple circle -->
                                <span class="marker-type-icon marker-type-icon-circle" aria-hidden="true"></span>
                                <i class="fas fa-caret-down" style="margin-left:8px;color:var(--gray-400);"></i>
                            </button>
                            <div class="marker-type-options" role="listbox" tabindex="-1">
                                <button type="button" class="marker-type-option" data-value="circle" role="option" aria-label="Circle"><span class="marker-type-icon marker-type-icon-circle" aria-hidden="true"></span></button>
                                <button type="button" class="marker-type-option" data-value="square" role="option" aria-label="Square"><span class="marker-type-icon marker-type-icon-square" aria-hidden="true"></span></button>
                                <button type="button" class="marker-type-option" data-value="star" role="option" aria-label="Star"><span class="marker-type-icon marker-type-icon-star" aria-hidden="true"></span></button>
                                <button type="button" class="marker-type-option" data-value="triangle" role="option" aria-label="Triangle"><span class="marker-type-icon marker-type-icon-triangle" aria-hidden="true"></span></button>
                                <button type="button" class="marker-type-option" data-value="diamond" role="option" aria-label="Diamond"><span class="marker-type-icon marker-type-icon-diamond" aria-hidden="true"></span></button>
                            </div>
                        </div>
                    </label>
                </div>

                <div class="marker-svg-section">
                    <div class="marker-svg-header">
                        <span class="marker-svg-label">Custom SVG:</span>
                        <span class="svg-marker-upload-status">${svgMarkerDataUrl ? 'Uploaded' : 'None'}</span>
                    </div>
                    <div class="marker-control-row">
                        <button type="button" class="svg-marker-upload-button btn-secondary">Upload SVG</button>
                        <input type="file" class="svg-marker-input" accept=".svg" multiple />
                    </div>
                    <div class="svg-marker-gallery"></div>
                </div>

                <div class="marker-stroke-section">
                    <div class="marker-stroke-toggle">
                        <label class="checkbox-label">
                            <input type="checkbox" class="marker-stroke-enabled" ${markerStrokeEnabled ? 'checked' : ''}>
                            <span>Add stroke</span>
                        </label>
                    </div>
                    <div class="marker-stroke-controls" style="display: ${markerStrokeEnabled ? 'block' : 'none'};">
                        <div class="marker-stroke-color-row">
                            <label>
                                <span class="marker-stroke-color-label">Stroke color:</span>
                                <input type="color" class="marker-stroke-color-picker" value="${markerStrokeColor}">
                            </label>
                        </div>
                        <div class="marker-stroke-width-row">
                            <div class="transparency-header">
                                <span class="control-label">Stroke width</span>
                                <span class="marker-stroke-width-value">${markerStrokeWidth}px</span>
                            </div>
                            <div class="transparency-control">
                                <input
                                    type="range"
                                    class="marker-stroke-width-slider"
                                    min="0"
                                    max="4"
                                    step="1"
                                    value="${markerStrokeWidth}"
                                    title="Adjust marker stroke width"
                                    aria-label="Adjust marker stroke width"
                                >
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        opacityLabel = 'Point opacity';
    } else if (isLineLayer) {
        colorControl = `
            <div class="control-row">
                <label>
                    <span>Stroke color:</span>
                    <input type="color" class="color-picker" value="${color}" onchange="updateLayerColor(this)">
                </label>
            </div>
        `;
        lineWidthControl = `
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
        `;
        opacityLabel = 'Line opacity';
    } else if (isPolygonLayer) {
        polygonStyleControls = `
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
        `;
        opacityLabel = 'Opacity';
    } else {
        // Unknown or mixed geometry types: only allow opacity to avoid cross-geometry controls
        opacityLabel = 'Opacity';
    }

    const isVisible = options.visible !== false;
    const safeName = escapeHtml(name);
    const layerHTML = `
        <div class="layer-item collapsed" data-layer-name="${safeName}">
            <div class="layer-item-header" role="button" tabindex="0">
                <input type="checkbox" class="layer-toggle" ${isVisible ? 'checked' : ''} title="Toggle layer visibility">
                <div class="layer-info-short">
                    <div class="layer-name-wrap" data-tooltip="${safeName}">
                        <div class="layer-name" tabindex="0" aria-label="Layer name: ${safeName}">${safeName}</div>
                    </div>
                    <div class="layer-stats">${statsText}</div>
                </div>
                <button type="button" class="layer-expand-btn" aria-expanded="false" title="Expand layer"><i class="fas fa-chevron-down" aria-hidden="true"></i></button>
            </div>
            <div class="layer-controls-wrapper">
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

    const headerEl = ensureLayerGroup(groupKey);
    const layerListEl = getLayerList();

    // Create element from HTML so we can set data attributes and insert at correct position
    const tmp = document.createElement('div');
    tmp.innerHTML = layerHTML.trim();
    const newItem = tmp.firstElementChild;
    if (newItem) {
        newItem.setAttribute('data-group', groupKey);

        // Insert the layer item into the group's body container to make the
        // header a true structural anchor for its layers.
        const groupContainer = getLayerGroupContainer(groupKey) || createLayerGroup(groupKey);
        const groupBody = groupContainer.querySelector('.layer-group-body') || layerListEl;

        // Append to the group's body. Keep relative ordering within a group.
        groupBody.appendChild(newItem);
    }
    updateLayerGroupCount(groupKey);
    attachLayerNameTooltip(newItem);

    // Initialize collapsed state and header/expand behavior (compact by default)
    const header = newItem.querySelector('.layer-item-header');
    const expandBtn = newItem.querySelector('.layer-expand-btn');
    if (newItem && header && expandBtn) {
        // Ensure collapsed by default
        newItem.classList.add('collapsed');
        expandBtn.setAttribute('aria-expanded', 'false');

        const toggleExpansion = (ev) => {
            ev && ev.stopPropagation();
            const isExpanded = !newItem.classList.contains('collapsed');
            if (isExpanded) {
                collapseLayerItem(newItem);
            } else {
                newItem.classList.remove('collapsed');
                expandBtn.setAttribute('aria-expanded', 'true');
                expandBtn.classList.add('expanded');
            }
        };

        header.addEventListener('click', (ev) => {
            ev.stopPropagation();
            selectLayer(newItem);
        });

        header.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                selectLayer(newItem);
            }
        });

        expandBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            toggleExpansion(ev);
        });
    }
    const checkbox = newItem.querySelector('.layer-toggle');
    const colorPicker = newItem.querySelector('.color-picker:not(.polygon-fill-picker):not(.polygon-stroke-picker)');
    const polygonFillPicker = newItem.querySelector('.polygon-fill-picker');
    const polygonStrokePicker = newItem.querySelector('.polygon-stroke-picker');
    const opacitySlider = newItem.querySelector('.transparency-slider');
    const pointSizeSlider = newItem.querySelector('.point-size-slider');
    const lineWidthSlider = newItem.querySelector('.line-width-slider');
    const polygonWidthSlider = newItem.querySelector('.polygon-width-slider');
    const svgMarkerInput = newItem.querySelector('.svg-marker-input');
    const svgMarkerUploadButton = newItem.querySelector('.svg-marker-upload-button');
    const markerPresetButtons = newItem.querySelectorAll('.marker-preset-btn');
    const markerStrokeEnabledCheckbox = newItem.querySelector('.marker-stroke-enabled');
    const markerStrokeColorPicker = newItem.querySelector('.marker-stroke-color-picker');
    const markerStrokeWidthSlider = newItem.querySelector('.marker-stroke-width-slider');

    checkbox.addEventListener('pointerdown', (event) => event.stopPropagation());
    checkbox.addEventListener('click', (event) => event.stopPropagation());
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

    if (svgMarkerUploadButton) {
        svgMarkerUploadButton.addEventListener('pointerdown', (event) => event.stopPropagation());
        svgMarkerUploadButton.addEventListener('click', (event) => {
            event.stopPropagation();
            if (svgMarkerInput) {
                svgMarkerInput.click();
            }
        });
    }

    if (svgMarkerInput) {
        svgMarkerInput.addEventListener('pointerdown', (event) => event.stopPropagation());
        svgMarkerInput.addEventListener('click', (event) => event.stopPropagation());
        svgMarkerInput.addEventListener('change', (event) => handleSvgMarkerUpload(event, name));
    }

    

    // Marker type select (native select kept for logic) + custom icon dropdown
    const markerTypeSelect = newItem.querySelector('.marker-type-select');
    const markerTypeDropdown = newItem.querySelector('.marker-type-dropdown');
    const markerTypeCurrent = newItem.querySelector('.marker-type-current');
    const markerTypeOptions = newItem.querySelectorAll('.marker-type-option');
    // Initialize custom dropdown visuals to match current record state
    if (markerTypeDropdown) {
        const initialSel = markerPresetType || (svgMarkerDataUrl ? 'custom' : 'circle');
        markerTypeDropdown.setAttribute('data-selected', initialSel);
        markerTypeOptions.forEach((opt) => opt.classList.toggle('active', opt.getAttribute('data-value') === markerPresetType));
        if (markerTypeCurrent) {
            markerTypeCurrent.querySelectorAll('.marker-type-icon').forEach((el) => el.className = 'marker-type-icon marker-type-icon-' + (markerPresetType || (svgMarkerDataUrl ? 'custom' : 'circle')));
        }
    }
    if (markerTypeSelect) {
        markerTypeSelect.addEventListener('pointerdown', (event) => event.stopPropagation());
        markerTypeSelect.addEventListener('click', (event) => event.stopPropagation());
        markerTypeSelect.addEventListener('change', (event) => {
            event.stopPropagation();
            const selected = markerTypeSelect.value;
            const record = getLayerRecord(name);
            if (!record || !record.isPointLayer) return;

            // Selecting a preset or custom icon updates the marker mode independently of uploaded SVG state.
            if (selected === 'custom') {
                record.markerPresetType = null;
            } else {
                record.markerPresetType = selected === 'circle' ? 'circle' : selected;
            }

            syncMarkerTypeWidgets(record, newItem);
            renderSvgMarkerGallery(record, newItem);
            updateSvgMarkerPreview(newItem, record.svgMarkerDataUrl);
            updateManagedLayerStyle(name);
        });
    }

    // Wire up custom dropdown UI to set the native select value (keeps logic untouched)
    if (markerTypeOptions && markerTypeOptions.length > 0) {
        markerTypeOptions.forEach((opt) => {
            opt.addEventListener('pointerdown', (ev) => ev.stopPropagation());
            opt.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const val = opt.getAttribute('data-value');
                if (markerTypeSelect) {
                    markerTypeSelect.value = val;
                    markerTypeSelect.dispatchEvent(new Event('change', { bubbles: true }));
                }

                // close the dropdown after selection
                const dd = opt.closest('.marker-type-dropdown');
                if (dd) {
                    dd.setAttribute('data-open', 'false');
                    const cur = dd.querySelector('.marker-type-current');
                    if (cur) cur.setAttribute('aria-expanded', 'false');
                }
            });
        });

        if (markerTypeCurrent) {
            markerTypeCurrent.addEventListener('pointerdown', (ev) => ev.stopPropagation());
            markerTypeCurrent.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const expanded = markerTypeDropdown.getAttribute('data-open') === 'true';
                markerTypeDropdown.setAttribute('data-open', expanded ? 'false' : 'true');
                markerTypeCurrent.setAttribute('aria-expanded', String(!expanded));
            });
        }
    
        // Close dropdown when clicking elsewhere (single global listener)
        if (!document._markerTypeDropdownCloseListenerAdded) {
            document.addEventListener('click', (ev) => {
                // Close any open dropdowns
                document.querySelectorAll('.marker-type-dropdown[data-open="true"]').forEach((dd) => {
                    if (!dd.contains(ev.target)) {
                        dd.setAttribute('data-open', 'false');
                        const cur = dd.querySelector('.marker-type-current');
                        if (cur) cur.setAttribute('aria-expanded', 'false');
                    }
                });
            });
            document._markerTypeDropdownCloseListenerAdded = true;
        }
    }
    // Note: per-thumbnail delete handles removal; global remove button removed to avoid duplicates

    renderSvgMarkerGallery(record, newItem);

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

    // Marker preset buttons
    if (markerPresetButtons.length > 0) {
        markerPresetButtons.forEach((btn) => {
            btn.addEventListener('pointerdown', (event) => event.stopPropagation());
            btn.addEventListener('click', (event) => {
                event.stopPropagation();
                const presetType = btn.getAttribute('data-preset');
                updateMarkerPreset(presetType, name, newItem);
            });
        });
    }

    // Marker stroke enabled toggle
    if (markerStrokeEnabledCheckbox) {
        markerStrokeEnabledCheckbox.addEventListener('pointerdown', (event) => event.stopPropagation());
        markerStrokeEnabledCheckbox.addEventListener('click', (event) => event.stopPropagation());
        markerStrokeEnabledCheckbox.addEventListener('change', () => updateMarkerStrokeEnabled(markerStrokeEnabledCheckbox, name, newItem));
    }

    // Marker stroke color picker
    if (markerStrokeColorPicker) {
        markerStrokeColorPicker.addEventListener('pointerdown', (event) => event.stopPropagation());
        markerStrokeColorPicker.addEventListener('click', (event) => event.stopPropagation());
        markerStrokeColorPicker.addEventListener('input', () => updateMarkerStrokeColor(markerStrokeColorPicker, name));
    }

    // Marker stroke width slider
    if (markerStrokeWidthSlider) {
        markerStrokeWidthSlider.addEventListener('pointerdown', (event) => event.stopPropagation());
        markerStrokeWidthSlider.addEventListener('click', (event) => event.stopPropagation());
        markerStrokeWidthSlider.addEventListener('input', () => updateMarkerStrokeWidth(markerStrokeWidthSlider));
        markerStrokeWidthSlider.addEventListener('change', () => updateMarkerStrokeWidth(markerStrokeWidthSlider));
    }
}

export function selectLayer(element) {
    // Only one layer should be active at a time, but expansion is independent.
    document.querySelectorAll('.layer-item').forEach((item) => {
        item.classList.toggle('active', item === element);
    });

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

    // Only allow color updates for vector point or line layers (not WMS or polygons)
    if (record.isWMS || record.isPolygonLayer || !(record.isPointLayer || record.isLineLayer)) {
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

function updateMarkerPreset(presetType, layerName, layerItem) {
    const record = getLayerRecord(layerName);

    if (!record || !record.isPointLayer) {
        return;
    }

    // Reset to default if "none" is selected
    if (presetType === 'none') {
        record.markerPresetType = null;
    } else {
        record.markerPresetType = presetType;
    }

    syncMarkerTypeWidgets(record, layerItem);
    renderSvgMarkerGallery(record, layerItem);

    // Update button states
    layerItem.querySelectorAll('.marker-preset-btn').forEach((btn) => {
        btn.classList.remove('active');
        const btnPreset = btn.getAttribute('data-preset');
        if ((presetType === 'none' && btnPreset === 'none') || (presetType === btnPreset)) {
            btn.classList.add('active');
        }
    });

    updateManagedLayerStyle(layerName);
}

function syncMarkerTypeWidgets(record, layerItem) {
    if (!record || !layerItem) {
        return;
    }

    const markerTypeSelect = layerItem.querySelector('.marker-type-select');
    const markerTypeDropdown = layerItem.querySelector('.marker-type-dropdown');
    const markerTypeCurrent = layerItem.querySelector('.marker-type-current');
    const markerTypeOptions = layerItem.querySelectorAll('.marker-type-option');
    const svgSection = layerItem.querySelector('.marker-svg-section');
    const removeBtn = layerItem.querySelector('.svg-marker-remove-button');

    const selected = record.markerPresetType || (record.svgMarkerDataUrl ? 'custom' : 'circle');

    if (markerTypeSelect) {
        markerTypeSelect.value = selected;
    }

    if (markerTypeDropdown) {
        markerTypeDropdown.setAttribute('data-selected', selected);
    }

    if (markerTypeOptions && markerTypeOptions.length > 0) {
        markerTypeOptions.forEach((opt) => {
            opt.classList.toggle('active', opt.getAttribute('data-value') === record.markerPresetType);
        });
    }

    if (markerTypeCurrent) {
        markerTypeCurrent.querySelectorAll('.marker-type-icon').forEach((el) => {
            el.className = 'marker-type-icon marker-type-icon-' + selected;
        });
    }

    if (svgSection) {
        // Always keep SVG upload UI visible for point layers
        svgSection.style.display = record.isPointLayer ? 'flex' : 'none';
    }

    if (removeBtn) {
        removeBtn.style.display = record.svgMarkerDataUrl ? 'inline-flex' : 'none';
    }

    // Hide or disable stroke UI when custom SVG marker mode is active.
    // Stroke remains available for preset marker types (circle, square, star, triangle, diamond).
    const strokeSection = layerItem.querySelector('.marker-stroke-section');
    const strokeControls = layerItem.querySelector('.marker-stroke-controls');
    const markerStrokeToggle = layerItem.querySelector('.marker-stroke-enabled');
    const isSvgMode = selected === 'custom';
    if (strokeSection) {
        if (isSvgMode) {
            strokeSection.style.display = 'none';
            // disable inputs inside stroke section to prevent accidental changes
            strokeSection.querySelectorAll('input,button,select').forEach((el) => el.disabled = true);
        } else {
            // restore stroke section visibility but keep inner controls' visibility in sync with enabled flag
            strokeSection.style.display = '';
            strokeSection.querySelectorAll('input,button,select').forEach((el) => el.disabled = false);
            if (strokeControls) {
                strokeControls.style.display = record.markerStrokeEnabled ? 'block' : 'none';
            }
            if (markerStrokeToggle) {
                markerStrokeToggle.checked = Boolean(record.markerStrokeEnabled);
            }
        }
    }
}

function updateMarkerStrokeEnabled(checkbox, layerName, layerItem) {
    const record = getLayerRecord(layerName);

    if (!record || !record.isPointLayer) {
        return;
    }

    record.markerStrokeEnabled = checkbox.checked;

    // Show/hide stroke controls
    const strokeControls = layerItem.querySelector('.marker-stroke-controls');
    if (strokeControls) {
        if (record.markerStrokeEnabled) {
            // Create and insert the controls if they don't exist
            if (!strokeControls.style.display || strokeControls.style.display === 'none') {
                strokeControls.style.display = 'block';
            }
        } else {
            strokeControls.style.display = 'none';
        }
    } else if (record.markerStrokeEnabled) {
        // If controls don't exist and we need to show them, rebuild the UI
        const strokeSection = layerItem.querySelector('.marker-stroke-section');
        if (strokeSection) {
            strokeSection.innerHTML = `
                <div class="marker-stroke-toggle">
                    <label class="checkbox-label">
                        <input type="checkbox" class="marker-stroke-enabled" checked>
                        <span>Add stroke</span>
                    </label>
                </div>
                <div class="marker-stroke-controls">
                    <div class="marker-stroke-color-row">
                        <label>
                            <span class="marker-stroke-color-label">Stroke color:</span>
                            <input type="color" class="marker-stroke-color-picker" value="${record.markerStrokeColor}">
                        </label>
                    </div>
                    <div class="marker-stroke-width-row">
                        <div class="transparency-header">
                            <span class="control-label">Stroke width</span>
                            <span class="marker-stroke-width-value">${record.markerStrokeWidth}px</span>
                        </div>
                        <div class="transparency-control">
                            <input
                                type="range"
                                class="marker-stroke-width-slider"
                                min="0"
                                max="4"
                                step="1"
                                value="${record.markerStrokeWidth}"
                                title="Adjust marker stroke width"
                                aria-label="Adjust marker stroke width"
                            >
                        </div>
                    </div>
                </div>
            `;

            // Re-attach event listeners for the new elements
            const newCheckbox = strokeSection.querySelector('.marker-stroke-enabled');
            const newColorPicker = strokeSection.querySelector('.marker-stroke-color-picker');
            const newWidthSlider = strokeSection.querySelector('.marker-stroke-width-slider');

            if (newCheckbox) {
                newCheckbox.addEventListener('pointerdown', (event) => event.stopPropagation());
                newCheckbox.addEventListener('click', (event) => event.stopPropagation());
                newCheckbox.addEventListener('change', () => updateMarkerStrokeEnabled(newCheckbox, layerName, layerItem));
            }

            if (newColorPicker) {
                newColorPicker.addEventListener('pointerdown', (event) => event.stopPropagation());
                newColorPicker.addEventListener('click', (event) => event.stopPropagation());
                newColorPicker.addEventListener('input', () => updateMarkerStrokeColor(newColorPicker, layerName));
            }

            if (newWidthSlider) {
                newWidthSlider.addEventListener('pointerdown', (event) => event.stopPropagation());
                newWidthSlider.addEventListener('click', (event) => event.stopPropagation());
                newWidthSlider.addEventListener('input', () => updateMarkerStrokeWidth(newWidthSlider));
                newWidthSlider.addEventListener('change', () => updateMarkerStrokeWidth(newWidthSlider));
            }
        }
    }

    updateManagedLayerStyle(layerName);
}

function updateMarkerStrokeColor(colorPicker, layerName) {
    const newColor = colorPicker.value;
    const record = getLayerRecord(layerName);

    if (!record || !record.isPointLayer) {
        return;
    }

    record.markerStrokeColor = newColor;
    updateManagedLayerStyle(layerName);
}

function updateMarkerStrokeWidth(slider) {
    const strokeWidth = Number(slider.value);
    const layerItem = slider.closest('.layer-item');
    const layerName = layerItem.querySelector('.layer-name').textContent;
    const record = getLayerRecord(layerName);

    const valueEl = layerItem?.querySelector('.marker-stroke-width-value');
    if (valueEl) {
        valueEl.textContent = `${strokeWidth}px`;
    }

    if (!record || !record.isPointLayer || !Number.isFinite(strokeWidth)) {
        return;
    }

    record.markerStrokeWidth = strokeWidth;
    updateManagedLayerStyle(layerName);
}

function updateSvgMarkerPreview(layerItem, dataUrl) {
    if (!layerItem) {
        return;
    }
    const statusEl = layerItem.querySelector('.svg-marker-upload-status');
    if (statusEl) {
        statusEl.textContent = dataUrl ? 'Uploaded' : 'None';
    }
}

function handleSvgMarkerUpload(event, layerName) {
    const files = Array.from(event.target.files || []);
    const layerItem = event.target.closest('.layer-item');
    const record = getLayerRecord(layerName);

    if (!record || files.length === 0) {
        return;
    }

    const validFiles = files.filter((file) => file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg'));
    if (validFiles.length === 0) {
        showToast('Error', 'Only SVG marker files are accepted.', 'error');
        event.target.value = '';
        return;
    }

    const loadFilePromises = validFiles.map((file, index) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result;
            if (typeof result !== 'string' || !result.startsWith('data:image/svg+xml')) {
                reject(new Error(`Invalid SVG file: ${file.name}`));
                return;
            }
            resolve({
                id: createSvgMarkerId(file.name),
                name: file.name,
                dataUrl: result
            });
        };
        reader.onerror = () => reject(new Error(`Unable to read SVG file: ${file.name}`));
        reader.readAsDataURL(file);
    }));

    Promise.allSettled(loadFilePromises).then((results) => {
        const galleryItems = results
            .filter((item) => item.status === 'fulfilled')
            .map((item) => item.value);

        if (galleryItems.length === 0) {
            showToast('Error', 'No valid SVG files were uploaded.', 'error');
            event.target.value = '';
            return;
        }

        // Combine existing gallery with new uploads but dedupe by dataUrl to avoid duplicates
        const existing = Array.isArray(record.svgMarkerGallery) ? record.svgMarkerGallery : [];
        const combined = [...existing, ...galleryItems];
        const seen = new Set();
        const unique = [];
        for (const it of combined) {
            if (!it || !it.dataUrl) continue;
            if (seen.has(it.dataUrl)) continue;
            seen.add(it.dataUrl);
            unique.push(it);
        }
        record.svgMarkerGallery = unique;
        record.activeSvgMarkerIndex = Math.max(0, record.svgMarkerGallery.length - 1);
        syncSvgMarkerState(record);
        record.markerPresetType = null;

        const markerTypeSelect = layerItem.querySelector('.marker-type-select');
        if (markerTypeSelect) {
            markerTypeSelect.value = 'custom';
        }

        syncMarkerTypeWidgets(record, layerItem);
        updateManagedLayerStyle(layerName);
        updateSvgMarkerPreview(layerItem, record.svgMarkerDataUrl);
        renderSvgMarkerGallery(record, layerItem);
        event.target.value = '';
    });
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

    const groupKey = layerItem.getAttribute('data-group');
    layerItem.remove();

    if (groupKey) {
        const group = getLayerGroupContainer(groupKey);
        const remaining = group?.querySelectorAll('.layer-item').length || 0;
        if (group && remaining === 0) {
            group.remove();
        } else if (group) {
            updateLayerGroupCount(groupKey);
        }
    }

    if (layerList.querySelectorAll('.layer-item').length === 0) {
        layerList.innerHTML = getEmptyStateMarkup();
    }

    if (wasActive) {
        document.querySelectorAll('.layer-item').forEach((item) => item.classList.remove('active'));
        setCurrentLayerName(null);
    }

    syncLabelsToggle();
}
