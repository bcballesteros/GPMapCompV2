// Deliberately bounded SLD 1.0 subset. XML is parsed inertly, never inserted into
// the page, and translated to plain ordered vector symbolizers.
export const SLD_LIMITS = Object.freeze({ bytes: 1024 * 1024, rules: 500, elements: 20000, depth: 24,
    symbolizersPerRule: 8, symbolizers: 2000, patternSize: 128, patternStrokeWidth: 16, patternPixels: 4 * 1024 * 1024,
    pointSize: 128, pointStrokeWidth: 16, pointPixels: 4 * 1024 * 1024 });
const SLD = 'http://www.opengis.net/sld';
const OGC = 'http://www.opengis.net/ogc';
const XMLNS = 'http://www.w3.org/2000/xmlns/';
const grammar = {
    StyledLayerDescriptor: ['Name', 'Title', 'Abstract', 'NamedLayer', 'UserLayer'],
    NamedLayer: ['Name', 'UserStyle'], UserLayer: ['Name', 'UserStyle'],
    UserStyle: ['Name', 'Title', 'Abstract', 'IsDefault', 'FeatureTypeStyle'],
    FeatureTypeStyle: ['Name', 'Title', 'Abstract', 'FeatureTypeName', 'Rule'],
    Rule: ['Name', 'Title', 'Abstract', 'Filter', 'PolygonSymbolizer', 'PointSymbolizer', 'LineSymbolizer'],
    Filter: ['PropertyIsEqualTo'], PropertyIsEqualTo: ['PropertyName', 'Literal'],
    PolygonSymbolizer: ['Fill', 'Stroke'], PointSymbolizer: ['Graphic'], LineSymbolizer: ['Stroke'],
    Fill: ['CssParameter', 'GraphicFill'], Stroke: ['CssParameter'],
    GraphicFill: ['Graphic'], Graphic: ['Mark', 'Size', 'Rotation', 'Opacity'], Mark: ['WellKnownName', 'Fill', 'Stroke'],
    Name: [], Title: [], Abstract: [], IsDefault: [], FeatureTypeName: [], PropertyName: [], Literal: [], CssParameter: [],
    WellKnownName: [], Size: [], Rotation: [], Opacity: []
};
const ogcElements = new Set(['Filter', 'PropertyIsEqualTo', 'PropertyName', 'Literal']);
const fail = message => { throw new Error(message); };
const children = (node, name) => [...node.children].filter(child => child.localName === name);
function one(node, name, required = false) {
    const found = children(node, name);
    if (found.length > 1 || (required && !found.length)) fail(`Expected ${required ? 'exactly' : 'at most'} one ${name} in ${node.localName}.`);
    return found[0];
}
const value = node => node?.textContent || '';
function numeric(raw, name, min, max) {
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw.trim())) fail(`Invalid ${name}: expected a number.`);
    const number = Number(raw);
    if (!Number.isFinite(number) || number < min || number > max) fail(`Invalid ${name}: expected ${min}–${max}.`);
    return number;
}
function color(raw, name) {
    if (/^#[\da-f]{6}$/i.test(raw)) return raw.toUpperCase();
    if (/^#[\da-f]{3}$/i.test(raw)) return `#${[...raw.slice(1)].map(c => c + c).join('')}`.toUpperCase();
    fail(`Invalid ${name}: use an SLD hex color (#RRGGBB or #RGB).`);
}
function paint(node, type, lineOptions = false) {
    if (!node) return { enabled: false, color: type === 'fill' ? '#808080' : '#000000', opacity: 1, ...(type === 'stroke' ? { width: 1 } : {}) };
    const result = { enabled: true, color: type === 'fill' ? '#808080' : '#000000', opacity: 1, ...(type === 'stroke' ? { width: 1 } : {}) };
    const seen = new Set();
    for (const parameter of children(node, 'CssParameter')) {
        const name = parameter.getAttribute('name');
        if (seen.has(name)) fail(`Duplicate CssParameter: ${name}.`);
        seen.add(name);
        const raw = value(parameter).trim();
        if (name === type) result.color = color(raw, name);
        else if (name === `${type}-opacity`) result.opacity = numeric(raw, name, 0, 1);
        else if (type === 'stroke' && name === 'stroke-width') result.width = numeric(raw, name, 0, 100);
        else if (lineOptions && name === 'stroke-dasharray') {
            const parts = raw.split(/\s+/);
            if (!raw || parts.length > 32) fail('stroke-dasharray requires 1–32 space-separated lengths.');
            result.dashArray = parts.map(part => numeric(part, name, 0, 1024));
            // Canvas repeats an odd array twice, as required by alternating dash/gap semantics.
            const period = result.dashArray.reduce((sum, n) => sum + n, 0) * (parts.length % 2 ? 2 : 1);
            if (period < 0.1 || period > 4096) fail('stroke-dasharray period must be 0.1–4096 pixels.');
        }
        else if (lineOptions && name === 'stroke-linecap') {
            if (!['butt', 'round', 'square'].includes(raw)) fail('Unsupported stroke-linecap.');
            result.lineCap = raw;
        }
        else if (lineOptions && name === 'stroke-linejoin') {
            if (!['miter', 'mitre', 'round', 'bevel'].includes(raw)) fail('Unsupported stroke-linejoin.');
            result.lineJoin = raw === 'mitre' ? 'miter' : raw;
        }
        else fail(`Unsupported CssParameter: ${name || '(missing name)'}.`);
    }
    if (lineOptions) result.specified = [...seen];
    return result;
}

function pointSymbolizer(node) {
    const graphic = one(node, 'Graphic', true);
    const mark = one(graphic, 'Mark', true);
    const shape = value(one(mark, 'WellKnownName')).trim() || 'square';
    // Cross/x in SLD are filled plus-shaped polygons. OL's four-ray RegularShape
    // is an open hairline cross, so it cannot faithfully represent those marks.
    if (!['circle', 'square', 'triangle', 'star'].includes(shape)) fail(`Unsupported point mark: ${shape}. Supported marks: circle, square, triangle, star.`);
    const fillNode = one(mark, 'Fill');
    if (fillNode && one(fillNode, 'GraphicFill')) fail('GraphicFill in a point Mark is not supported.');
    const number = (tag, fallback, min, max) => {
        const child = one(graphic, tag);
        return child ? numeric(value(child), `point ${tag}`, min, max) : fallback;
    };
    const fill = paint(fillNode, 'fill'), stroke = paint(one(mark, 'Stroke'), 'stroke', true);
    if (stroke.width > SLD_LIMITS.pointStrokeWidth) fail(`Point stroke-width must not exceed ${SLD_LIMITS.pointStrokeWidth} pixels.`);
    return { type: 'point', shape, size: number('Size', 6, 1, SLD_LIMITS.pointSize), rotation: number('Rotation', 0, -360, 360),
        opacity: number('Opacity', 1, 0, 1), fill, stroke,
        specified: [...graphic.children].map(child => child.localName) };
}

function polygonFill(node) {
    const fill = paint(node, 'fill');
    const graphicFill = node && one(node, 'GraphicFill');
    if (!graphicFill) return fill;
    const graphic = one(graphicFill, 'Graphic', true);
    const mark = one(graphic, 'Mark', true);
    const name = value(one(mark, 'WellKnownName', true)).trim();
    if (!['hatch', 'times', 'shape://times'].includes(name)) fail(`Unsupported pattern mark: ${name}. Supported marks: hatch, times, shape://times.`);
    const markFillNode = one(mark, 'Fill');
    if (markFillNode && one(markFillNode, 'GraphicFill')) fail('Nested GraphicFill in a pattern Mark is not supported.');
    const number = (tag, fallback, min, max) => {
        const node = one(graphic, tag);
        return node ? numeric(value(node), `pattern ${tag}`, min, max) : fallback;
    };
    // GraphicFill replaces the solid color, which remains serializable metadata.
    // Keep the name: GeoTools' ShapeMarkFactory requires the shape:// prefix.
    // Bare times is unresolved and contributes no GraphicFill paint.
    fill.pattern = { mark: name,
        size: number('Size', 16, 1, SLD_LIMITS.patternSize), rotation: number('Rotation', 0, -360, 360),
        opacity: number('Opacity', 1, 0, 1), fill: paint(markFillNode, 'fill'), stroke: paint(one(mark, 'Stroke'), 'stroke') };
    if (fill.pattern.stroke.width > SLD_LIMITS.patternStrokeWidth) fail(`Pattern stroke-width must not exceed ${SLD_LIMITS.patternStrokeWidth} pixels.`);
    return fill;
}

export function validateSldFile(file) {
    if (!file || !/\.sld$/i.test(file.name)) fail('Choose a .sld file.');
    if (!Number.isFinite(file.size) || file.size <= 0 || file.size > SLD_LIMITS.bytes) fail('SLD files must be nonempty and no larger than 1 MiB.');
}

export function parseSld(xml) {
    if (typeof xml !== 'string' || !xml.trim() || new TextEncoder().encode(xml).length > SLD_LIMITS.bytes) fail('SLD must be nonempty and no larger than 1 MiB.');
    if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) fail('DOCTYPE and entity declarations are not allowed in SLD files.');
    if (typeof DOMParser === 'undefined') fail('SLD XML parsing requires a browser DOMParser.');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagNameNS('*', 'parsererror').length || doc.doctype) fail('Malformed or unsafe SLD XML.');
    const root = doc.documentElement;
    if (root?.localName !== 'StyledLayerDescriptor' || root.namespaceURI !== SLD) fail('Expected an OGC SLD StyledLayerDescriptor root.');
    if (root.getAttribute('version') !== '1.0.0') fail('Only SLD version 1.0.0 is supported.');
    let count = 0;
    const inspect = (node, depth) => {
        if (++count > SLD_LIMITS.elements || depth > SLD_LIMITS.depth) fail('SLD parsing complexity limit exceeded.');
        const name = node.localName;
        if (!Object.hasOwn(grammar, name) || node.namespaceURI !== (ogcElements.has(name) ? OGC : SLD)) fail(`Unsupported SLD construct: ${name}. Only supported vector paints, marks and equality filters can be imported.`);
        for (const attribute of node.attributes) {
            if (attribute.namespaceURI === XMLNS) continue;
            if (node === root && ((!attribute.namespaceURI && attribute.name === 'version') || (attribute.namespaceURI === 'http://www.w3.org/2001/XMLSchema-instance' && attribute.localName === 'schemaLocation'))) continue;
            if (name === 'CssParameter' && attribute.name === 'name') continue;
            // matchCase=true is the only equality behavior represented by category keys.
            if (name === 'PropertyIsEqualTo' && attribute.name === 'matchCase' && attribute.value === 'true') continue;
            fail(`Unsupported attribute ${attribute.name} on ${name}.`);
        }
        for (const child of node.childNodes) {
            if (child.nodeType === 7) fail('XML processing instructions are not supported.');
            if ((child.nodeType === 3 || child.nodeType === 4) && grammar[name].length && child.textContent.trim()) fail(`Unexpected text in ${name}.`);
        }
        for (const child of node.children) {
            // Inspect first so unsupported constructs get a useful name (GraphicFill, ElseFilter, etc.).
            inspect(child, depth + 1);
            if (!grammar[name].includes(child.localName)) fail(`Unsupported ${child.localName} in ${name}.`);
        }
        for (const singleton of grammar[name].filter(entry => !['Rule', 'PolygonSymbolizer', 'PointSymbolizer', 'LineSymbolizer', 'CssParameter', 'NamedLayer', 'UserLayer'].includes(entry))) one(node, singleton);
    };
    for (const node of doc.childNodes) if (node.nodeType === 7) fail('XML processing instructions are not supported.');
    inspect(root, 1);
    const layers = [...children(root, 'NamedLayer'), ...children(root, 'UserLayer')];
    if (layers.length !== 1) fail('Import one SLD layer at a time.');
    const userStyle = one(layers[0], 'UserStyle', true);
    const fts = one(userStyle, 'FeatureTypeStyle', true);
    // GeoServer's generic Feature name does not constrain the uploaded dataset.
    // A concrete feature type cannot be safely mapped to an arbitrary local file.
    const featureType = one(fts, 'FeatureTypeName');
    if (featureType && value(featureType).trim() !== 'Feature') fail('Only the generic Feature FeatureTypeName is supported.');
    const ruleNodes = children(fts, 'Rule');
    if (!ruleNodes.length || ruleNodes.length > SLD_LIMITS.rules) fail(`SLD must contain 1–${SLD_LIMITS.rules} rules.`);
    let attribute = null, symbolizerCount = 0, geometryType = null;
    const rules = ruleNodes.map((rule, index) => {
        const filter = one(rule, 'Filter');
        let literal = null;
        if (filter) {
            const equality = one(filter, 'PropertyIsEqualTo', true);
            const field = value(one(equality, 'PropertyName', true)).trim();
            if (!field || ['__proto__', 'prototype', 'constructor'].includes(field)) fail('Invalid or unsafe classification attribute.');
            if (attribute !== null && attribute !== field) fail('Only one common classification attribute is supported.');
            attribute = field;
            literal = value(one(equality, 'Literal', true));
        } else if (ruleNodes.length !== 1) fail('Multiple rules require equality filters on one common attribute.');
        const nodes = [...rule.children].filter(child => child.localName.endsWith('Symbolizer'));
        symbolizerCount += nodes.length;
        if (!nodes.length || nodes.length > SLD_LIMITS.symbolizersPerRule || symbolizerCount > SLD_LIMITS.symbolizers) fail(`${nodes[0]?.localName || 'Symbolizer'} limit: 1–${SLD_LIMITS.symbolizersPerRule} per rule, ${SLD_LIMITS.symbolizers} per file.`);
        const symbolizers = nodes.map(polygon => {
            const type = { PolygonSymbolizer: 'polygon', PointSymbolizer: 'point', LineSymbolizer: 'line' }[polygon.localName];
            if (geometryType && geometryType !== type) fail('Mixed symbolizer geometries are not supported. Import one compatible geometry style at a time.');
            geometryType = type;
            if (type === 'point') return pointSymbolizer(polygon);
            if (type === 'line') return { type, stroke: paint(one(polygon, 'Stroke', true), 'stroke', true) };
            const fill = polygonFill(one(polygon, 'Fill'));
            const stroke = paint(one(polygon, 'Stroke'), 'stroke');
            if (!fill.enabled && !stroke.enabled) fail('PolygonSymbolizer must contain a Fill or Stroke.');
            return { type: 'polygon', fill, stroke };
        });
        return { name: value(one(rule, 'Name')).trim(), label: value(one(rule, 'Title')).trim() || value(one(rule, 'Name')).trim() || literal || `Rule ${index + 1}`,
            literal, symbolizers };
    });
    const patterns = new Map();
    for (const rule of rules) for (const symbolizer of rule.symbolizers) {
        const pattern = symbolizer.fill?.pattern;
        if (pattern) patterns.set(JSON.stringify(pattern), Math.ceil(pattern.size * 2) ** 2);
    }
    if ([...patterns.values()].reduce((sum, pixels) => sum + pixels, 0) > SLD_LIMITS.patternPixels) fail('SLD pattern resource budget exceeded.');
    const points = new Map();
    for (const rule of rules) for (const symbol of rule.symbolizers) {
        if (symbol.type === 'point') points.set(JSON.stringify(symbol), (symbol.size * 1.5 + symbol.stroke.width * 10 + 2) ** 2);
    }
    if ([...points.values()].reduce((sum, pixels) => sum + pixels, 0) > SLD_LIMITS.pointPixels) fail('SLD point resource budget exceeded.');
    return { version: 1, format: 'sld', sldVersion: '1.0.0', geometryType, attribute,
        title: value(one(userStyle, 'Title')).trim() || value(one(userStyle, 'Name')).trim() || 'Imported SLD', rules };
}
