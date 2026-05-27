import { Router } from 'express';

import { readBearerToken } from '../auth/google-auth.js';
import {
  getApplicationSourceSettings,
  getReviewSettings,
} from './settings.service.js';

export const settingsRouter = Router();

settingsRouter.get('/application-source', async (req, res, next) => {
  try {
    const settings = await getApplicationSourceSettings(readBearerToken(req));
    res.json({ data: settings });
  } catch (error) {
    next(error);
  }
});

settingsRouter.get('/review', async (req, res, next) => {
  try {
    const settings = await getReviewSettings(readBearerToken(req));
    res.json({ data: settings });
  } catch (error) {
    next(error);
  }
});
