import { clerkPlugin } from "@clerk/fastify";
import type { FastifyInstance } from "fastify";

import { getAuthMode } from "../auth.js";

export function registerAuth(server: FastifyInstance): void {
  if (getAuthMode() !== "clerk") {
    return;
  }

  server.register(clerkPlugin, {
    secretKey: process.env.CLERK_SECRET_KEY,
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY
  });
}
