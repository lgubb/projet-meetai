import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { upsertCurrentUser } from "../auth.js";

const createOrganizationBodySchema = z
  .object({
    name: z.string().min(1)
  })
  .strict();

export function registerOrganizationRoutes(server: FastifyInstance): void {
  server.get("/organizations", async (request) => {
    const user = await upsertCurrentUser(server.db, request);
    const organizations = await server.db.organization.findMany({
      where: {
        members: {
          some: {
            userId: user.id
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return {
      organizations: organizations.map(serializeOrganization)
    };
  });

  server.post("/organizations", async (request, reply) => {
    const body = createOrganizationBodySchema.parse(request.body);
    const user = await upsertCurrentUser(server.db, request);
    const organization = await server.db.organization.create({
      data: {
        name: body.name,
        members: {
          create: {
            userId: user.id,
            role: "OWNER"
          }
        }
      }
    });

    return reply.code(201).send({
      organization: serializeOrganization(organization)
    });
  });
}

function serializeOrganization(organization: { id: string; name: string; createdAt: Date; updatedAt: Date }) {
  return {
    id: organization.id,
    name: organization.name,
    createdAt: organization.createdAt.toISOString(),
    updatedAt: organization.updatedAt.toISOString()
  };
}
