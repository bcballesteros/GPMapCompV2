const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function detectShareOutputFormat(imageData) {
  if (!Buffer.isBuffer(imageData)) return null;
  if (imageData.length >= 8 && imageData.subarray(0, 8).equals(PNG_SIGNATURE)) return 'png';
  if (imageData.length >= 3 && imageData[0] === 0xff && imageData[1] === 0xd8 && imageData[2] === 0xff) return 'jpeg';
  if (imageData.length >= 5 && imageData.subarray(0, 5).toString('ascii') === '%PDF-') return 'pdf';
  return null;
}

export const SHARE_OUTPUT_TYPES = Object.freeze({
  png: { contentType: 'image/png', filename: 'shared-map.png' },
  jpeg: { contentType: 'image/jpeg', filename: 'shared-map.jpg' },
  pdf: { contentType: 'application/pdf', filename: 'shared-map.pdf' },
});
