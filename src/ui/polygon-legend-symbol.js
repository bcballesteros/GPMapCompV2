import { getPolygonPattern } from '../map/polygon-patterns.js';

const ns = 'http://www.w3.org/2000/svg';
let sequence = 0;
const element = name => document.createElementNS(ns, name);

// Consumes resolved symbols, never SLD. Both renderers use the same raster tile.
export function renderPolygonLegendSymbol(container, symbols) {
    const svg = element('svg');
    svg.setAttribute('viewBox', '0 0 32 24');
    svg.setAttribute('aria-hidden', 'true');
    const defs = element('defs');
    svg.appendChild(defs);
    for (const symbol of symbols) {
        const polygon = element('polygon');
        polygon.setAttribute('points', '4,5 23,2 29,17 12,22 2,16');
        let fill = symbol.fillEnabled ? symbol.fillColor : 'none';
        if (symbol.fillEnabled && symbol.pattern) {
            const resource = getPolygonPattern(symbol.pattern);
            resource.dataUrl ||= resource.canvas.toDataURL();
            const pattern = element('pattern');
            const id = `polygon-pattern-${++sequence}`;
            pattern.id = id;
            pattern.setAttribute('patternUnits', 'userSpaceOnUse');
            const size = Math.max(1, Math.round(resource.size));
            pattern.setAttribute('width', size); pattern.setAttribute('height', size);
            const image = element('image');
            image.setAttribute('href', resource.dataUrl);
            image.setAttribute('width', size); image.setAttribute('height', size);
            pattern.appendChild(image); defs.appendChild(pattern);
            fill = `url(#${id})`;
        }
        polygon.setAttribute('fill', fill);
        polygon.setAttribute('fill-opacity', symbol.fillOpacity * symbol.opacity);
        polygon.setAttribute('stroke', symbol.stroke.enabled ? symbol.stroke.color : 'none');
        polygon.setAttribute('stroke-width', symbol.stroke.width);
        // Match map per-paint alpha, including where boundary and fill overlap.
        polygon.setAttribute('stroke-opacity', symbol.stroke.opacity * symbol.opacity);
        svg.appendChild(polygon);
    }
    container.querySelector('svg')?.remove();
    container.appendChild(svg);
}
