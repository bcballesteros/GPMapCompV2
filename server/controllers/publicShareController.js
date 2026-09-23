import { retrieveSharedMap, SharedMapNotFoundError } from '../services/shareService.js';
import { InvalidShareTokenError, ShareConfigurationError } from '../services/shareTokenService.js';

export async function getSharedMap(req, res) {
  try {
    const { imageData, contentType, filename } = await retrieveSharedMap(req.params.token);
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${filename}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      'Content-Length': imageData.length,
    });
    return res.status(200).send(imageData);
  } catch (error) {
    if (error instanceof InvalidShareTokenError || error instanceof SharedMapNotFoundError) {
      return res.status(404).json({
        success: false,
        error: { code: 'SHARED_MAP_NOT_FOUND', message: 'The shared map could not be found.' },
      });
    }
    if (error instanceof ShareConfigurationError) {
      return res.status(500).json({
        success: false,
        error: { code: 'SHARE_CONFIGURATION_ERROR', message: 'Share service is not configured.' },
      });
    }
    console.error('Share retrieval failed.');
    return res.status(500).json({
      success: false,
      error: { code: 'SHARE_RETRIEVAL_FAILED', message: 'Unable to retrieve the shared map.' },
    });
  }
}
