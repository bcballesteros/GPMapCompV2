import { createImportedVectorStyle } from '../map/vector-sld-style.js';

export function renderImportedVectorLegendSymbol(container, symbols) {
    if (symbols[0]?.type === 'point') {
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 52;
        canvas.style.width = '32px'; canvas.style.height = '26px';
        canvas.setAttribute('aria-hidden', 'true');
        const ctx = canvas.getContext('2d');
        ctx.scale(2, 2);
        const images = symbols.map(symbol => createImportedVectorStyle(symbol).getImage());
        const extent = Math.max(24, ...images.map(image => {
            const [w, h] = image.getSize(), angle = image.getRotation();
            return Math.max(Math.abs(Math.cos(angle)) * w + Math.abs(Math.sin(angle)) * h,
                Math.abs(Math.sin(angle)) * w + Math.abs(Math.cos(angle)) * h);
        }));
        const scale = 24 / extent;
        for (const image of images) {
            const [w, h] = image.getSize();
            ctx.save(); ctx.translate(16, 13); ctx.scale(scale, scale); ctx.rotate(image.getRotation());
            ctx.globalAlpha = image.getOpacity();
            ctx.drawImage(image.getImage(2), -w / 2, -h / 2, w, h);
            ctx.restore();
        }
        container.appendChild(canvas);
    } else {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 32 26'); svg.setAttribute('aria-hidden', 'true');
        for (const symbol of symbols) {
            const line = document.createElementNS(svg.namespaceURI, 'line');
            for (const [key, value] of Object.entries({ x1: 2, x2: 30, y1: 13, y2: 13,
                stroke: symbol.stroke.enabled ? symbol.stroke.color : 'none', 'stroke-width': symbol.stroke.width,
                'stroke-opacity': symbol.opacity * symbol.stroke.opacity, 'stroke-linecap': symbol.stroke.lineCap,
                'stroke-linejoin': symbol.stroke.lineJoin, ...(symbol.stroke.dashArray ? { 'stroke-dasharray': symbol.stroke.dashArray.join(' ') } : {}) })) {
                line.setAttribute(key, String(value));
            }
            svg.appendChild(line);
        }
        container.appendChild(svg);
    }
}
