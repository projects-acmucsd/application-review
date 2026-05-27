import cors from 'cors';
import express from 'express';

import { env } from './config/env.js';
import { errorHandler } from './middleware/error-handler.js';
import { apiRouter } from './routes/index.js';

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: env.frontendOrigin,
      credentials: true,
    }),
  );
  app.use(express.json());

  app.get('/', (_req, res) => {
    res.json({
      message: 'ACM Projects App Review backend is running.',
    });
  });

  app.use('/api', apiRouter);
  app.use(errorHandler);

  return app;
}
