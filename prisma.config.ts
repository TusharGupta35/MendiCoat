import { config } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// Next.js loads .env.local automatically, but Prisma commands run outside Next.
config({ path: '.env.local' });

export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
});
