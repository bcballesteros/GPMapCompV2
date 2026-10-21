import { applyImportedPolygonStyle, classifyPolygonLayer, discoverClassificationFields, ensurePolygonSymbology, getPolygonLegendDescriptors, switchPolygonMode } from '../map/polygon-symbology.js';
import { bindSldImport } from './sld-controls.js';
import { updateManagedLayerStyle } from '../map/layer-manager.js';
import { getLayerRecord } from '../state/store.js';
import { colorSwatchMarkup } from './vector-color-picker.js';
import { renderPolygonLegendSymbol } from './polygon-legend-symbol.js';

export const polygonModeMarkup = `<div class="control-row polygon-mode-row"><label><span>Styling</span><select class="polygon-style-mode" aria-label="Polygon styling mode"><option value="single">Single Color</option><option value="categorized">Categorized</option></select></label></div>
    <div class="control-row polygon-field-row" hidden><label><span>Attribute</span><select class="polygon-classification-field" aria-label="Classification attribute"></select></label></div>
    <div class="control-row control-row-stack polygon-sld-row"><button type="button" class="polygon-sld-import btn-secondary">Import SLD</button><input type="file" class="polygon-sld-input" accept=".sld" hidden><span class="polygon-sld-status" role="status" aria-live="polite"></span></div>`;
export const polygonLegendMarkup = '<div class="control-row control-row-stack polygon-legend"><span class="control-label">Legend</span><div class="polygon-legend-entries" role="list" aria-label="Polygon legend"></div></div>';

export function syncPolygonControls(item, record, name) {
    const config = ensurePolygonSymbology(record);
    const mode = item.querySelector('.polygon-style-mode');
    const imported = config.mode === 'categorized' && config.provenance.type === 'sld';
    if ((config.provenance.type === 'sld' || config.savedCategorized?.sld) && !mode.querySelector('[value="imported"]')) mode.appendChild(new Option('Imported SLD', 'imported'));
    mode.value = imported ? 'imported' : config.mode;
    item.querySelector('.polygon-field-row').hidden = config.mode !== 'categorized';
    const field = item.querySelector('.polygon-classification-field');
    if (config.attribute && ![...field.options].some(option => option.value === config.attribute)) field.appendChild(new Option(config.attribute, config.attribute));
    field.value = config.attribute || '';
    field.disabled = imported;
    field.title = imported ? 'Classification comes from the SLD. Choose Categorized to generate categories.' : field.selectedOptions[0]?.textContent || '';
    const fill = item.querySelector('.polygon-fill-picker');
    fill.disabled = config.mode === 'categorized';
    fill.closest('.control-row').hidden = config.mode === 'categorized';
    const strokeToggle = item.querySelector('.polygon-stroke-enabled');
    strokeToggle.checked = imported ? config.importedStrokeEnabled !== false : config.stroke.enabled !== false;
    for (const control of [item.querySelector('.polygon-stroke-picker'), item.querySelector('.polygon-width-slider')]) {
        control.disabled = imported || !strokeToggle.checked;
        control.title = imported ? 'Imported SLD uses per-rule strokes. Choose Categorized to use global stroke controls.' : '';
    }
    const container = item.querySelector('.polygon-legend-entries');
    const descriptors = getPolygonLegendDescriptors(record, name);
    const existing = new Map([...container.children].map(row => [row.dataset.categoryId, row]));
    for (const descriptor of descriptors) {
        let row = existing.get(descriptor.id);
        if (!row) {
            row = document.createElement('div');
            row.className = 'polygon-legend-entry';
            row.dataset.categoryId = descriptor.id;
            row.setAttribute('role', 'listitem');
            if (config.mode === 'categorized') {
                row.innerHTML = colorSwatchMarkup('polygonCategory', 'Category Base Fill Color', descriptor.baseFillColor, 'polygon-legend-symbol');
                row.firstElementChild.dataset.categoryId = descriptor.id;
            } else {
                row.appendChild(document.createElement('span')).className = 'polygon-legend-symbol';
            }
            row.appendChild(document.createElement('span')).className = 'polygon-legend-label';
        }
        renderPolygonLegendSymbol(row.firstElementChild, descriptor.symbols);
        row.firstElementChild.value = descriptor.baseFillColor || '#000000';
        if (config.mode === 'categorized') {
            row.firstElementChild.disabled = !descriptor.baseFillColor;
            row.firstElementChild.title = descriptor.baseFillColor ? 'Category Base Fill Color (pattern overlays are preserved)' : 'This symbol has no editable solid base fill';
            row.firstElementChild.setAttribute('aria-label', row.firstElementChild.title);
        }
        const label = row.querySelector('.polygon-legend-label');
        label.textContent = descriptor.label;
        label.title = descriptor.label;
        const position = container.children[descriptor.order];
        if (position !== row) container.insertBefore(row, position || null);
        existing.delete(descriptor.id);
    }
    for (const row of existing.values()) row.remove();
}

export function bindPolygonControls(item, record) {
    const mode = item.querySelector('.polygon-style-mode');
    const field = item.querySelector('.polygon-classification-field');
    const strokeToggle = item.querySelector('.polygon-stroke-enabled');
    let discovered = false;
    const name = () => item.dataset.layerName;
    const populate = () => {
        if (discovered) return;
        discovered = true;
        const fields = discoverClassificationFields(record.source?.getFeatures?.() || record.features || []);
        const placeholder = new Option(fields.length ? 'Select an attribute' : 'No suitable attributes', '');
        field.replaceChildren(placeholder);
        for (const entry of fields) field.appendChild(new Option(`${entry.field} (${entry.distinctCount}${entry.highCardinality ? ', many values' : ''})`, entry.field));
        field.value = record.symbology.attribute || '';
        field.title = field.selectedOptions[0]?.textContent || '';
    };
    mode.addEventListener('change', () => {
        switchPolygonMode(record, mode.value);
        if (mode.value === 'categorized') populate();
        updateManagedLayerStyle(name());
    });
    strokeToggle.addEventListener('change', () => {
        const config = ensurePolygonSymbology(record);
        if (config.mode === 'categorized' && config.provenance.type === 'sld') config.importedStrokeEnabled = strokeToggle.checked;
        else config.stroke.enabled = strokeToggle.checked;
        updateManagedLayerStyle(name());
    });
    bindSldImport(item, record, { prefix: 'polygon', apply: applyImportedPolygonStyle, onApplied: populate });
    field.addEventListener('change', () => {
        if (!field.value) { field.value = record.symbology.attribute || ''; return; }
        field.title = field.selectedOptions[0]?.textContent || '';
        const result = classifyPolygonLayer(record, field.value);
        if (result.requiresConfirmation) {
            if (!window.confirm(`This attribute has ${result.count} categories. Generate all styles and legend entries? This may slow the Layers panel.`)) {
                field.value = record.symbology.attribute || '';
                return;
            }
            classifyPolygonLayer(record, field.value, { confirmed: true });
        }
        updateManagedLayerStyle(name());
    });
    if (ensurePolygonSymbology(record).mode === 'categorized') populate();
    syncPolygonControls(item, record, name());
}

window.addEventListener('gpmap:layerstylechange', event => {
    const { layerName } = event.detail;
    const record = getLayerRecord(layerName);
    const item = [...document.querySelectorAll('.layer-item')].find(item => item.dataset.layerName === layerName);
    if (item?.querySelector('.polygon-style-mode') && record?.isPolygonLayer) syncPolygonControls(item, record, layerName);
});
