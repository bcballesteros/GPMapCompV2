import express from 'express';
import { env } from './config/env.js';
import apiRouter from './routes/index.js';
import publicShareRouter from './routes/publicShare.js';

const app = express();

// Map exports arrive as Base64 in JSON, so allow a modest payload above the default.
app.use(express.json({ limit: '10mb' }));
app.use('/api', apiRouter);
app.use('/share', publicShareRouter);

app.use('/api', (req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'API route not found.' } });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  console.error(`Request failed: ${error.message}`);
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected server error occurred.' },
  });
});

app.listen(env.port, () => {
  console.log(`GPMapCompV2 API listening on port ${env.port}`);
});
