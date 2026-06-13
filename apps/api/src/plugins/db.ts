import { getPrismaClient } from "@jean/db";
import type { FastifyInstance } from "fastify";

import type { ApiDatabase } from "../db.js";

declare module "fastify" {
  interface FastifyInstance {
    db: ApiDatabase;
  }
}

export function registerDb(server: FastifyInstance, db: ApiDatabase = getPrismaClient()): void {
  server.decorate("db", db);
  server.addHook("onClose", async () => {
    await db.$disconnect();
  });
}
