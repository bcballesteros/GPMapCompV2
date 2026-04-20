import { getLayerRecord } from '../state/store.js';
import { updateManagedLayerStyle } from '../map/layer-manager.js';
import { showToast } from '../ui/toast.js';

export function updateLayerOpacity(slider) {
    const opacityPercent = Number(slider.value);
    const opacityDecimal = opacityPercent / 100;
    const layerItem = slider.closest('.layer-item');
    const layerName = layerItem.querySelector('.layer-name').textContent;
    const record = getLayerRecord(layerName);

    const valueEl = layerItem?.querySelector('.transparency-value');
    if (valueEl) {
        valueEl.textContent = `${opacityPercent}%`;
    }

    if (!record) {
        return;
    }

    record.opacity = opacityDecimal;
    updateManagedLayerStyle(layerName);
    slider.dataset.lastOpacityValue = String(opacityPercent);
    slider.dataset.opacityDirty = 'true';
}

export function commitLayerOpacity(slider) {
    const layerItem = slider.closest('.layer-item');
    const layerName = layerItem?.querySelector('.layer-name')?.textContent;
    const opacityPercent = Number(slider.value);

    if (!layerName || slider.dataset.opacityDirty !== 'true') {
        return;
    }

    const commitKey = `${layerName}:${opacityPercent}`;
    if (slider.dataset.lastOpacityToastKey === commitKey) {
        slider.dataset.opacityDirty = 'false';
        return;
    }

    slider.dataset.lastOpacityToastKey = commitKey;
    slider.dataset.opacityDirty = 'false';
    showToast('Opacity Updated', `Opacity updated to ${opacityPercent}%`, 'success', 2000);
}
