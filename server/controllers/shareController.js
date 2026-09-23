import { processShare, ShareRequestError } from '../services/shareService.js';

export async function createShare(req, res) {
  try {
    await processShare(req.body);
    return res.status(201).json({ success: true, message: 'Map stored successfully.' });
  } catch (error) {
    if (error instanceof ShareRequestError) {
      return res.status(error.status).json({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }

    console.error('Share storage failed.');
    return res.status(500).json({
      success: false,
      error: { code: 'SHARE_STORAGE_FAILED', message: 'Unable to store the shared map.' },
    });
  }
}
