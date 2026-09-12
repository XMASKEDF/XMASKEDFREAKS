# Required Supabase Values

| Variable | Visibility | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Browser/server project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Browser-safe Supabase client key |
| `SUPABASE_SERVICE_ROLE_KEY` | SERVER ONLY | Server-side Admin/database operations; never expose |

Owner action: retrieve values from Supabase project settings and store them in `.env.local` for local use and the deployment secret manager for production.
