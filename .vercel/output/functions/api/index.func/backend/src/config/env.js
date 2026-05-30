import dotenv from 'dotenv';
dotenv.config();
function getPort(value) {
    if (!value) {
        return 4000;
    }
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) {
        throw new Error(`PORT must be a valid integer. Received: ${value}`);
    }
    return parsed;
}
function getOptionalEnv(name) {
    const value = process.env[name];
    if (!value) {
        return undefined;
    }
    return value;
}
function getGoogleClientId() {
    return process.env.GOOGLE_CLIENT_ID ?? process.env.VITE_GOOGLE_CLIENT_ID;
}
function parseEmailList(value) {
    if (!value) {
        return [];
    }
    return value
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean);
}
function parseReviewerEntry(entry) {
    const trimmedEntry = entry.trim();
    if (!trimmedEntry) {
        return null;
    }
    const angleMatch = /^(.*?)\s*<([^>]+)>$/.exec(trimmedEntry);
    if (angleMatch) {
        const name = angleMatch[1]?.trim() || angleMatch[2]?.trim() || '';
        const email = angleMatch[2]?.trim().toLowerCase() || '';
        return email ? { email, name } : null;
    }
    const [email, name] = trimmedEntry.split('|').map((part) => part.trim());
    if (!email) {
        return null;
    }
    return {
        email: email.toLowerCase(),
        name: name || email,
    };
}
function parseReviewerList(value) {
    if (!value) {
        return [];
    }
    return value
        .split(',')
        .map(parseReviewerEntry)
        .filter((entry) => Boolean(entry));
}
export const env = {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: getPort(process.env.PORT),
    frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
    googleClientId: getGoogleClientId(),
    googleClientSecret: getOptionalEnv('GOOGLE_CLIENT_SECRET'),
    googleRedirectDev: process.env.GOOGLE_REDIRECT_DEV ?? 'http://localhost:5173',
    googleRedirectProd: process.env.GOOGLE_REDIRECT_PROD ?? 'https://acm-projects-app-review.vercel.app',
    supabaseUrl: getOptionalEnv('SUPABASE_URL'),
    supabaseServiceRoleKey: getOptionalEnv('SUPABASE_SERVICE_ROLE_KEY'),
    adminEmails: parseEmailList(process.env.ADMIN_EMAILS),
    reviewerList: parseReviewerList(process.env.REVIEWER_LIST),
};
//# sourceMappingURL=env.js.map