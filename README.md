<div align="center">
  <br />
  <img src="./public/acm diamond.png" alt="ACM Project Logo" width="250" />
  <h1>Application Review Tool</h1>
  <h3>Internal tool to make application review easier</h3>
  <p>
    <img src="https://img.shields.io/badge/build-passing-brightgreen" alt="Build passing" />
    <img src="https://img.shields.io/badge/checks-typecheck%20%7C%20lint%20%7C%20build-blue" alt="Checks: typecheck, lint, build" />
    <img src="https://img.shields.io/badge/license-private-6B7280" alt="License private" />
  </p>
</div>

## Stack

- React
- TypeScript
- Vite
- Tailwind CSS

## Quickstart

Install dependencies:

```bash
npm install
```

Run the app locally:

```bash
npm run dev
```

## Production Environment

Set these public frontend variables:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Set these server-only variables:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
ADMIN_EMAILS=admin1@acmucsd.org,admin2@acmucsd.org
REVIEWER_LIST=reviewer1@acmucsd.org|Reviewer One,reviewer2@acmucsd.org|Reviewer Two
VITE_REVIEWER_LIST=reviewer1@acmucsd.org|Reviewer One,reviewer2@acmucsd.org|Reviewer Two
```

Leave `VITE_API_BASE_URL` unset in production unless the API is deployed on a separate origin.

Leave `VITE_WS_BASE_URL` unset in production unless collaboration is served from
a separate WebSocket-capable backend. Vercel functions do not host the local
`/ws/collaboration` server used by `npm run dev`.
