import { Router } from 'express';

import { adminRouter } from '../modules/admin/admin.routes.js';
import { applicationsRouter } from '../modules/applications/applications.routes.js';
import { assignmentsRouter } from '../modules/assignments/assignments.routes.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { reviewsRouter } from '../modules/reviews/reviews.routes.js';
import { settingsRouter } from '../modules/settings/settings.routes.js';
import { healthRouter } from './health.js';

export const apiRouter = Router();

apiRouter.use('/admin', adminRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/health', healthRouter);
apiRouter.use('/applications', applicationsRouter);
apiRouter.use('/assignments', assignmentsRouter);
apiRouter.use('/reviews', reviewsRouter);
apiRouter.use('/settings', settingsRouter);
