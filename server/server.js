import { env } from './config/env.js';
import { createApp } from './app.js';

createApp().listen(env.port, () => {
  console.log(`GPMapCompV2 API listening on port ${env.port}`);
});
