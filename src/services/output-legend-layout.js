export const OUTPUT_LIMITS = { maxDimension: 8192, maxPixels: 24000000 };

export class OutputSizeError extends Error {
    constructor() {
        super('The complete map legend exceeds the output size limit. Hide some layers or reduce category labels, then try again.');
        this.name = 'OutputSizeError';
    }
}

export function assertOutputSize(width, height) {
    if (!Number.isFinite(width * height) || width <= 0 || height <= 0
        || width > OUTPUT_LIMITS.maxDimension || height > OUTPUT_LIMITS.maxDimension
        || width * height > OUTPUT_LIMITS.maxPixels) throw new OutputSizeError();
}

export function wrapLegendText(text, maxWidth, measure) {
    const lines = [];
    for (const paragraph of String(text ?? '').split(/\r?\n/)) {
        let line = '';
        for (const word of paragraph.split(/\s+/).filter(Boolean)) {
            if (line && measure(`${line} ${word}`) <= maxWidth) { line += ` ${word}`; continue; }
            if (line) { lines.push(line); line = ''; }
            for (const char of word) {
                if (line && measure(line + char) > maxWidth) { lines.push(line); line = ''; }
                line += char;
            }
        }
        lines.push(line);
    }
    return lines;
}

// Measurement is independent of map rendering and contains no OL/canvas objects.
// Entries flow down columns, then the panel grows vertically at the same font size.
export function layoutOutputLegend(groups, mapWidth, mapHeight, footerHeight, measure) {
    if (!groups.length) return { width: mapWidth, height: mapHeight + footerHeight, contentHeight: mapHeight, columns: [], columnWidth: 0 };
    const columnWidth = Math.max(340, Math.min(440, Math.round(mapWidth * 0.16)));
    const heading = group => wrapLegendText(group.name, columnWidth - 40, t => measure(t, true));
    const prepared = groups.map(group => ({ ...group, heading: heading(group), entries: group.entries.map(entry => {
        const lines = wrapLegendText(entry.label, columnWidth - 108, t => measure(t, false));
        return { ...entry, lines, height: Math.max(42, lines.length * 26 + 12) };
    }) }));
    let contentHeight = Math.max(mapHeight, 240);
    while (true) {
        const columns = [[]];
        let y = 76;
        let fits = true;
        const nextColumn = () => { columns.push([]); y = 76; };
        for (const group of prepared) {
            const headingHeight = group.heading.length * 28 + 16;
            let needsHeading = true;
            let continued = false;
            for (const entry of group.entries) {
                const required = entry.height + (needsHeading ? headingHeight : 0);
                if (y + required > contentHeight - 24) {
                    if (76 + headingHeight + entry.height > contentHeight - 24) { fits = false; break; }
                    nextColumn(); needsHeading = true;
                }
                if (needsHeading) {
                    columns.at(-1).push({ type: 'heading', lines: group.heading, continued, x: 20, y });
                    y += headingHeight; needsHeading = false; continued = true;
                }
                columns.at(-1).push({ type: 'entry', ...entry, x: 20, y });
                y += entry.height;
            }
            if (!fits) break;
            y += 20;
        }
        const width = mapWidth + columnWidth * Math.min(3, columns.length);
        assertOutputSize(width, contentHeight + footerHeight);
        if (fits && columns.length <= 3) return { width, height: contentHeight + footerHeight, contentHeight, columns, columnWidth };
        contentHeight += Math.max(240, Math.round(mapHeight * 0.25));
    }
}
