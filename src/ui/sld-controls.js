import { parseSld, validateSldFile } from '../map/sld-importer.js';
import { getLayerRecord } from '../state/store.js';
import { updateManagedLayerStyle } from '../map/layer-manager.js';

// All geometries share the same file/security/transaction lifecycle. Geometry
// adapters validate and prepare their configuration before any layer mutation.
export function bindSldImport(item, record, { prefix, apply, onApplied = () => {} }) {
    const button = item.querySelector(`.${prefix}-sld-import`);
    const input = item.querySelector(`.${prefix}-sld-input`);
    const status = item.querySelector(`.${prefix}-sld-status`);
    button.addEventListener('click', event => { event.stopPropagation(); input.click(); });
    input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file || button.disabled) return;
        button.disabled = true;
        status.textContent = 'Reading SLD…';
        status.dataset.error = 'false';
        try {
            validateSldFile(file);
            const parsed = parseSld(await file.text());
            const name = item.dataset.layerName;
            if (getLayerRecord(name) !== record || !item.isConnected) return;
            const result = apply(record, parsed, file.name);
            onApplied();
            updateManagedLayerStyle(name);
            status.textContent = `${parsed.title}: ${result.ruleCount} rule(s), ${result.matchedFeatures} matched${parsed.attribute ? ` on ${parsed.attribute}` : ''}. Per-rule styling.${result.unmatchedFeatures ? ` ${result.unmatchedFeatures} unmatched feature(s) are not drawn.` : ''}${result.unmatchedRules ? ` ${result.unmatchedRules} rule(s) have no matches.` : ''}`;
        } catch (error) {
            status.dataset.error = 'true';
            status.textContent = `SLD import failed: ${error.message} Existing styling preserved.`;
        } finally {
            button.disabled = false;
            input.value = '';
        }
    });
}
