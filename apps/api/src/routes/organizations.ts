import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { upsertCurrentUser } from "../auth.js";
import { HttpError, forbidden, notFound } from "../errors.js";

const createOrganizationBodySchema = z
  .object({
    name: z.string().min(1)
  })
  .strict();

const organizationParamsSchema = z
  .object({
    organizationId: z.string().min(1)
  })
  .strict();

const organizationMemberParamsSchema = z
  .object({
    organizationId: z.string().min(1),
    userId: z.string().min(1)
  })
  .strict();

const updateOrganizationMemberRoleBodySchema = z
  .object({
    role: z.enum(["OWNER", "ADMIN", "MEMBER"])
  })
  .strict();

const joinBillingWaitlistBodySchema = z
  .object({
    note: z.string().max(1000).optional()
  })
  .strict();

const createProviderCostBodySchema = z
  .object({
    provider: z.string().trim().min(1).max(80),
    amountCents: z.number().int().positive().max(100_000_000),
    currency: z
      .string()
      .trim()
      .length(3)
      .transform((currency) => currency.toUpperCase())
      .refine((currency) => /^[A-Z]{3}$/.test(currency), "Currency must be a 3-letter code."),
    periodStart: z.string().datetime(),
    periodEnd: z.string().datetime(),
    sourceUrl: z.string().url().max(2000).optional(),
    note: z.string().max(1000).optional()
  })
  .strict()
  .refine((body) => new Date(body.periodEnd).getTime() >= new Date(body.periodStart).getTime(), {
    message: "periodEnd must be after periodStart.",
    path: ["periodEnd"]
  });

const providerCostsQuerySchema = z
  .object({
    reportingCurrency: currencySchema().optional()
  })
  .strict();

const createProviderExchangeRateBodySchema = z
  .object({
    sourceCurrency: currencySchema(),
    reportingCurrency: currencySchema(),
    rateBps: z.number().int().positive().max(100_000_000),
    effectiveAt: z.string().datetime(),
    sourceUrl: z.string().url().max(2000).optional(),
    note: z.string().max(1000).optional()
  })
  .strict()
  .refine((body) => body.sourceCurrency !== body.reportingCurrency, {
    message: "sourceCurrency and reportingCurrency must be different.",
    path: ["reportingCurrency"]
  });

const fetchProviderExchangeRateBodySchema = z
  .object({
    sourceCurrency: currencySchema(),
    reportingCurrency: currencySchema(),
    effectiveAt: z.string().datetime()
  })
  .strict()
  .refine((body) => body.sourceCurrency !== body.reportingCurrency, {
    message: "sourceCurrency and reportingCurrency must be different.",
    path: ["reportingCurrency"]
  });

