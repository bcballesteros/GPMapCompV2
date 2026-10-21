import { getManagedLayerLegendDescriptors } from '../map/layer-manager.js';
import { renderPolygonLegendSymbol } from '../ui/polygon-legend-symbol.js';
import { renderImportedVectorLegendSymbol } from '../ui/vector-sld-legend-symbol.js';

export const legendFont = bold => `${bold ? '600 20' : '18'}px Arial, sans-serif`;

export function captureOutputLegend(map, records) {
    const byLayer = new Map(Object.entries(records).map(([name, record]) => [record.layer, { name, record }]));
    // Preserve the configured drawing order, with stable collection order for ties.
    return map.getLayers().getArray().map((layer, index) => ({ layer, index }))
        .sort((a, b) => (a.layer.getZIndex() ?? 0) - (b.layer.getZIndex() ?? 0) || a.index - b.index)
        .flatMap(({ layer }) => {
            const managed = byLayer.get(layer);
            if (!managed || managed.record.isWMS || !layer.isVisible(map.getView())) return [];
            const entries = getManagedLayerLegendDescriptors(managed.name);
            return entries.length ? [{ identity: managed.name, name: managed.record.displayName || managed.name,
                entries: structuredClone(entries).map(entry => ({ ...entry, layerOpacity: layer.getOpacity() })) }] : [];
        });
}

function loadLegendImage(src) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        const timer = setTimeout(() => { image.src = ''; reject(new Error('Legend symbol loading exceeded the deadline')); }, 15000);
        image.onload = () => { clearTimeout(timer); resolve(image); };
        image.onerror = () => { clearTimeout(timer); reject(new Error('Legend symbol unavailable')); };
        image.src = src;
    });
}

async function prepareSymbol(entry) {
    const container = document.createElement('span');
    if (entry.symbolType === 'polygon') renderPolygonLegendSymbol(container, entry.symbols);
    else if (entry.symbols) {
        // Fit unusually wide line casings together, preserving relative widths.
        const symbols = structuredClone(entry.symbols);
        if (entry.symbolType === 'line') {
            const max = Math.max(8, ...symbols.map(s => s.stroke.width));
            for (const s of symbols) s.stroke.width *= 8 / max;
        }
        renderImportedVectorLegendSymbol(container, symbols);
    } else if (entry.symbolType === 'point') {
        // Only embedded SVGs from the existing marker utilities are accepted.
        // SVGs are decoded as isolated images, never inserted into live HTML.
        if (!/^data:image\/svg\+xml[;,]/i.test(entry.symbol.src)) return null;
        try { return await loadLegendImage(entry.symbol.src); } catch { return null; }
    } else {
        renderImportedVectorLegendSymbol(container, [{ type: 'line', opacity: entry.symbol.opacity,
            stroke: { enabled: true, color: entry.symbol.color, width: Math.max(1, Math.min(8, entry.symbol.width)),
                opacity: 1, lineCap: 'round', lineJoin: 'round' } }]);
    }
    const canvas = container.querySelector('canvas');
    if (canvas) return canvas;
    const svg = container.querySelector('svg');
    return loadLegendImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`);
}

export async function drawOutputLegend(context, layout, mapWidth, groups) {
    if (!groups.length) return;
    // Load once per effective symbol, with bounded concurrency and no remote assets.
    const assets = new Map();
    for (const column of layout.columns) for (const row of column) {
        if (row.type !== 'entry') continue;
        const key = JSON.stringify([row.symbolType, row.symbols || row.symbol]);
        row.assetKey = key;
        if (!assets.has(key)) assets.set(key, await prepareSymbol(row));
    }
    context.save();
    context.fillStyle = '#f8fafc';
    context.fillRect(mapWidth, 0, layout.width - mapWidth, layout.contentHeight);
    context.strokeStyle = '#cbd5e1'; context.lineWidth = 1;
    context.beginPath(); context.moveTo(mapWidth + 0.5, 0); context.lineTo(mapWidth + 0.5, layout.contentHeight); context.stroke();
    context.textBaseline = 'top'; context.fillStyle = '#172554'; context.font = '600 26px Arial, sans-serif';
    context.fillText('Legend', mapWidth + 20, 24);
    layout.columns.forEach((column, index) => {
        const x = mapWidth + index * layout.columnWidth;
        for (const row of column) {
            context.fillStyle = '#1e293b'; context.font = legendFont(row.type === 'heading');
            if (row.type === 'heading') {
                row.lines.forEach((line, i) => context.fillText(line, x + 20, row.y + i * 28));
                continue;
            }
            const image = assets.get(row.assetKey);
            if (image) {
                const w = image.naturalWidth || image.width, h = image.naturalHeight || image.height;
                const scale = Math.min(48 / w, 34 / h);
                context.save();
                context.globalAlpha = (row.layerOpacity ?? 1) * (row.symbols ? 1 : row.symbolType === 'point' ? row.symbol.opacity : 1);
                context.drawImage(image, x + 20 + (48 - w * scale) / 2, row.y + 4 + (34 - h * scale) / 2, w * scale, h * scale);
                context.restore();
            } else {
                context.font = '12px Arial, sans-serif'; context.fillText('Unavailable', x + 20, row.y + 12);
                context.font = legendFont(false);
            }
            row.lines.forEach((line, i) => context.fillText(line, x + 88, row.y + 6 + i * 26));
        }
    });
    context.restore();
}
