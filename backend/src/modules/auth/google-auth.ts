import type { Request } from 'express';

import { env } from '../../config/env.js';

const ALLOWED_GOOGLE_EMAIL_DOMAIN = 'acmucsd.org';
const ALLOWED_GOOGLE_EMAIL_SUFFIX = `@${ALLOWED_GOOGLE_EMAIL_DOMAIN}`;
const DEVELOPMENT_ACCESS_TOKEN = 'development-access-token';

interface GoogleUserInfoResponse {
  email?: string;
  name?: string;
  picture?: string;
}

export interface GoogleProfile {
  email: string;
  name: string;
  picture: string;
}

export function createHttpError(
  statusCode: number,
  message: string,
): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

export function assertAllowedGoogleProfile(profile: GoogleProfile) {
  if (!profile.email.toLowerCase().endsWith(ALLOWED_GOOGLE_EMAIL_SUFFIX)) {
    throw createHttpError(
      403,
      `Access is restricted to ${ALLOWED_GOOGLE_EMAIL_SUFFIX} Google accounts.`,
    );
  }
}

export function readBearerToken(req: Request): string {
  const authorization = req.get('authorization') ?? '';
  const [scheme, token] = authorization.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw createHttpError(401, 'Missing Google access token.');
  }

  return token;
}

export async function fetchGoogleProfile(
  accessToken: string,
): Promise<GoogleProfile> {
  if (accessToken === DEVELOPMENT_ACCESS_TOKEN && env.nodeEnv !== 'production') {
    return {
      email: 'test-reviewer@acmucsd.org',
      name: 'Test Reviewer',
      picture: '',
    };
  }

  const profileResponse = await fetch(
    'https://www.googleapis.com/oauth2/v3/userinfo',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  const profileData = (await profileResponse.json()) as GoogleUserInfoResponse;

  if (!profileResponse.ok) {
    throw createHttpError(401, 'Failed to load Google profile.');
  }

  const profile = {
    email: profileData.email ?? '',
    name: profileData.name ?? '',
    picture: profileData.picture ?? '',
  };

  assertAllowedGoogleProfile(profile);
  return profile;
}
