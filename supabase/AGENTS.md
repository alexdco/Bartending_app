# Supabase

## Overview

The backend: Postgres schema, row level security, Postgres functions, scheduled jobs, and Deno Edge Functions. Web and mobile both point at the live project `BartendingAppWeb` (`ctuzjhhpnkkhooneporu`).

## Key files

| File | Owns |
|---|---|
| `migrations/` | Every schema change, named `<YYYYMMDDHHMMSS>_<snake_case_name>.sql` |
| `functions/generate-drink-idea/` | Quota checked Claude Haiku call for AI drink ideas (spec 0007) |
| `functions/delete-account/` | Server side account deletion with the service role key (spec 0008) |
| `functions/cleanup-anonymous-accounts/` | Weekly idle anonymous account sweep, triggered by pg_cron (spec 0017) |
| `functions/cleanup-orphan-comment-photos/` | Daily sweep of `comment-photos` storage files no comment points to, triggered by pg_cron (spec 0032) |
| `functions/cleanup-orphan-recipe-images/` | Daily sweep of `recipe-images` storage files no recipe points to, triggered by pg_cron; `{"dryRun": true}` lists without deleting (spec 0041) |
| `config.toml` | Local Supabase CLI stack config |

## Commands

```bash
# Local stack (prints local URL and keys)
supabase start
```

After any migration, regenerate `packages/shared/src/database.types.ts` so both apps see the new types.

## Conventions

- Every table gets RLS. User owned rows are scoped to `auth.uid()`, never a client supplied user id; admin writes check `user_preferences.is_admin` inside the policy or function.
- Multi table or "only if" writes (e.g. `buy_shopping_list_item`, `admin_upsert_recipe`, `submit_quiz_attempt`) are Postgres functions so they stay atomic. Set an explicit `search_path` on every function.
- Revoke `execute` from `anon` on functions guests should not call.
- Edge Functions run on Deno: import with `jsr:` / `npm:` specifiers, resolve the caller from their own JWT, and report errors to Sentry when `SENTRY_DSN` is set. Each function's header comment names its governing spec.
- Secrets read through Vault (e.g. the service role key the cleanup cron uses) are seeded with a placeholder in the migration; the real value is set by hand in the dashboard.
- Edge Function env key variables (even `SUPABASE_SERVICE_ROLE_KEY`) hold new `sb_secret_...` keys on this project, so a pg_cron call sends the `secret_key` Vault secret on the `apikey` header, not the legacy JWT as `Authorization: Bearer`, and the function accepts any `SUPABASE_SECRET_KEYS` value (see `cleanup-orphan-recipe-images`).
- Run the Supabase security advisor after applying a migration.

## Agent skills

- [supabase-postgres-best-practices](../.agents/skills/supabase-postgres-best-practices/): `supabase/agent-skills`, Postgres/Supabase schema, RLS, migrations, and query conventions

_Drafted by /sync from the introducing change, worth a quick human pass._
