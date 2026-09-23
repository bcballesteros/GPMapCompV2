import { Router } from 'express';
import { createShare } from '../controllers/shareController.js';

const router = Router();

router.post('/', createShare);

export default router;
