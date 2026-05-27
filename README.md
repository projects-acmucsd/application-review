# ACM Projects App Review

## Install

```bash
npm install
```

## Run Locally

Frontend and backend:

```bash
npm run dev
```

## Run Validation

```bash
npm run typecheck
npm run lint
npm run build
```

## OAuth Redirects

Production builds default Google sign-in to
`https://application-review-five.vercel.app`, matching the backend
`GOOGLE_REDIRECT_PROD` default. Set `VITE_GOOGLE_REDIRECT_URI` and
`GOOGLE_REDIRECT_PROD` to the same Google-authorized production origin if that
canonical URL changes. Non-production deployments bounce to the configured
production origin before starting Google sign-in instead of using an
unregistered preview URL as the OAuth redirect URI.

## Demo Admin

Set `VITE_ENABLE_DEMO_ADMIN=true` for a temporary demo deployment to show a
`Use Demo Admin` login button. The demo session uses client-side mock data and
shows the admin panel without Google OAuth.
