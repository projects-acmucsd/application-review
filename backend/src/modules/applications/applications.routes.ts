import { Router } from 'express';

import { listApplications } from './applications.service.js';

export const applicationsRouter = Router();

applicationsRouter.get('/', async (_req, res, next) => {
  try {
    const applications = await listApplications();
    res.json({ data: applications });
  } catch (error) {
    next(error);
  }
});
