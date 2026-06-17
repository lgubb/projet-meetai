import { getAuth } from "@clerk/fastify";
import type { FastifyRequest } from "fastify";

import type { ApiDatabase } from "./db.js";
import { unauthorized } from "./errors.js";

export type AuthMode = "clerk" | "dev";

export type AuthenticatedUser = {
  email: string;
  name: string | null;
};

export function getAuthMode(): AuthMode {
  const explicitMode = process.env.WORKROOM_AUTH_MODE?.trim().toLowerCase();

  if (explicitMode === "clerk" || explicitMode === "dev") {
    return explicitMode;
  }

  if (explicitMode) {
    throw new Error("WORKROOM_AUTH_MODE must be either 'dev' or 'clerk'.");
  }

  return process.env.CLERK_SECRET_KEY ? "clerk" : "dev";
}

export async function requireAuthenticatedUser(request: FastifyRequest): Promise<AuthenticatedUser> {
  if (getAuthMode() === "clerk") {
    const auth = getAuth(request);

    if (!auth.userId) {
      unauthorized();
    }

    const clerkUser = await request.clerk.users.getUser(auth.userId);
    const primaryEmail =
      clerkUser.emailAddresses.find((email) => email.id === clerkUser.primaryEmailAddressId)?.emailAddress ??
      clerkUser.emailAddresses[0]?.emailAddress;

    if (!primaryEmail) {
      unauthorized("Authenticated user has no email address.");
    }

    const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || clerkUser.username || null;

    return {
      email: primaryEmail,
      name
    };
  }

  const email = getHeader(request, "x-dev-user-email");

  if (!email) {
    unauthorized("Missing x-dev-user-email header.");
  }

  return {
    email,
    name: getHeader(request, "x-dev-user-name")
  };
}

export async function upsertCurrentUser(db: ApiDatabase, request: FastifyRequest) {
  const user = await requireAuthenticatedUser(request);

  return db.user.upsert({
    where: {
      email: user.email
    },
    create: user,
    update: {
      name: user.name
    }
  });
}

function getHeader(request: FastifyRequest, name: string): string | null {
  const value = request.headers[name];

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}
