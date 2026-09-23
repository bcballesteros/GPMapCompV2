import { processShare } from '../services/shareService.js';

export function createShare(req, res, next) {
  try {
    processShare(req.body);
  } catch (error) {
    if (error.code === 'SHARE_NOT_IMPLEMENTED') {
      return res.status(501).json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    return next(error);
  }
}
