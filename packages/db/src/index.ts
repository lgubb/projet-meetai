import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

export type {
  Agent,
  Artifact,
  Organization,
  OrganizationMember,
  Prisma,
  Room,
  RoomParticipant,
  User
} from "@prisma/client";

export { PrismaClient };

type GlobalWithPrisma = typeof globalThis & {
  jeanPrisma?: PrismaClient;
};

export function createPrismaClient(databaseUrl = process.env.DATABASE_URL): PrismaClient {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to create a Prisma client.");
  }

  const adapter = new PrismaPg(databaseUrl);

  return new PrismaClient({ adapter });
}

export function getPrismaClient(): PrismaClient {
  const globalForPrisma = globalThis as GlobalWithPrisma;

  globalForPrisma.jeanPrisma ??= createPrismaClient();

  return globalForPrisma.jeanPrisma;
}
