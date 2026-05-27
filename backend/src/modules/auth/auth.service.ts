import { env } from '../../config/env.js';
import { fetchGoogleProfile } from './google-auth.js';

export interface ExchangeGoogleCodeInput {
  code: string;
  redirectUri: string;
}

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

function getAllowedRedirectUris(): string[] {
  return [env.googleRedirectDev, env.googleRedirectProd].filter(
    (value): value is string => Boolean(value),
  );
}

function assertGoogleOAuthConfig() {
  if (!env.googleClientId) {
    throw new Error('Missing Google OAuth client id.');
  }

  if (!env.googleClientSecret) {
    throw new Error('Missing GOOGLE_CLIENT_SECRET.');
  }
}

function assertAllowedRedirectUri(redirectUri: string) {
  if (!getAllowedRedirectUris().includes(redirectUri)) {
    throw new Error(`Unauthorized redirect URI: ${redirectUri}`);
  }
}

async function exchangeCodeForAccessToken(
  input: ExchangeGoogleCodeInput,
): Promise<string> {
  assertGoogleOAuthConfig();
  assertAllowedRedirectUri(input.redirectUri);

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code: input.code,
      client_id: env.googleClientId!,
      client_secret: env.googleClientSecret!,
      redirect_uri: input.redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const tokenData = (await tokenResponse.json()) as GoogleTokenResponse;

  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new Error(
      tokenData.error_description ??
        tokenData.error ??
        'Failed to exchange Google authorization code.',
    );
  }

  return tokenData.access_token;
}

export async function exchangeGoogleCode(input: ExchangeGoogleCodeInput) {
  const accessToken = await exchangeCodeForAccessToken(input);
  const profile = await fetchGoogleProfile(accessToken);

  return {
    accessToken,
    profile,
  };
}
