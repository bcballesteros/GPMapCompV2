import assert from 'node:assert/strict';
import test from 'node:test';
import { layoutOutputLegend, wrapLegendText, assertOutputSize, OutputSizeError } from '../src/services/output-legend-layout.js';

const measure = text => [...text].length * 10;
const group = (count, label = 'Category') => ({ name: 'Uploaded dataset', entries: Array.from({ length: count }, (_, i) => ({ id: i, label: `${label} ${i}` })) });

test('no eligible vectors leaves the original map dimensions and no panel', () => {
    const result = layoutOutputLegend([], 2560, 1920, 48, measure);
    assert.equal(result.width, 2560); assert.equal(result.height, 1968); assert.deepEqual(result.columns, []);
});

test('55 rules and multiple groups retain every entry and order across measured columns', () => {
    const groups = [group(55), { ...group(20), name: 'Second group' }];
    const layout = layoutOutputLegend(groups, 2560, 1440, 36, measure);
    const entries = layout.columns.flat().filter(row => row.type === 'entry');
    assert.deepEqual(entries.map(entry => entry.id), groups.flatMap(group => group.entries.map(entry => entry.id)));
    assert.ok(layout.columns.length > 1);
    for (const row of entries) assert.ok(row.y + row.height <= layout.contentHeight - 24);
});

test('long labels and unbroken unicode names wrap without losing content', () => {
    const text = 'Very long description '.repeat(20).trim();
    const lines = wrapLegendText(text, 200, measure);
    assert.equal(lines.join(' '), text);
    const unicode = '🌏'.repeat(60);
    assert.equal(wrapLegendText(unicode, 200, measure).join(''), unicode);
    assert.ok(lines.every(line => measure(line) <= 200));
});

test('long legends grow height without shrinking fonts or dropping categories', () => {
    const layout = layoutOutputLegend([group(200)], 2560, 600, 24, measure);
    assert.ok(layout.contentHeight > 600); assert.ok(layout.columns.length <= 3);
    assert.equal(layout.columns.flat().filter(row => row.type === 'entry').length, 200);
});

test('oversized legends and canvas dimensions fail with an actionable error', () => {
    assert.throws(() => layoutOutputLegend([group(5000)], 2560, 1920, 48, measure), OutputSizeError);
    for (const dimensions of [[9000, 100], [6000, 6000], [0, 20], [NaN, 20]]) {
        assert.throws(() => assertOutputSize(...dimensions), /Hide some layers/);
    }
});

// At 354px, a one-line heading and exactly five 42px entries fill a
// column: 76px top + 44px heading + 210px entries + 24px bottom.
const namedGroup = (name, count) => ({ name, entries: Array.from({ length: count }, (_, i) => ({
    id: `${name}-${i}`, label: `${name} ${i}`
})) });

function assertCompleteLayout(groups, layout) {
    assert.deepEqual(layout.columns.flat().filter(row => row.type === 'entry').map(row => row.id),
        groups.flatMap(group => group.entries.map(entry => entry.id)));
    assert.ok(layout.columns.length <= 3);
    for (const column of layout.columns) {
        let bottom = 76;
        for (const [index, row] of column.entries()) {
            assert.ok(row.y >= bottom, 'Rows must not overlap');
            if (row.type === 'heading') {
                assert.equal(column[index + 1]?.type, 'entry', 'Every heading stays with an entry');
                bottom = row.y + row.lines.length * 28 + 16;
            } else bottom = row.y + row.height;
            assert.ok(bottom <= layout.contentHeight - 24, 'Complete row stays inside panel');
        }
    }
}

