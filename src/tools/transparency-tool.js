import { getLayerRecord } from '../state/store.js';
import { updateManagedLayerStyle } from '../map/layer-manager.js';
import { createFeatureStyle } from '../map/style-factory.js';
import { showToast } from '../ui/toast.js';

export function updateLayerOpacity(slider) {
    const opacityPercent = Number(slider.value);
    const opacityDecimal = opacityPercent / 100;
    const layerItem = slider.closest('.layer-item');
    const layerName = layerItem.querySelector('.layer-name').textContent;
    const record = getLayerRecord(layerName);

    slider.parentElement.nextElementSibling.textContent = `${opacityPercent}%`;

    if (!record) {
        return;
    }

    record.opacity = opacityDecimal;
    updateManagedLayerStyle(layerName, () => createFeatureStyle(record.color, opacityDecimal));

    showToast('Opacity Updated', `Layer opacity set to ${opacityPercent}%`, 'success', 2000);
}
