import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getPrisma() {
  if (!globalForPrisma.prisma) {
    const databaseUrl = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
    const databasePath = databaseUrl.startsWith("file:")
      ? databaseUrl.slice("file:".length)
      : databaseUrl;
    const adapter = new PrismaBetterSqlite3({ url: databasePath });
    globalForPrisma.prisma = new PrismaClient({ adapter });
  }

  return globalForPrisma.prisma;
}
