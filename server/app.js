import express from 'express';
import apiRouter from './routes/index.js';
import publicShareRouter from './routes/publicShare.js';
import { SHARE_MAX_REQUEST_BYTES } from './config/share.js';

export function createApp() {
  const app = express();

  app.use('/api/share', express.json({ limit: SHARE_MAX_REQUEST_BYTES }));
  app.use('/api', express.json());
  app.use('/api', apiRouter);
  app.use('/share', publicShareRouter);

  app.use('/api', (req, res) => {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'API route not found.' } });
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);

    if (error?.status === 413 && error?.type === 'entity.too.large') {
      return res.status(413).json({
        success: false,
        error: { code: 'FILE_TOO_LARGE', message: 'The map output exceeds the allowed size.' },
      });
    }

    console.error(`Request failed: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected server error occurred.' },
    });
  });

  return app;
}
