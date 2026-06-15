import type { NextFunction, Request, Response } from 'express';

import { env } from '../config/env.js';

function getStatusCode(error: unknown): number {
  if (error instanceof Error && 'statusCode' in error) {
    const statusCode = (error as Error & { statusCode?: unknown }).statusCode;
    if (typeof statusCode === 'number') {
      return statusCode;
    }
  }

  return 500;
}

function hasExplicitStatusCode(error: unknown): boolean {
  return (
    error instanceof Error &&
    'statusCode' in error &&
    typeof (error as Error & { statusCode?: unknown }).statusCode === 'number'
  );
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  void next;

  const message =
    error instanceof Error ? error.message : 'Unexpected server error';
  const statusCode = getStatusCode(error);
  const responseMessage =
    env.nodeEnv === 'production' && statusCode >= 500 && !hasExplicitStatusCode(error)
      ? 'Unexpected server error'
      : message;

  if (hasExplicitStatusCode(error)) {
    const log = statusCode >= 500 ? console.error : console.warn;
    log(`[${statusCode}] ${message}`);
  } else {
    console.error(error);
  }

  res.status(statusCode).json({
    error: responseMessage,
  });
}
