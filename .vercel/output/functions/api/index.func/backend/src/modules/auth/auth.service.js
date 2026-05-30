import { env } from '../../config/env.js';
import { fetchGoogleProfile } from './google-auth.js';
function getAllowedRedirectUris() {
    return [env.googleRedirectDev, env.googleRedirectProd].filter((value) => Boolean(value));
}
function assertGoogleOAuthConfig() {
    if (!env.googleClientId) {
        throw new Error('Missing Google OAuth client id.');
    }
    if (!env.googleClientSecret) {
        throw new Error('Missing GOOGLE_CLIENT_SECRET.');
    }
}
function assertAllowedRedirectUri(redirectUri) {
    if (!getAllowedRedirectUris().includes(redirectUri)) {
        throw new Error(`Unauthorized redirect URI: ${redirectUri}`);
    }
}
async function exchangeCodeForAccessToken(input) {
    assertGoogleOAuthConfig();
    assertAllowedRedirectUri(input.redirectUri);
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            code: input.code,
            client_id: env.googleClientId,
            client_secret: env.googleClientSecret,
            redirect_uri: input.redirectUri,
            grant_type: 'authorization_code',
        }),
    });
    const tokenData = (await tokenResponse.json());
    if (!tokenResponse.ok || !tokenData.access_token) {
        throw new Error(tokenData.error_description ??
            tokenData.error ??
            'Failed to exchange Google authorization code.');
    }
    return tokenData.access_token;
}
export async function exchangeGoogleCode(input) {
    const accessToken = await exchangeCodeForAccessToken(input);
    const profile = await fetchGoogleProfile(accessToken);
    return {
        accessToken,
        profile,
    };
}
//# sourceMappingURL=auth.service.js.map