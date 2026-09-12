# Supabase Setup

The project uses `@supabase/ssr`, `@supabase/supabase-js`, REST service calls, authentication, RLS, migrations, media metadata, Admin audit records, wallet/accounting records, support, risk, and launch-readiness tables.

Owner action: create or select the approved Supabase project. Place the public URL and anon key in public environment configuration. Place the service role key only in server/deployment secrets. Never put the service role key in the browser or this kit.

Code and migrations exist. Connection, RLS, Admin role, storage, realtime, and migration application are not verified without credentials.
