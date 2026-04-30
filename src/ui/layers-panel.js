import { removeManagedLayer, updateManagedLayerStyle } from '../map/layer-manager.js';
import { getLayerRecord, getState, setCurrentLayerName } from '../state/store.js';
import { syncLabelsToggle } from '../tools/labels-tool.js';
import { commitLayerOpacity as commitLayerOpacityValue, updateLayerOpacity as updateLayerOpacityValue } from '../tools/transparency-tool.js';

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

export function addLayerItem(name, color, featureCount, options = {}) {
    const layerList = document.getElementById('layerList');
    if (layerList.querySelector('.empty-state')) {
        layerList.innerHTML = '';
    }

    const isWms = Boolean(options.isWMS);
    const isGp = Boolean(options.isGP || getLayerRecord(name)?.isGP);
    const opacityValue = Math.round((getLayerRecord(name)?.opacity ?? 1) * 100);
    const statsText = isWms
        ? `${isGp ? 'GP Layer' : 'WMS Layer'} • Remote`
        : `${featureCount} features • ${getState().uploadedLayers[name]?.geometryType || 'Mixed'}`;

    const colorControl = isWms
        ? ''
        : `
            <div class="control-row">
                <label>
                    <span>Color:</span>
                    <input type="color" class="color-picker" value="${color}" onchange="updateLayerColor(this)">
                </label>
            </div>
        `;

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
                    <div class="control-row control-row-stack">
                        <div class="transparency-header">
                            <span class="control-label">Opacity</span>
                            <span class="transparency-value">${opacityValue}%</span>
                        </div>
                        <div class="transparency-control">
                            <input
                                type="range"
                                class="transparency-slider"
                                min="0"
                                max="100"
                                value="${opacityValue}"
                                title="Adjust layer opacity"
                                aria-label="Adjust layer opacity"
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
    const checkbox = newItem.querySelector('.layer-toggle');
    const opacitySlider = newItem.querySelector('.transparency-slider');

    checkbox.addEventListener('change', (event) => {
        event.stopPropagation();
        const record = getLayerRecord(name);
        if (record?.layer) {
            record.layer.setVisible(event.target.checked);
        }
    });

    if (opacitySlider) {
        const commitOpacity = () => commitLayerOpacityValue(opacitySlider);

        opacitySlider.addEventListener('pointerdown', (event) => event.stopPropagation());
        opacitySlider.addEventListener('click', (event) => event.stopPropagation());
        opacitySlider.addEventListener('input', () => updateLayerOpacityValue(opacitySlider));
        opacitySlider.addEventListener('change', commitOpacity);
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
