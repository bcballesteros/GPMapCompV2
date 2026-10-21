import { getManagedLayerLegendDescriptors } from '../map/layer-manager.js';
import { renderImportedVectorLegendSymbol } from './vector-sld-legend-symbol.js';

export const vectorLegendMarkup = '<div class="control-row control-row-stack polygon-legend vector-legend"><span class="control-label">Legend</span><div class="polygon-legend-entries" role="list" aria-label="Layer legend"></div></div>';

export function syncVectorLegend(item, layerName) {
    const container = item?.querySelector('.vector-legend .polygon-legend-entries');
    if (!container) return;
    const descriptors = getManagedLayerLegendDescriptors(layerName);
    container.replaceChildren();
    for (const descriptor of descriptors) {
        const row = document.createElement('div');
        row.className = 'polygon-legend-entry';
        row.dataset.entryId = descriptor.id;
        row.setAttribute('role', 'listitem');
        const symbol = document.createElement('span');
        symbol.className = 'polygon-legend-symbol';
        if (descriptor.symbols) {
            renderImportedVectorLegendSymbol(symbol, descriptor.symbols);
        } else if (descriptor.symbolType === 'point') {
            const img = document.createElement('img');
            img.src = descriptor.symbol.src;
            img.alt = '';
            img.setAttribute('aria-hidden', 'true');
            // Use a consistent legend viewport so small map markers remain
            // recognizable. This only affects the legend, not map styling.
            img.style.width = '28px';
            img.style.height = '24px';
            img.style.objectFit = 'contain';
            img.style.opacity = descriptor.symbol.opacity;
            img.addEventListener('error', () => {
                img.remove();
                symbol.textContent = 'Symbol unavailable';
                symbol.classList.add('legend-symbol-unavailable');
            }, { once: true });
            symbol.style.alignItems = 'center';
            symbol.style.justifyContent = 'center';
            symbol.appendChild(img);
        } else if (descriptor.symbolType === 'line') {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 32 26');
            svg.setAttribute('aria-hidden', 'true');
            const line = document.createElementNS(svg.namespaceURI, 'line');
            line.setAttribute('x1', '2'); line.setAttribute('x2', '30');
            line.setAttribute('y1', '13'); line.setAttribute('y2', '13');
            line.setAttribute('stroke', descriptor.symbol.color);
            // Keep extreme widths legible in the compact preview while retaining
            // the configured value in the shared descriptor.
            line.setAttribute('stroke-width', String(Math.max(1, Math.min(8, descriptor.symbol.width))));
            line.setAttribute('stroke-linecap', 'round');
            line.setAttribute('opacity', descriptor.symbol.opacity);
            svg.appendChild(line);
            symbol.appendChild(svg);
        }
        row.appendChild(symbol);
        const label = document.createElement('span');
        label.className = 'polygon-legend-label';
        label.textContent = descriptor.label;
        label.title = descriptor.label;
        row.appendChild(label);
        container.appendChild(row);
    }
}

window.addEventListener('gpmap:layerstylechange', event => {
    const layerName = event.detail?.layerName;
    const item = [...document.querySelectorAll('.layer-item')].find(entry => entry.dataset.layerName === layerName);
    if (item?.querySelector('.vector-legend')) syncVectorLegend(item, layerName);
});
