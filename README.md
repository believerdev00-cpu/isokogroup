# Isoko

The Isoko website (marketplace, logistics, travel, consultancy, data analysis,
software, E-Library, entertainment) and the Isoko Training Center.

| Folder | What |
| --- | --- |
| `src/` | The website (React + Vite), deployed on Vercel |
| `training-api/` | The Training Center API, built into the `training` Edge Function |
| `supabase/migrations/` | The database: tables, row-level security, payment ledger, notification engine |
| `supabase/functions/` | Edge Functions: `training`, `payments-webhook`, `notifications-dispatch`, `file-access`, `service-files`, `generate-pdf` |
| `supabase/tests/` | Database and end-to-end tests |
| `supabase/checks/` | Read-only production readiness check |
| `docs/DEPLOYMENT.md` | How to deploy, check and roll back |

## Develop

```sh
cp .env.example .env        # fill in the VITE_ values
npm install
npm run dev
```

With a local Supabase (`supabase start`):

```sh
npm run test:db                    # database rules (every suite rolls back)
npm --prefix training-api test     # Training Center API (rebuilds the local training schema)
```

CI (`.github/workflows/ci.yml`) runs these, the end-to-end tests, lint, types
and the builds on every push.
