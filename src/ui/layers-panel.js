import { removeManagedLayer, updateManagedLayerStyle } from '../map/layer-manager.js';
import { createFeatureStyle } from '../map/style-factory.js';
import { getLayerRecord, getState, setCurrentLayerName } from '../state/store.js';
import { updateLayerOpacity as updateLayerOpacityValue } from '../tools/transparency-tool.js';
import { showToast } from './toast.js';

function getEmptyStateMarkup() {
    return `
        <div class="empty-state">
            <div class="empty-state-icon"><i class="fas fa-folder-open"></i></div>
            <div class="empty-state-text">No layers loaded yet. Upload shapefiles to get started.</div>
        </div>
    `;
}

export function addLayerItem(name, color, featureCount, options = {}) {
    const layerList = document.getElementById('layerList');
    if (layerList.querySelector('.empty-state')) {
        layerList.innerHTML = '';
    }

    const isWms = Boolean(options.isWMS);
    const statsText = isWms
        ? 'WMS Layer • Remote'
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

    const layerHTML = `
        <div class="layer-item" onclick="selectLayer(this)">
            <input type="checkbox" class="layer-toggle" checked>
            <div class="layer-info">
                <div class="layer-name">${name}</div>
                <div class="layer-stats">${statsText}</div>
                <div class="layer-controls">
                    ${colorControl}
                    <div class="control-row">
                        <span>Opacity:</span>
                        <div class="transparency-control" style="flex: 1;">
                            <input type="range" class="transparency-slider" min="0" max="100" value="100" onchange="updateLayerOpacity(this)">
                        </div>
                        <span style="width: 35px; text-align: right;">100%</span>
                    </div>
                    <div class="control-row" style="margin-top: 8px;">
                        <button class="layer-action-btn danger" onclick="removeLayer(event)" title="Remove Layer" style="width:100%; justify-content:center;"><i class="fas fa-trash"></i> Remove</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    layerList.insertAdjacentHTML('beforeend', layerHTML);

    const newItem = layerList.lastElementChild;
    const checkbox = newItem.querySelector('.layer-toggle');
    checkbox.addEventListener('change', (event) => {
        event.stopPropagation();
        const record = getLayerRecord(name);
        if (record?.layer) {
            record.layer.setVisible(event.target.checked);
        }
    });
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
    updateManagedLayerStyle(layerName, () => createFeatureStyle(newColor, record.opacity));

    showToast('Color Updated', `Layer color changed to ${newColor}`, 'success', 2000);
}

export function updateLayerOpacity(slider) {
    updateLayerOpacityValue(slider);
}

export function removeLayer(event) {
    event.stopPropagation();

    const layerItem = event.target.closest('.layer-item');
    const layerName = layerItem.querySelector('.layer-name').textContent;
    removeManagedLayer(layerName);

    layerItem.remove();

    const layerList = document.getElementById('layerList');
    if (layerList.children.length === 0) {
        layerList.innerHTML = getEmptyStateMarkup();
        setCurrentLayerName(null);
    }

    showToast('Layer Removed', `${layerName} has been removed from the map`, 'info', 2000);
}
