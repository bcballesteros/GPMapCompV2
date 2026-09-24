import { processShare, ShareRequestError } from '../services/shareService.js';
import { ShareConfigurationError } from '../services/shareTokenService.js';
import { EmailConfigurationError, EmailDeliveryError } from '../services/emailService.js';

export async function handleCreateShare(req, res, shareProcessor) {
  try {
    await shareProcessor(req.body);
    return res.status(201).json({ success: true, message: 'Map shared successfully.' });
  } catch (error) {
    if (error instanceof ShareConfigurationError) {
      return res.status(500).json({
        success: false,
        error: { code: 'SHARE_CONFIGURATION_ERROR', message: 'Share service is not configured.' },
      });
    }
    if (error instanceof ShareRequestError) {
      return res.status(error.status).json({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }

    if (error instanceof EmailConfigurationError) {
      return res.status(500).json({
        success: false,
        error: { code: 'EMAIL_CONFIGURATION_ERROR', message: 'Email service is not configured.' },
      });
    }
    if (error instanceof EmailDeliveryError) {
      console.error('Share email delivery failed.');
      return res.status(500).json({
        success: false,
        error: { code: 'EMAIL_DELIVERY_FAILED', message: 'Unable to send the shared map.' },
      });
    }

    console.error('Share storage failed.');
    return res.status(500).json({
      success: false,
      error: { code: 'SHARE_STORAGE_FAILED', message: 'Unable to store the shared map.' },
    });
  }
}

export async function createShare(req, res) {
  return handleCreateShare(req, res, processShare);
}
