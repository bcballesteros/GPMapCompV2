import { getLayerRecord } from '../state/store.js';
import { queryAll } from '../utils/dom.js';
import { showToast } from './toast.js';

export function openAttributeTable() {
    const activeLayer = document.querySelector('.layer-item.active');
    if (!activeLayer) {
        showToast('No Layer', 'Please select a layer first', 'warning', 2000);
        return;
    }

    const layerName = activeLayer.querySelector('.layer-name').textContent;
    const record = getLayerRecord(layerName);

    if (!record?.geojson?.features?.length) {
        showToast('Error', 'Layer has no features', 'error');
        return;
    }

    const features = record.geojson.features;
    const propertyKeys = new Set();

    features.forEach((feature) => {
        if (feature.properties) {
            Object.keys(feature.properties).forEach((key) => propertyKeys.add(key));
        }
    });

    const keys = Array.from(propertyKeys);
    const rows = features.map((feature, index) => {
        const rowBackground = index % 2 === 0 ? 'white' : 'var(--gray-50)';
        const cells = keys.map((key) => {
            const value = feature.properties?.[key] || '';
            return `<td style="padding: 10px; color: var(--gray-700);" class="attr-cell">${String(value)}</td>`;
        }).join('');

        return `<tr class="attribute-row" data-row-index="${index}" style="border-bottom: 1px solid var(--gray-200); background: ${rowBackground}; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='var(--blue-50)'" onmouseout="this.style.background='${rowBackground}'">${cells}</tr>`;
    }).join('');

    const headerCells = keys.map((key) => {
        return `<th style="padding: 10px; text-align: left; font-weight: 700; color: var(--gray-700);">${key}</th>`;
    }).join('');

    const container = document.getElementById('attributeTableContainer');
    container.dataset.totalRows = features.length;
    container.innerHTML = `
        <table id="attributeTable" style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
                <tr style="background: var(--gray-100); border-bottom: 2px solid var(--gray-300); position: sticky; top: 0;">${headerCells}</tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;

    const searchInput = document.querySelector('#attributesModal .form-group input[type="text"]');
    if (searchInput) {
        searchInput.value = '';
        searchInput.oninput = (event) => {
            const query = event.target.value.toLowerCase();
            let visibleCount = 0;

            queryAll('#attributeTable tbody tr.attribute-row').forEach((row) => {
                const matches = queryAll('.attr-cell', row).some((cell) => {
                    return cell.textContent.toLowerCase().includes(query);
                });

                row.style.display = matches ? '' : 'none';
                if (matches) {
                    visibleCount += 1;
                }
            });

            if (query.length > 0) {
                showToast('Search', `Found ${visibleCount} matching records`, 'info', 1500);
            }
        };
    }

    document.getElementById('attributesModal').classList.add('active');
    showToast('Attributes', `Showing ${features.length} features for "${layerName}"`, 'info', 1500);
}
