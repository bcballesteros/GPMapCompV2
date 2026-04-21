import { getCurrentLayerName, getLayerRecord } from '../state/store.js';
import { openModal } from './modal.js';
import { queryAll } from '../utils/dom.js';
import { showToast } from './toast.js';

function getSelectedLayerName() {
    const currentLayerName = getCurrentLayerName();
    if (currentLayerName) {
        return currentLayerName;
    }

    return document.querySelector('.layer-item.active .layer-name')?.textContent || null;
}

function getAttributeRows(record) {
    if (!record || record.isWMS) {
        return [];
    }

    const sourceFeatures = record.source?.getFeatures?.();
    if (Array.isArray(sourceFeatures) && sourceFeatures.length > 0) {
        return sourceFeatures.map((feature) => {
            const properties = { ...(feature.getProperties?.() || {}) };
            delete properties.geometry;
            return properties;
        });
    }

    if (Array.isArray(record.features) && record.features.length > 0) {
        return record.features.map((feature) => {
            if (typeof feature?.getProperties === 'function') {
                const properties = { ...(feature.getProperties() || {}) };
                delete properties.geometry;
                return properties;
            }

            return { ...(feature?.properties || {}) };
        });
    }

    let geojson = record.geojson;
    if (Array.isArray(geojson)) {
        geojson = { type: 'FeatureCollection', features: geojson.flatMap((fc) => fc?.features ?? []) };
    }

    return geojson?.features?.map((feature) => feature.properties || {}) || [];
}

function getAttributeColumns(rowsData) {
    const keys = [];
    const seen = new Set();

    rowsData.forEach((row) => {
        Object.keys(row).forEach((key) => {
            if (!seen.has(key)) {
                seen.add(key);
                keys.push(key);
            }
        });
    });

    return keys;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

function updateAttributeTableStatus(visibleCount, totalCount, query = '') {
    const status = document.getElementById('attributeTableStatus');
    if (!status) {
        return;
    }

    if (!totalCount) {
        status.textContent = 'No records';
        return;
    }

    if (query) {
        status.textContent = `${visibleCount} of ${totalCount} records`;
        return;
    }

    status.textContent = `${totalCount} records`;
}

function bindAttributeSearch(totalRows) {
    const searchInput = document.getElementById('attributeSearchInput');
    if (!searchInput) {
        return;
    }

    searchInput.value = '';
    searchInput.oninput = (event) => {
        const searchTerm = event.target.value.trim().toLowerCase();
        let visibleCount = 0;

        queryAll('#attributeTable tbody tr.attribute-row').forEach((row) => {
            const matches = !searchTerm || queryAll('.attr-cell', row).some((cell) => {
                return cell.textContent.toLowerCase().includes(searchTerm);
            });

            row.style.display = matches ? '' : 'none';
            if (matches) {
                visibleCount += 1;
            }
        });

        updateAttributeTableStatus(visibleCount, totalRows, searchTerm);
    };
}

export function openAttributeTable() {
    const layerName = getSelectedLayerName();
    if (!layerName) {
        showToast('No Layer', 'Please select a layer first', 'warning', 2000);
        return;
    }

    const record = getLayerRecord(layerName);
    if (!record) {
        showToast('Layer Missing', 'The selected layer could not be found', 'error', 2000);
        return;
    }

    if (record.isWMS) {
        showToast('No Attributes', 'Attribute tables are only available for uploaded vector layers', 'warning', 2200);
        return;
    }

    const rowsData = getAttributeRows(record);
    if (!rowsData.length) {
        showToast('No Data', 'This layer has no attribute data to display', 'warning', 2000);
        return;
    }

    const keys = getAttributeColumns(rowsData);
    if (!keys.length) {
        showToast('No Data', 'This layer has no attribute fields to display', 'warning', 2000);
        return;
    }

    const rows = rowsData.map((row, index) => {
        const rowBackground = index % 2 === 0 ? 'white' : 'var(--gray-50)';
        const cells = keys.map((key) => {
            const value = row[key];
            const displayValue = value === null || value === undefined ? '' : String(value);
            const escapedValue = escapeHtml(displayValue);

            return `<td style="padding: 10px; color: var(--gray-700);" class="attr-cell" title="${escapedValue}">${escapedValue}</td>`;
        }).join('');

        return `<tr class="attribute-row" data-row-index="${index}" style="border-bottom: 1px solid var(--gray-200); background: ${rowBackground}; transition: background 0.2s;" onmouseover="this.style.background='var(--blue-50)'" onmouseout="this.style.background='${rowBackground}'">${cells}</tr>`;
    }).join('');

    const headerCells = keys.map((key) => {
        return `<th style="padding: 10px; text-align: left; font-weight: 700; color: var(--gray-700); white-space: nowrap;">${escapeHtml(key)}</th>`;
    }).join('');

    const container = document.getElementById('attributeTableContainer');
    container.dataset.totalRows = rowsData.length;
    container.innerHTML = `
        <table id="attributeTable" style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
                <tr style="background: var(--gray-100); border-bottom: 2px solid var(--gray-300); position: sticky; top: 0;">${headerCells}</tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;

    const modalTitle = document.querySelector('#attributesModal .modal-title');
    if (modalTitle) {
        modalTitle.innerHTML = `<i class="fas fa-table"></i> Attribute Table: ${layerName}`;
    }

    updateAttributeTableStatus(rowsData.length, rowsData.length);
    bindAttributeSearch(rowsData.length);

    openModal('attributesModal');
}
