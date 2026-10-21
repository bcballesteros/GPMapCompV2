import assert from 'node:assert/strict';
import test from 'node:test';
import { createPdfBlobFromCanvas } from '../src/services/export-service.js';

// Binary fixture includes bytes that must retain their offsets through encoding.
const jpeg = Uint8Array.of(0xff, 0xd8, 0x00, 0x80, 0xfe, 0xff, 0xd9);

for (const [width, height] of [[2970, 1968], [1920, 2608], [3790, 6288]]) {
    test(`PDF ${width}x${height} references only real objects and fits its complete raster page`, async () => {
        const blob = await createPdfBlobFromCanvas({ width, height, toBlob(callback, mime, quality) {
            assert.equal(mime, 'image/jpeg');
            assert.equal(quality, 0.95);
            callback(new Blob([jpeg], { type: mime }));
        } });
        assert.equal(blob.type, 'application/pdf');
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const text = new TextDecoder('latin1').decode(bytes);
        const xrefOffset = Number(text.match(/startxref\n(\d+)\n%%EOF$/)[1]);
        const xref = text.slice(xrefOffset).split('\n');
        assert.equal(xref[0], 'xref');
        assert.equal(xref[1], '0 6'); // Free object 0 and the five real objects.
        assert.equal(xref[2], '0000000000 65535 f ');
        for (let id = 1; id <= 5; id++) {
            assert.match(xref[id + 2], /^\d{10} 00000 n $/);
            const offset = Number(xref[id + 2].slice(0, 10));
            assert.ok(text.slice(offset).startsWith(`${id} 0 obj\n`), `Object ${id} offset`);
        }
        assert.match(text, /\/Size 6 \/Root 1 0 R/);
        assert.match(text, /\/Count 1/);
        assert.ok(text.includes(`/MediaBox [0 0 ${width} ${height}]`));
        assert.ok(text.includes(`/Width ${width} /Height ${height}`));
        assert.ok(text.includes(`${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ`));
        const streamStart = text.indexOf('stream\n') + 7;
        assert.deepEqual(bytes.slice(streamStart, streamStart + jpeg.length), jpeg);
        assert.ok(text.slice(streamStart + jpeg.length).startsWith('\nendstream\nendobj\n5 0 obj'));
    });
}

test('PDF encoding failure rejects before producing an incomplete artifact', async () => {
    await assert.rejects(createPdfBlobFromCanvas({ width: 100, height: 100, toBlob: callback => callback(null) }),
        /Failed to encode map image for PDF/);
});