const frankfurterRateSchema = z
  .object({
    rate: z.number().positive(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
  });

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

  server.get("/organizations/:organizationId/members", async (request) => {
    const params = organizationParamsSchema.parse(request.params);
    const user = await upsertCurrentUser(server.db, request);

    await requireOrganizationMember(server, params.organizationId, user.id);

    const members = await server.db.organizationMember.findMany({
      where: {
        organizationId: params.organizationId
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return {
      members: members.map(serializeOrganizationMember)
    };
  });

  server.patch("/organizations/:organizationId/members/:userId", async (request) => {
    const params = organizationMemberParamsSchema.parse(request.params);
    const body = updateOrganizationMemberRoleBodySchema.parse(request.body);
    const user = await upsertCurrentUser(server.db, request);

    await requireOrganizationOwner(server, params.organizationId, user.id);

    const members = await server.db.organizationMember.findMany({
      where: {
        organizationId: params.organizationId
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      },
      orderBy: {
        createdAt: "asc"
      }
    });
    const member = members.find((candidate) => candidate.userId === params.userId);

    if (!member) {
      notFound("Organization member not found.");
    }

    if (member.role === "OWNER" && body.role !== "OWNER" && members.filter((candidate) => candidate.role === "OWNER").length <= 1) {
      throw new HttpError(409, "Cannot change the last organization owner.");
    }

    const updatedMember = await server.db.organizationMember.update({
      where: {
        organizationId_userId: {
          organizationId: params.organizationId,
          userId: params.userId
        }
      },
      data: {
        role: body.role
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      }
    });

    return {
      member: serializeOrganizationMember(updatedMember)
    };
  });

  server.get("/organizations/:organizationId/billing-waitlist", async (request) => {
    const params = organizationParamsSchema.parse(request.params);
    const user = await upsertCurrentUser(server.db, request);

    await requireOrganizationMember(server, params.organizationId, user.id);

    const entries = await server.db.billingWaitlistEntry.findMany({
      where: {
        organizationId: params.organizationId
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return {
      entries: entries.map(serializeBillingWaitlistEntry)
    };
  });

  server.post("/organizations/:organizationId/billing-waitlist", async (request, reply) => {
    const params = organizationParamsSchema.parse(request.params);
    const body = joinBillingWaitlistBodySchema.parse(request.body ?? {});
    const user = await upsertCurrentUser(server.db, request);

    await requireOrganizationMember(server, params.organizationId, user.id);

    const entry = await server.db.billingWaitlistEntry.upsert({
      where: {
        organizationId_email: {
          organizationId: params.organizationId,
          email: user.email
        }
      },
      create: {
        organizationId: params.organizationId,
        createdByUserId: user.id,
        email: user.email,
        name: user.name,
        note: body.note ?? null
      },
      update: {
        name: user.name,
        note: body.note ?? null
      }
    });

    return reply.code(201).send({
      entry: serializeBillingWaitlistEntry(entry)
    });
  });

  server.get("/organizations/:organizationId/provider-costs", async (request) => {
    const params = organizationParamsSchema.parse(request.params);
    const query = providerCostsQuerySchema.parse(request.query);
    const user = await upsertCurrentUser(server.db, request);

    await requireOrganizationMember(server, params.organizationId, user.id);

    const entries = await server.db.providerCostEntry.findMany({
      where: {
        organizationId: params.organizationId
      },
      orderBy: {
        periodStart: "desc"
      }
    });
    const exchangeRates = query.reportingCurrency
      ? await server.db.providerExchangeRate.findMany({
          where: {
            organizationId: params.organizationId,
            reportingCurrency: query.reportingCurrency
          },
          orderBy: {
            effectiveAt: "desc"
          }
        })
      : [];

    return {
      entries: entries.map(serializeProviderCostEntry),
      summary: summarizeProviderCosts(entries),
      ...(query.reportingCurrency
        ? { convertedSummary: summarizeConvertedProviderCosts(entries, exchangeRates, query.reportingCurrency) }
        : {})
    };
  });

  server.post("/organizations/:organizationId/provider-costs", async (request, reply) => {
    const params = organizationParamsSchema.parse(request.params);
    const body = createProviderCostBodySchema.parse(request.body);
    const user = await upsertCurrentUser(server.db, request);

    await requireOrganizationMember(server, params.organizationId, user.id);

    const entry = await server.db.providerCostEntry.create({
      data: {
        organizationId: params.organizationId,
        createdByUserId: user.id,
        provider: body.provider,
        amountCents: body.amountCents,
        currency: body.currency,
        periodStart: new Date(body.periodStart),
        periodEnd: new Date(body.periodEnd),
        sourceUrl: body.sourceUrl ?? null,
        note: body.note ?? null
      }
    });

    return reply.code(201).send({
      entry: serializeProviderCostEntry(entry)
    });
  });

  server.get("/organizations/:organizationId/provider-exchange-rates", async (request) => {
    const params = organizationParamsSchema.parse(request.params);
    const user = await upsertCurrentUser(server.db, request);

    await requireOrganizationMember(server, params.organizationId, user.id);

    const rates = await server.db.providerExchangeRate.findMany({
      where: {
        organizationId: params.organizationId
      },
      orderBy: {
        effectiveAt: "desc"
      }
    });

    return {
      rates: rates.map(serializeProviderExchangeRate)
    };
  });

  server.post("/organizations/:organizationId/provider-exchange-rates", async (request, reply) => {
    const params = organizationParamsSchema.parse(request.params);
    const body = createProviderExchangeRateBodySchema.parse(request.body);
    const user = await upsertCurrentUser(server.db, request);

    await requireOrganizationMember(server, params.organizationId, user.id);

    const rate = await server.db.providerExchangeRate.create({
      data: {
        organizationId: params.organizationId,
        sourceCurrency: body.sourceCurrency,
        reportingCurrency: body.reportingCurrency,
        rateBps: body.rateBps,
        effectiveAt: new Date(body.effectiveAt),
        sourceUrl: body.sourceUrl ?? null,
        note: body.note ?? null
      }
    });

    return reply.code(201).send({
      rate: serializeProviderExchangeRate(rate)
    });
  });

  server.post("/organizations/:organizationId/provider-exchange-rates/fetch", async (request, reply) => {
    const params = organizationParamsSchema.parse(request.params);
    const body = fetchProviderExchangeRateBodySchema.parse(request.body);
    const user = await upsertCurrentUser(server.db, request);

    await requireOrganizationMember(server, params.organizationId, user.id);

    const requestedEffectiveAt = new Date(body.effectiveAt);
    const sourceUrl = buildFrankfurterRateUrl(body.sourceCurrency, body.reportingCurrency, requestedEffectiveAt);
    const fetchedRate = await fetchFrankfurterRate(sourceUrl);
    const rate = await server.db.providerExchangeRate.create({
      data: {
        organizationId: params.organizationId,
        sourceCurrency: body.sourceCurrency,
        reportingCurrency: body.reportingCurrency,
        rateBps: toProviderRateBps(fetchedRate.rate),
        effectiveAt: fetchedRate.effectiveAt ?? requestedEffectiveAt,
        sourceUrl,
        note: "Fetched from Frankfurter ECB."
      }
    });

    return reply.code(201).send({
      rate: serializeProviderExchangeRate(rate)
    });
  });
}

function currencySchema() {
  return z
    .string()
    .trim()
    .length(3)
    .transform((currency) => currency.toUpperCase())
    .refine((currency) => /^[A-Z]{3}$/.test(currency), "Currency must be a 3-letter code.");
}

function serializeOrganization(organization: { id: string; name: string; createdAt: Date; updatedAt: Date }) {
  return {
    id: organization.id,
    name: organization.name,
    createdAt: organization.createdAt.toISOString(),
    updatedAt: organization.updatedAt.toISOString()
  };
}

function serializeBillingWaitlistEntry(entry: {
  id: string;
  organizationId: string;
  createdByUserId: string;
  email: string;
  name: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: entry.id,
    organizationId: entry.organizationId,
    createdByUserId: entry.createdByUserId,
    email: entry.email,
    name: entry.name,
    note: entry.note,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString()
  };
}

function serializeOrganizationMember(member: {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
}) {
  return {
    id: member.id,
    organizationId: member.organizationId,
    userId: member.userId,
    userEmail: member.user.email,
    userName: member.user.name,
    role: member.role,
    createdAt: member.createdAt.toISOString(),
    updatedAt: member.updatedAt.toISOString()
  };
}

function serializeProviderCostEntry(entry: {
  id: string;
  organizationId: string;
  createdByUserId: string;
  provider: string;
  amountCents: number;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
  sourceUrl: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: entry.id,
    organizationId: entry.organizationId,
    createdByUserId: entry.createdByUserId,
    provider: entry.provider,
    amountCents: entry.amountCents,
    currency: entry.currency,
    periodStart: entry.periodStart.toISOString(),
    periodEnd: entry.periodEnd.toISOString(),
    sourceUrl: entry.sourceUrl,
    note: entry.note,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString()
  };
}

function serializeProviderExchangeRate(rate: {
  id: string;
  organizationId: string;
  sourceCurrency: string;
  reportingCurrency: string;
  rateBps: number;
  effectiveAt: Date;
  sourceUrl: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: rate.id,
    organizationId: rate.organizationId,
    sourceCurrency: rate.sourceCurrency,
    reportingCurrency: rate.reportingCurrency,
    rateBps: rate.rateBps,
    effectiveAt: rate.effectiveAt.toISOString(),
    sourceUrl: rate.sourceUrl,
    note: rate.note,
    createdAt: rate.createdAt.toISOString(),
    updatedAt: rate.updatedAt.toISOString()
  };
}

function summarizeProviderCosts(entries: Array<{ currency: string; amountCents: number }>) {
  const totalsByCurrency = new Map<string, { currency: string; totalAmountCents: number; entryCount: number }>();

  for (const entry of entries) {
    const current = totalsByCurrency.get(entry.currency) ?? {
      currency: entry.currency,
      totalAmountCents: 0,
      entryCount: 0
    };

    current.totalAmountCents += entry.amountCents;
    current.entryCount += 1;
    totalsByCurrency.set(entry.currency, current);
  }

  return [...totalsByCurrency.values()].sort((left, right) => left.currency.localeCompare(right.currency));
}

function summarizeConvertedProviderCosts(
  entries: Array<{ amountCents: number; currency: string; periodEnd: Date }>,
  exchangeRates: Array<{
    sourceCurrency: string;
    reportingCurrency: string;
    rateBps: number;
    effectiveAt: Date;
  }>,
  reportingCurrency: string
) {
  let totalAmountCents = 0;
  let convertedEntryCount = 0;
  let missingRateEntryCount = 0;
  const missingCurrencies = new Set<string>();

  for (const entry of entries) {
    const rate = findProviderExchangeRate(exchangeRates, entry.currency, reportingCurrency, entry.periodEnd);

    if (!rate) {
      missingRateEntryCount += 1;
      missingCurrencies.add(entry.currency);
      continue;
    }

    totalAmountCents += convertAmountCents(entry.amountCents, rate.rateBps);
    convertedEntryCount += 1;
  }

  return {
    reportingCurrency,
    totalAmountCents,
    convertedEntryCount,
    missingRateEntryCount,
    missingCurrencies: [...missingCurrencies].sort()
  };
}

function findProviderExchangeRate(
  exchangeRates: Array<{
    sourceCurrency: string;
    reportingCurrency: string;
    rateBps: number;
    effectiveAt: Date;
  }>,
  sourceCurrency: string,
  reportingCurrency: string,
  effectiveAt: Date
) {
  if (sourceCurrency === reportingCurrency) {
    return {
      sourceCurrency,
      reportingCurrency,
      rateBps: 10_000,
      effectiveAt
    };
  }

  return exchangeRates.find(
    (rate) =>
      rate.sourceCurrency === sourceCurrency &&
      rate.reportingCurrency === reportingCurrency &&
      rate.effectiveAt.getTime() <= effectiveAt.getTime()
  );
}

function convertAmountCents(amountCents: number, rateBps: number): number {
  return Number((BigInt(amountCents) * BigInt(rateBps) + 5_000n) / 10_000n);
}

function buildFrankfurterRateUrl(sourceCurrency: string, reportingCurrency: string, effectiveAt: Date): string {
  const url = new URL(`https://api.frankfurter.dev/v2/rate/${sourceCurrency}/${reportingCurrency}`);

  url.searchParams.set("date", effectiveAt.toISOString().slice(0, 10));
  url.searchParams.set("providers", "ECB");

  return url.toString();
}

async function fetchFrankfurterRate(sourceUrl: string): Promise<{ rate: number; effectiveAt: Date | null }> {
  const response = await fetch(sourceUrl, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new HttpError(502, "FX provider request failed.");
  }

  const payload = frankfurterRateSchema.parse(await response.json());

  return {
    rate: payload.rate,
    effectiveAt: payload.date ? new Date(`${payload.date}T00:00:00.000Z`) : null
  };
}

function toProviderRateBps(rate: number): number {
  const rateBps = Math.round(rate * 10_000);

  if (rateBps <= 0 || rateBps > 100_000_000) {
    throw new HttpError(502, "FX provider returned an unsupported rate.");
  }

  return rateBps;
}

async function requireOrganizationMember(server: FastifyInstance, organizationId: string, userId: string): Promise<void> {
  const membership = await server.db.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId
      }
    }
  });

  if (!membership) {
    forbidden("Organization access required.");
  }
}

async function requireOrganizationOwner(server: FastifyInstance, organizationId: string, userId: string): Promise<void> {
  const membership = await server.db.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId
      }
    }
  });

  if (membership?.role !== "OWNER") {
    forbidden("Organization owner role required.");
  }
}
