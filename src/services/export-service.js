export function createExportCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

export function downloadCanvas(canvas, mimeType, fileName, quality, onComplete) {
    canvas.toBlob((blob) => {
        onComplete(blob);
        if (!blob) {
            return;
        }

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, mimeType, quality);
}

export function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function blobToUint8Array(blob) {
    return blob.arrayBuffer().then((buffer) => new Uint8Array(buffer));
}

function buildPdfBytes({ jpegBytes, width, height }) {
    const pdfWidth = Number(width.toFixed(2));
    const pdfHeight = Number(height.toFixed(2));
    const header = '%PDF-1.4\n';
    const objects = [
        '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
        '2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n',
        `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfWidth} ${pdfHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
        `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`,
        `\nendstream\nendobj\n`,
        null
    ];
    const contentStream = `q\n${pdfWidth} 0 0 ${pdfHeight} 0 0 cm\n/Im0 Do\nQ\n`;
    objects[5] = `5 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream\nendobj\n`;

    const encoder = new TextEncoder();
    const parts = [encoder.encode(header)];
    const offsets = [0];
    let currentOffset = parts[0].length;

    objects.forEach((object, index) => {
        offsets[index + 1] = currentOffset;
        if (index === 3) {
            const prefix = encoder.encode(object);
            const suffix = encoder.encode(objects[4]);
            parts.push(prefix, jpegBytes, suffix);
            currentOffset += prefix.length + jpegBytes.length + suffix.length;
            return;
        }

        if (index === 4) {
            return;
        }

        const bytes = encoder.encode(object);
        parts.push(bytes);
        currentOffset += bytes.length;
    });

    const xrefStart = currentOffset;
    const xrefRows = ['0000000000 65535 f '];
    for (let index = 1; index < offsets.length; index += 1) {
        xrefRows.push(`${String(offsets[index]).padStart(10, '0')} 00000 n `);
    }

    const xref = `xref\n0 ${offsets.length}\n${xrefRows.join('\n')}\n`;
    const trailer = `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
    parts.push(encoder.encode(xref), encoder.encode(trailer));

    return new Blob(parts, { type: 'application/pdf' });
}

export async function createPdfBlobFromCanvas(canvas) {
    const jpegBlob = await new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', 0.95);
    });

    if (!jpegBlob) {
        throw new Error('Failed to encode map image for PDF');
    }

    const jpegBytes = await blobToUint8Array(jpegBlob);
    return buildPdfBytes({
        jpegBytes,
        width: canvas.width,
        height: canvas.height
    });
}
