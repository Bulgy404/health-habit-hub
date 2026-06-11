import express from 'express';
import { renderConsent } from '../controllers/consentController.js';

const router = express.Router();

router.get('/', renderConsent);

export default router;
