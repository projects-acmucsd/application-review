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
`https://acm-projects-app-review.vercel.app`, matching the backend
`GOOGLE_REDIRECT_PROD` default. Set `VITE_GOOGLE_REDIRECT_URI` and
`GOOGLE_REDIRECT_PROD` to the same Google-authorized production origin if that
canonical URL changes. Preview deployments bounce to the canonical origin before
starting Google sign-in instead of using an unregistered preview URL as the
OAuth redirect URI.
