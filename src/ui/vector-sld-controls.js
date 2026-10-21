import { applyImportedVectorStyle, isImportedVectorStyle, switchVectorStyleMode } from '../map/vector-sld-symbology.js';
import { getLayerRecord } from '../state/store.js';
import { updateManagedLayerStyle } from '../map/layer-manager.js';
import { bindSldImport } from './sld-controls.js';

export const vectorSldMarkup = `<div class="control-row polygon-mode-row"><label><span>Styling</span><select class="vector-style-mode" aria-label="Vector styling mode"><option value="manual">Manual</option><option value="imported" disabled>Imported SLD</option></select></label></div>
<div class="control-row control-row-stack polygon-sld-row"><button type="button" class="vector-sld-import btn-secondary">Import SLD</button><input type="file" class="vector-sld-input" accept=".sld" hidden><span class="vector-sld-status polygon-sld-status" role="status" aria-live="polite"></span><span class="vector-sld-hint polygon-sld-status" hidden>SLD defines symbols. Opacity remains editable. Choose Manual to edit saved marker or line settings.</span></div>`;

export function syncVectorSldControls(item, record) {
    const mode = item.querySelector('.vector-style-mode');
    if (!mode) return;
    const imported = isImportedVectorStyle(record);
    mode.querySelector('[value="imported"]').disabled = record.symbology?.provenance?.type !== 'sld';
    mode.value = imported ? 'imported' : 'manual';
    item.querySelector('.vector-manual-controls').disabled = imported;
    item.querySelector('.vector-sld-hint').hidden = !imported;
}

export function bindVectorSldControls(item, record) {
    bindSldImport(item, record, { prefix: 'vector', apply: applyImportedVectorStyle });
    item.querySelector('.vector-style-mode').addEventListener('change', event => {
        if (switchVectorStyleMode(record, event.target.value)) updateManagedLayerStyle(item.dataset.layerName);
    });
    syncVectorSldControls(item, record);
}

window.addEventListener('gpmap:layerstylechange', event => {
    const name = event.detail?.layerName;
    const item = [...document.querySelectorAll('.layer-item')].find(entry => entry.dataset.layerName === name);
    const record = getLayerRecord(name);
    if (item && record) syncVectorSldControls(item, record);
});
