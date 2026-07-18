import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const prismaClientSingleton = () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required to use Prisma.');

  // Prisma 7 requires a database driver adapter. PrismaPg works with Supabase's
  // standard PostgreSQL connection string and is kept in the singleton in dev.
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
};

export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
