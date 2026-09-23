import { Router } from 'express';
import shareRouter from './share.js';

const router = Router();

router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'GPMapCompV2 API' });
});

router.use('/share', shareRouter);

export default router;
