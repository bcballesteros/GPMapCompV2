import { Router } from 'express';
import { getSharedMap } from '../controllers/publicShareController.js';

const router = Router();

router.get('/:token', getSharedMap);

export default router;