for (const scenario of [
    { name: 'A: one layer fits', groups: [namedGroup('A', 3)], counts: [3] },
    { name: 'B: one layer exactly fills a column', groups: [namedGroup('A', 5)], counts: [5] },
    { name: 'C: one layer continues in a second column', groups: [namedGroup('A', 6)], counts: [5, 1] },
    { name: 'D: next layer reuses space below a continued layer', groups: [namedGroup('A', 6), namedGroup('B', 2)], counts: [5, 3] },
    { name: 'E: next layer starts column three after two full columns', groups: [namedGroup('A', 10), namedGroup('B', 2)], counts: [5, 5, 2] },
    { name: 'F: several groups keep order and skip insufficient remaining space', groups: [namedGroup('A', 2), namedGroup('B', 4), namedGroup('C', 1)], counts: [3, 3, 1] },
    { name: 'H: exactly three columns', groups: [namedGroup('A', 15)], counts: [5, 5, 5] }
]) {
    test(scenario.name, () => {
        const layout = layoutOutputLegend(scenario.groups, 1000, 354, 24, measure);
        assertCompleteLayout(scenario.groups, layout);
        assert.deepEqual(layout.columns.map(column => column.filter(row => row.type === 'entry').length), scenario.counts);
        assert.equal(layout.contentHeight, 354);
        for (const group of scenario.groups) {
            const headings = layout.columns.flat().filter(row => row.type === 'heading' && row.lines.join(' ') === group.name);
            assert.equal(headings[0].continued, false);
            assert.ok(headings.slice(1).every(row => row.continued));
        }
    });
}

test('G: long headings and descriptions wrap, retain text and stay together across columns', () => {
    const groups = [namedGroup('A', 12), namedGroup('B', 3)];
    groups[0].name = 'Long dataset name '.repeat(8).trim();
    for (const group of groups) for (const entry of group.entries) entry.label = 'A detailed category description '.repeat(9).trim();
    const layout = layoutOutputLegend(groups, 1000, 600, 24, measure);
    assertCompleteLayout(groups, layout);
    for (const row of layout.columns.flat()) {
        assert.equal(row.lines.join(' '), row.type === 'heading' ? (row.lines[0].startsWith('Long') ? groups[0].name : 'B') : groups[0].entries[0].label);
        assert.ok(row.lines.every(line => measure(line) <= layout.columnWidth - (row.type === 'heading' ? 40 : 108)));
    }
});

test('fourth-column demand increases height and reflows every entry within three columns', () => {
    const groups = [namedGroup('A', 16), namedGroup('B', 3)];
    const layout = layoutOutputLegend(groups, 1000, 354, 24, measure);
    assert.ok(layout.contentHeight > 354);
    assertCompleteLayout(groups, layout);
});

test('I: one indivisible heading/entry exceeding capacity fails instead of clipping', () => {
    const groups = [namedGroup('A', 1)];
    groups[0].entries[0].label = 'Long description '.repeat(10000);
    assert.throws(() => layoutOutputLegend(groups, 1000, 354, 24, measure), OutputSizeError);
});

test('dimension and pixel boundaries are inclusive, with independent excess rejected', () => {
    for (const dimensions of [[1, 1], [2560, 1968], [8192, 1], [1, 8192], [3000, 8000], [8000, 3000], [8192, 2929]]) {
        assert.doesNotThrow(() => assertOutputSize(...dimensions));
    }
    for (const dimensions of [[8193, 1], [1, 8193], [3000, 8001], [8001, 3000], [8192, 2930], [Infinity, 1], [1, NaN], [-1, 100]]) {
        assert.throws(() => assertOutputSize(...dimensions), OutputSizeError);
    }
});

test('near-area-limit legend is complete and the next category fails explicitly', () => {
    const layout = layoutOutputLegend([namedGroup('A', 435)], 2560, 1920, 48, measure);
    assert.equal(layout.width, 3790);
    assert.equal(layout.height, 6288);
    assert.equal(layout.width * layout.height, 23831520);
    assertCompleteLayout([namedGroup('A', 435)], layout);
    assert.throws(() => layoutOutputLegend([namedGroup('A', 436)], 2560, 1920, 48, measure), OutputSizeError);
});
