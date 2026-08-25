import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Next.js loads .env.local / .env automatically, but Prisma commands run outside
// Next, so load them here too. Order matters: dotenv does not overwrite a variable
// that is already set, so .env.local wins over .env, and real environment variables
// injected by the host (Vercel, Railway, Docker) win over both.
config({ path: ['.env.local', '.env'], quiet: true });

// The app talks to Supabase through the PgBouncer transaction pooler (port 6543),
// which is right for request-scoped queries but cannot run migrations: the schema
// engine needs a session-level connection for advisory locks and DDL, so against
// 6543 `prisma db push` connects and then hangs indefinitely. Prisma 7's config has
// no `directUrl`, so point the CLI at the direct port (5432) via DIRECT_URL here.
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('Set DIRECT_URL (preferred) or DATABASE_URL for Prisma CLI commands.');

export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: { url },
});
