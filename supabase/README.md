# Supabase Workspace

Use this directory for database assets that should live in source control.

## Expected layout

- `migrations/`: versioned SQL migrations
- `types/database.ts`: generated database types used by the backend

## Recommended workflow

1. Add schema and policy changes as SQL files in `migrations/`
2. Apply them through the Supabase CLI against a local or preview project
3. Regenerate `types/database.ts`
4. Update backend callers to use the generated types

Do not place service role secrets in this directory.
