import assert from "node:assert/strict";
import test from "node:test";

import type { ApiDatabase } from "./db.js";
import { createE2BConnector, type SandboxProvider } from "./e2b-connector.js";
import type { LiveKitTokenIssuer, LiveKitTokenRequest } from "./livekit.js";
import { buildServer } from "./server.js";

type FakeUser = {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type FakeOrganization = {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

type FakeOrganizationMember = {
  id: string;
  organizationId: string;
  userId: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  createdAt: Date;
  updatedAt: Date;
};

type FakeOrganizationPolicyRuleOverride = {
  id: string;
  organizationId: string;
  ruleId: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type FakeBillingWaitlistEntry = {
  id: string;
  organizationId: string;
  createdByUserId: string;
  email: string;
  name: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type FakeProviderCostEntry = {
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
};

type FakeProviderExchangeRate = {
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
};

type FakeRoom = {
  id: string;
  organizationId: string;
  createdByUserId: string;
  title: string;
  status: "CREATED" | "LIVE" | "ENDED" | "ARCHIVED";
  createdAt: Date;
  updatedAt: Date;
  endedAt: Date | null;
};

type FakeRoomParticipant = {
  id: string;
  roomId: string;
  userId: string | null;
  agentId: string | null;
  role: "HOST" | "MEMBER" | "GUEST" | "OBSERVER" | "AGENT";
  joinedAt: Date;
  leftAt: Date | null;
};

type FakeTranscriptSegment = {
  id: string;
  roomId: string;
  speakerUserId: string | null;
  speakerAgentId: string | null;
  text: string;
  startedAt: Date;
  endedAt: Date | null;
  createdAt: Date;
};

type FakeAgent = {
  id: string;
  organizationId: string;
  name: string;
  provider: "NATIVE" | "MCP" | "CODEX" | "CLAUDE_CODE" | "LOVABLE" | "V0" | "PERPLEXITY" | "E2B" | "CUSTOM";
  capabilities: Array<"ORCHESTRATION" | "RESEARCH" | "CODE_GENERATION" | "PROTOTYPING" | "TASK_PLANNING" | "ARTIFACT_GENERATION">;
  createdAt: Date;
  updatedAt: Date;
};

type FakeAgentConnection = {
  id: string;
  agentId: string;
  transport: "IN_PROCESS" | "HTTP" | "STDIO";
  endpoint: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type FakeAgentRun = {
  id: string;
  roomId: string;
  taskId: string | null;
  agentId: string;
  ownerUserId: string | null;
  status: "PENDING" | "RUNNING" | "WAITING_FOR_APPROVAL" | "COMPLETED" | "FAILED" | "CANCELED";
  startedAt: Date;
  finishedAt: Date | null;
  summary: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

type FakeAgentRunEvent = {
  id: string;
  roomId: string;
  taskId: string | null;
  artifactId: string | null;
  runId: string;
  agentId: string;
  ownerUserId: string | null;
  type: string;
  severity: string;
  visibility: string;
  payload: Record<string, unknown> | null;
  createdAt: Date;
};

type FakeRoomComment = {
  id: string;
  roomId: string;
  artifactId: string | null;
  artifactFileId: string | null;
  agentRunEventId: string | null;
  createdByUserId: string | null;
  lineNumber: number | null;
  body: string;
  createdAt: Date;
  updatedAt: Date;
};

type FakeLocalAgentPairingCode = {
  id: string;
  roomId: string;
  createdByUserId: string;
  agentId: string | null;
  codeHash: string;
  status: "PENDING" | "CONSUMED" | "CODEX_AUTH_ERROR" | "BRIDGE_ERROR" | "EXPIRED";
  errorMessage: string | null;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type FakeTask = {
  id: string;
  roomId: string;
  createdByUserId: string | null;
  createdByAgentId: string | null;
  assignedAgentId: string | null;
  title: string;
  description: string | null;
  status: "PENDING" | "RUNNING" | "WAITING_FOR_APPROVAL" | "COMPLETED" | "FAILED" | "CANCELED";
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
};

type FakeTaskEvent = {
  id: string;
  roomId: string;
  taskId: string;
  type: string;
  payload: Record<string, unknown> | null;
  occurredAt: Date;
};

type FakeArtifact = {
  id: string;
  roomId: string;
  taskId: string | null;
  createdByUserId: string | null;
  createdByAgentId: string | null;
  type: "DOCUMENT" | "CODE" | "RESEARCH" | "DIAGRAM" | "PREVIEW" | "LOG";
  status: "DRAFT" | "GENERATING" | "READY" | "FAILED" | "ARCHIVED";
  title: string;
  createdAt: Date;
  updatedAt: Date;
};

type FakeArtifactVersion = {
  id: string;
  artifactId: string;
  createdByUserId: string | null;
  createdByAgentId: string | null;
  version: number;
  content: Record<string, unknown>;
  createdAt: Date;
};

type FakeArtifactFile = {
  id: string;
  roomId: string;
  taskId: string | null;
  artifactId: string;
  path: string;
  type: string;
  language: string | null;
  size: number;
  contentHash: string;
  latestVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type FakeArtifactFileVersion = {
  id: string;
  artifactFileId: string;
  artifactVersionId: string | null;
  runId: string | null;
  version: number;
  content: string;
  contentHash: string;
  size: number;
  createdAt: Date;
};

type FakeArtifactFileDiff = {
  id: string;
  oldVersionId: string | null;
  newVersionId: string;
  unifiedDiff: string;
  createdAt: Date;
};

type FakeSandboxSession = {
  id: string;
  roomId: string;
  taskId: string | null;
  createdByAgentId: string | null;
  provider: "LOCAL_MOCK" | "E2B" | "VERCEL" | "CUSTOM";
  status: "CREATED" | "READY" | "RUNNING" | "STOPPED" | "FAILED";
  workdir: string;
  previewUrl: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

type FakeApproval = {
  id: string;
  roomId: string;
  taskId: string | null;
  artifactId: string | null;
  requestedByUserId: string | null;
  requestedByAgentId: string | null;
  decidedByUserId: string | null;
  title: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELED";
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  createdAt: Date;
  decidedAt: Date | null;
};

type FakeAuditLog = {
  id: string;
  organizationId: string | null;
  roomId: string | null;
  actorUserId: string | null;
  actorAgentId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: Date;
};

type FakeAgentToolCall = {
  id: string;
  roomId: string;
  taskId: string | null;
  artifactId: string | null;
  approvalId: string | null;
  agentId: string;
  toolName: string;
  status: "RUNNING" | "SUCCEEDED" | "FAILED" | "BLOCKED";
  arguments: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  errorCode: number | null;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
  createdAt: Date;
  updatedAt: Date;
};

type FakeApiDatabase = ApiDatabase & {
  agentConnectionRecords: FakeAgentConnection[];
  agentRunEventRecords: FakeAgentRunEvent[];
  agentRunRecords: FakeAgentRun[];
  agentToolCallRecords: FakeAgentToolCall[];
  agentRecords: FakeAgent[];
  localAgentPairingCodeRecords: FakeLocalAgentPairingCode[];
  approvalRecords: FakeApproval[];
  auditLogRecords: FakeAuditLog[];
  artifactFileDiffRecords: FakeArtifactFileDiff[];
  artifactFileRecords: FakeArtifactFile[];
  artifactFileVersionRecords: FakeArtifactFileVersion[];
  artifactRecords: FakeArtifact[];
  artifactVersionRecords: FakeArtifactVersion[];
  billingWaitlistEntryRecords: FakeBillingWaitlistEntry[];
  organizationPolicyRuleOverrideRecords: FakeOrganizationPolicyRuleOverride[];
  providerCostEntryRecords: FakeProviderCostEntry[];
  providerExchangeRateRecords: FakeProviderExchangeRate[];
  roomCommentRecords: FakeRoomComment[];
  roomParticipantRecords: FakeRoomParticipant[];
  sandboxSessionRecords: FakeSandboxSession[];
  taskEventRecords: FakeTaskEvent[];
  taskRecords: FakeTask[];
  transcriptSegmentRecords: FakeTranscriptSegment[];
};

test("organization and room routes require auth", async () => {
  const server = buildServer({
    db: createFakeDb(),
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false
  });

  const response = await server.inject({
    method: "GET",
    url: "/organizations"
  });

  assert.equal(response.statusCode, 401);

  await server.close();
});

test("organization and room routes support a minimal phase 1 flow", async () => {
  const server = buildServer({
    db: createFakeDb(),
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false
  });

  const ownerHeaders = {
    "x-dev-user-email": "owner@example.com",
    "x-dev-user-name": "Owner"
  };

  const organizationResponse = await server.inject({
    method: "POST",
    url: "/organizations",
    headers: ownerHeaders,
    payload: {
      name: "Acme"
    }
  });

  assert.equal(organizationResponse.statusCode, 201);
  const organizationBody = organizationResponse.json<{ organization: { id: string; name: string } }>();
  assert.equal(organizationBody.organization.name, "Acme");

  const roomResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/rooms`,
    headers: ownerHeaders,
    payload: {
      title: "Planning"
    }
  });

  assert.equal(roomResponse.statusCode, 201);
  const roomBody = roomResponse.json<{ room: { id: string; title: string } }>();
  assert.equal(roomBody.room.title, "Planning");

  const ownerRoomResponse = await server.inject({
    method: "GET",
    url: `/rooms/${roomBody.room.id}`,
    headers: ownerHeaders
  });

  assert.equal(ownerRoomResponse.statusCode, 200);
  const ownerRoomBody = ownerRoomResponse.json<{
    participants: Array<{ role: string; userEmail: string | null; userName: string | null }>;
  }>();
  assert.deepEqual(
    ownerRoomBody.participants.map((participant) => participant.role),
    ["HOST"]
  );
  assert.deepEqual(
    ownerRoomBody.participants.map((participant) => [participant.userName, participant.userEmail]),
    [["Owner", "owner@example.com"]]
  );

  const memberJoinResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/join`,
    headers: {
      "x-dev-user-email": "member@example.com",
      "x-dev-user-name": "Member"
    }
  });

  assert.equal(memberJoinResponse.statusCode, 201);
  const memberJoinBody = memberJoinResponse.json<{ participant: { role: string } }>();
  assert.equal(memberJoinBody.participant.role, "MEMBER");

  const membersResponse = await server.inject({
    method: "GET",
    url: `/organizations/${organizationBody.organization.id}/members`,
    headers: ownerHeaders
  });

  assert.equal(membersResponse.statusCode, 200);
  const membersBody = membersResponse.json<{
    members: Array<{ userId: string; userEmail: string; userName: string | null; role: string }>;
  }>();
  assert.deepEqual(
    membersBody.members.map((member) => [member.userEmail, member.userName, member.role]),
    [
      ["owner@example.com", "Owner", "OWNER"],
      ["member@example.com", "Member", "MEMBER"]
    ]
  );
  const ownerMember = membersBody.members.find((member) => member.userEmail === "owner@example.com");
  const roomMember = membersBody.members.find((member) => member.userEmail === "member@example.com");
  assert.ok(ownerMember);
  assert.ok(roomMember);

  const lastOwnerDemotionResponse = await server.inject({
    method: "PATCH",
    url: `/organizations/${organizationBody.organization.id}/members/${ownerMember.userId}`,
    headers: ownerHeaders,
    payload: {
      role: "ADMIN"
    }
  });
  assert.equal(lastOwnerDemotionResponse.statusCode, 409);

  const promoteMemberResponse = await server.inject({
    method: "PATCH",
    url: `/organizations/${organizationBody.organization.id}/members/${roomMember.userId}`,
    headers: ownerHeaders,
    payload: {
      role: "ADMIN"
    }
  });
  assert.equal(promoteMemberResponse.statusCode, 200);
  assert.equal(promoteMemberResponse.json<{ member: { role: string } }>().member.role, "ADMIN");

  const adminRoleChangeResponse = await server.inject({
    method: "PATCH",
    url: `/organizations/${organizationBody.organization.id}/members/${roomMember.userId}`,
    headers: {
      "x-dev-user-email": "member@example.com",
      "x-dev-user-name": "Member"
    },
    payload: {
      role: "MEMBER"
    }
  });
  assert.equal(adminRoleChangeResponse.statusCode, 403);

  const updateRoomResponse = await server.inject({
    method: "PATCH",
    url: `/rooms/${roomBody.room.id}`,
    headers: ownerHeaders,
    payload: {
      title: "Renamed planning"
    }
  });

  assert.equal(updateRoomResponse.statusCode, 200);
  const updateRoomBody = updateRoomResponse.json<{ room: { title: string } }>();
  assert.equal(updateRoomBody.room.title, "Renamed planning");

  const deleteRoomResponse = await server.inject({
    method: "DELETE",
    url: `/rooms/${roomBody.room.id}`,
    headers: ownerHeaders
  });

  assert.equal(deleteRoomResponse.statusCode, 204);

  const deletedRoomResponse = await server.inject({
    method: "GET",
    url: `/rooms/${roomBody.room.id}`,
    headers: ownerHeaders
  });

  assert.equal(deletedRoomResponse.statusCode, 404);

  await server.close();
});

test("organization billing waitlist stores one entry per user email", async () => {
  const db = createFakeDb();
  const server = buildServer({
    db,
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false
  });

  const ownerHeaders = {
    "x-dev-user-email": "owner@example.com",
    "x-dev-user-name": "Owner"
  };

  const organizationResponse = await server.inject({
    method: "POST",
    url: "/organizations",
    headers: ownerHeaders,
    payload: {
      name: "Acme"
    }
  });
  const organizationBody = organizationResponse.json<{ organization: { id: string } }>();

  const emptyListResponse = await server.inject({
    method: "GET",
    url: `/organizations/${organizationBody.organization.id}/billing-waitlist`,
    headers: ownerHeaders
  });

  assert.equal(emptyListResponse.statusCode, 200);
  assert.deepEqual(emptyListResponse.json<{ entries: unknown[] }>().entries, []);

  const joinResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/billing-waitlist`,
    headers: ownerHeaders,
    payload: {
      note: "Need invoice billing"
    }
  });

  assert.equal(joinResponse.statusCode, 201);
  const joinBody = joinResponse.json<{ entry: { email: string; name: string | null; note: string | null } }>();
  assert.equal(joinBody.entry.email, "owner@example.com");
  assert.equal(joinBody.entry.name, "Owner");
  assert.equal(joinBody.entry.note, "Need invoice billing");
  assert.equal(db.billingWaitlistEntryRecords.length, 1);

  const updateResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/billing-waitlist`,
    headers: ownerHeaders,
    payload: {
      note: "Need annual invoice"
    }
  });

  assert.equal(updateResponse.statusCode, 201);
  assert.equal(db.billingWaitlistEntryRecords.length, 1);
  assert.equal(updateResponse.json<{ entry: { note: string | null } }>().entry.note, "Need annual invoice");

  const listResponse = await server.inject({
    method: "GET",
    url: `/organizations/${organizationBody.organization.id}/billing-waitlist`,
    headers: ownerHeaders
  });

  assert.equal(listResponse.statusCode, 200);
  const listBody = listResponse.json<{ entries: Array<{ email: string; note: string | null }> }>();
  assert.deepEqual(
    listBody.entries.map((entry) => [entry.email, entry.note]),
    [["owner@example.com", "Need annual invoice"]]
  );

  await server.close();
});

test("organization provider costs store real manual cost entries", async () => {
  const db = createFakeDb();
  const server = buildServer({
    db,
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false
  });

  const ownerHeaders = {
    "x-dev-user-email": "owner@example.com",
    "x-dev-user-name": "Owner"
  };

  const organizationResponse = await server.inject({
    method: "POST",
    url: "/organizations",
    headers: ownerHeaders,
    payload: {
      name: "Acme"
    }
  });
  const organizationBody = organizationResponse.json<{ organization: { id: string } }>();

  const emptyCostsResponse = await server.inject({
    method: "GET",
    url: `/organizations/${organizationBody.organization.id}/provider-costs`,
    headers: ownerHeaders
  });

  assert.equal(emptyCostsResponse.statusCode, 200);
  assert.deepEqual(emptyCostsResponse.json<{ entries: unknown[]; summary: unknown[] }>(), {
    entries: [],
    summary: []
  });

  const emptyRatesResponse = await server.inject({
    method: "GET",
    url: `/organizations/${organizationBody.organization.id}/provider-exchange-rates`,
    headers: ownerHeaders
  });

  assert.equal(emptyRatesResponse.statusCode, 200);
  assert.deepEqual(emptyRatesResponse.json<{ rates: unknown[] }>(), {
    rates: []
  });

  const invalidPeriodResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/provider-costs`,
    headers: ownerHeaders,
    payload: {
      provider: "OpenAI",
      amountCents: 1200,
      currency: "usd",
      periodStart: "2026-06-30T00:00:00.000Z",
      periodEnd: "2026-06-01T00:00:00.000Z"
    }
  });

  assert.equal(invalidPeriodResponse.statusCode, 400);

  const createCostResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/provider-costs`,
    headers: ownerHeaders,
    payload: {
      provider: "OpenAI",
      amountCents: 12345,
      currency: "usd",
      periodStart: "2026-06-01T00:00:00.000Z",
      periodEnd: "2026-06-30T23:59:59.999Z",
      sourceUrl: "https://billing.example/invoice-1",
      note: "June invoice"
    }
  });

  assert.equal(createCostResponse.statusCode, 201);
  const createCostBody = createCostResponse.json<{
    entry: {
      provider: string;
      amountCents: number;
      currency: string;
      sourceUrl: string | null;
      note: string | null;
      createdByUserId: string;
    };
  }>();
  assert.equal(createCostBody.entry.provider, "OpenAI");
  assert.equal(createCostBody.entry.amountCents, 12345);
  assert.equal(createCostBody.entry.currency, "USD");
  assert.equal(createCostBody.entry.sourceUrl, "https://billing.example/invoice-1");
  assert.equal(createCostBody.entry.note, "June invoice");
  assert.equal(createCostBody.entry.createdByUserId, "user-1");
  assert.equal(db.providerCostEntryRecords.length, 1);

  const createSecondCostResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/provider-costs`,
    headers: ownerHeaders,
    payload: {
      provider: "LiveKit",
      amountCents: 2500,
      currency: "USD",
      periodStart: "2026-06-01T00:00:00.000Z",
      periodEnd: "2026-06-30T23:59:59.999Z"
    }
  });

  assert.equal(createSecondCostResponse.statusCode, 201);

  const createEuroCostResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/provider-costs`,
    headers: ownerHeaders,
    payload: {
      provider: "Mistral",
      amountCents: 10000,
      currency: "EUR",
      periodStart: "2026-06-01T00:00:00.000Z",
      periodEnd: "2026-06-30T23:59:59.999Z"
    }
  });

  assert.equal(createEuroCostResponse.statusCode, 201);

  const invalidRateResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/provider-exchange-rates`,
    headers: ownerHeaders,
    payload: {
      sourceCurrency: "EUR",
      reportingCurrency: "EUR",
      rateBps: 10000,
      effectiveAt: "2026-06-01T00:00:00.000Z"
    }
  });

  assert.equal(invalidRateResponse.statusCode, 400);

  const createRateResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/provider-exchange-rates`,
    headers: ownerHeaders,
    payload: {
      sourceCurrency: "eur",
      reportingCurrency: "usd",
      rateBps: 11000,
      effectiveAt: "2026-06-01T00:00:00.000Z",
      sourceUrl: "https://billing.example/fx-june",
      note: "June invoice FX"
    }
  });

  assert.equal(createRateResponse.statusCode, 201);
  const createRateBody = createRateResponse.json<{
    rate: {
      sourceCurrency: string;
      reportingCurrency: string;
      rateBps: number;
      effectiveAt: string;
      sourceUrl: string | null;
      note: string | null;
    };
  }>();
  assert.equal(createRateBody.rate.sourceCurrency, "EUR");
  assert.equal(createRateBody.rate.reportingCurrency, "USD");
  assert.equal(createRateBody.rate.rateBps, 11000);
  assert.equal(createRateBody.rate.sourceUrl, "https://billing.example/fx-june");
  assert.equal(createRateBody.rate.note, "June invoice FX");
  assert.equal(db.providerExchangeRateRecords.length, 1);

  const listCostsResponse = await server.inject({
    method: "GET",
    url: `/organizations/${organizationBody.organization.id}/provider-costs?reportingCurrency=USD`,
    headers: ownerHeaders
  });

  assert.equal(listCostsResponse.statusCode, 200);
  const listCostsBody = listCostsResponse.json<{
    entries: Array<{ provider: string }>;
    summary: Array<{ currency: string; totalAmountCents: number; entryCount: number }>;
    convertedSummary: {
      reportingCurrency: string;
      totalAmountCents: number;
      convertedEntryCount: number;
      missingRateEntryCount: number;
      missingCurrencies: string[];
    };
  }>();

  assert.deepEqual(
    listCostsBody.entries.map((entry) => entry.provider),
    ["OpenAI", "LiveKit", "Mistral"]
  );
  assert.deepEqual(listCostsBody.summary, [
    {
      currency: "EUR",
      totalAmountCents: 10000,
      entryCount: 1
    },
    {
      currency: "USD",
      totalAmountCents: 14845,
      entryCount: 2
    }
  ]);
  assert.deepEqual(listCostsBody.convertedSummary, {
    reportingCurrency: "USD",
    totalAmountCents: 25845,
    convertedEntryCount: 3,
    missingRateEntryCount: 0,
    missingCurrencies: []
  });

  const missingRateCostsResponse = await server.inject({
    method: "GET",
    url: `/organizations/${organizationBody.organization.id}/provider-costs?reportingCurrency=EUR`,
    headers: ownerHeaders
  });
  const missingRateCostsBody = missingRateCostsResponse.json<{
    convertedSummary: {
      reportingCurrency: string;
      totalAmountCents: number;
      convertedEntryCount: number;
      missingRateEntryCount: number;
      missingCurrencies: string[];
    };
  }>();

  assert.deepEqual(missingRateCostsBody.convertedSummary, {
    reportingCurrency: "EUR",
    totalAmountCents: 10000,
    convertedEntryCount: 1,
    missingRateEntryCount: 2,
    missingCurrencies: ["USD"]
  });

  await server.close();
});

test("organization provider exchange rates can be fetched from Frankfurter ECB", async () => {
  const previousFetch = globalThis.fetch;
  const requestedUrls: string[] = [];
  const db = createFakeDb();
  const server = buildServer({
    db,
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false
  });

  globalThis.fetch = (async (url, init) => {
    requestedUrls.push(String(url));

    assert.equal(new Headers(init?.headers).get("accept"), "application/json");

    return new Response(JSON.stringify({ date: "2026-06-01", rate: 1.1234 }), {
      status: 200,
      headers: {
        "content-type": "application/json"
      }
    });
  }) as typeof fetch;

  try {
    const ownerHeaders = {
      "x-dev-user-email": "owner@example.com",
      "x-dev-user-name": "Owner"
    };

    const organizationResponse = await server.inject({
      method: "POST",
      url: "/organizations",
      headers: ownerHeaders,
      payload: {
        name: "Acme"
      }
    });
    const organizationBody = organizationResponse.json<{ organization: { id: string } }>();

    const createCostResponse = await server.inject({
      method: "POST",
      url: `/organizations/${organizationBody.organization.id}/provider-costs`,
      headers: ownerHeaders,
      payload: {
        provider: "Mistral",
        amountCents: 10000,
        currency: "EUR",
        periodStart: "2026-06-01T00:00:00.000Z",
        periodEnd: "2026-06-30T23:59:59.999Z"
      }
    });

    assert.equal(createCostResponse.statusCode, 201);

    const fetchRateResponse = await server.inject({
      method: "POST",
      url: `/organizations/${organizationBody.organization.id}/provider-exchange-rates/fetch`,
      headers: ownerHeaders,
      payload: {
        sourceCurrency: "eur",
        reportingCurrency: "usd",
        effectiveAt: "2026-06-01T00:00:00.000Z"
      }
    });

    assert.equal(fetchRateResponse.statusCode, 201);
    assert.deepEqual(requestedUrls, ["https://api.frankfurter.dev/v2/rate/EUR/USD?date=2026-06-01&providers=ECB"]);

    const fetchRateBody = fetchRateResponse.json<{
      rate: {
        sourceCurrency: string;
        reportingCurrency: string;
        rateBps: number;
        effectiveAt: string;
        sourceUrl: string | null;
        note: string | null;
      };
    }>();

    assert.equal(fetchRateBody.rate.sourceCurrency, "EUR");
    assert.equal(fetchRateBody.rate.reportingCurrency, "USD");
    assert.equal(fetchRateBody.rate.rateBps, 11234);
    assert.equal(fetchRateBody.rate.effectiveAt, "2026-06-01T00:00:00.000Z");
    assert.equal(fetchRateBody.rate.sourceUrl, requestedUrls[0]);
    assert.equal(fetchRateBody.rate.note, "Fetched from Frankfurter ECB.");
    assert.equal(db.providerExchangeRateRecords.length, 1);

    const listCostsResponse = await server.inject({
      method: "GET",
      url: `/organizations/${organizationBody.organization.id}/provider-costs?reportingCurrency=USD`,
      headers: ownerHeaders
    });

    assert.equal(listCostsResponse.statusCode, 200);
    assert.deepEqual(
      listCostsResponse.json<{
        convertedSummary: {
          reportingCurrency: string;
          totalAmountCents: number;
          convertedEntryCount: number;
          missingRateEntryCount: number;
          missingCurrencies: string[];
        };
      }>().convertedSummary,
      {
        reportingCurrency: "USD",
        totalAmountCents: 11234,
        convertedEntryCount: 1,
        missingRateEntryCount: 0,
        missingCurrencies: []
      }
    );
  } finally {
    globalThis.fetch = previousFetch;
    await server.close();
  }
});

test("room creation can seed starter tasks from templates", async () => {
  const db = createFakeDb();
  const server = buildServer({
    db,
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false
  });

  const ownerHeaders = {
    "x-dev-user-email": "owner@example.com",
    "x-dev-user-name": "Owner"
  };

  const organizationResponse = await server.inject({
    method: "POST",
    url: "/organizations",
    headers: ownerHeaders,
    payload: {
      name: "Acme"
    }
  });
  const organizationBody = organizationResponse.json<{ organization: { id: string } }>();

  const blankRoomResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/rooms`,
    headers: ownerHeaders,
    payload: {
      title: "Blank room",
      templateId: "blank"
    }
  });

  assert.equal(blankRoomResponse.statusCode, 201);
  assert.equal(db.taskRecords.length, 0);
  assert.equal(db.artifactRecords.length, 0);

  const templates = [
    {
      id: "product_jam",
      taskTitle: "Capture product decisions",
      artifactType: "DOCUMENT"
    },
    {
      id: "research_call",
      taskTitle: "Synthesize research call",
      artifactType: "RESEARCH"
    },
    {
      id: "prototype_session",
      taskTitle: "Frame prototype direction",
      artifactType: "PREVIEW"
    }
  ];

  for (const template of templates) {
    const roomResponse = await server.inject({
      method: "POST",
      url: `/organizations/${organizationBody.organization.id}/rooms`,
      headers: ownerHeaders,
      payload: {
        title: template.taskTitle,
        templateId: template.id
      }
    });

    assert.equal(roomResponse.statusCode, 201);
    const roomBody = roomResponse.json<{ room: { id: string } }>();
    const tasksResponse = await server.inject({
      method: "GET",
      url: `/rooms/${roomBody.room.id}/tasks`,
      headers: ownerHeaders
    });

    assert.equal(tasksResponse.statusCode, 200);
    const tasksBody = tasksResponse.json<{
      items: Array<{
        task: { title: string; createdByUserId: string | null };
        artifacts: Array<{ type: string; latestVersion: { content: { sections?: string[] } } | null }>;
      }>;
    }>();

    assert.equal(tasksBody.items.length, 1);
    assert.equal(tasksBody.items[0]?.task.title, template.taskTitle);
    assert.equal(tasksBody.items[0]?.task.createdByUserId, "user-1");
    assert.equal(tasksBody.items[0]?.artifacts[0]?.type, template.artifactType);
    assert.ok(tasksBody.items[0]?.artifacts[0]?.latestVersion?.content.sections?.length);
  }

  assert.deepEqual(
    db.taskRecords.map((task) => task.title),
    templates.map((template) => template.taskTitle)
  );
  assert.deepEqual(
    db.artifactRecords.map((artifact) => artifact.type),
    templates.map((template) => template.artifactType)
  );
  assert.deepEqual(
    db.taskEventRecords.map((event) => event.type),
    [
      "task.created",
      "artifact.created",
      "task.created",
      "artifact.created",
      "task.created",
      "artifact.created"
    ]
  );

  const usageResponse = await server.inject({
    method: "GET",
    url: `/organizations/${organizationBody.organization.id}/usage`,
    headers: ownerHeaders
  });

  assert.equal(usageResponse.statusCode, 200);
  const usageBody = usageResponse.json<{
    usage: {
      rooms: { total: number; created: number };
      tasks: { total: number; pending: number };
      artifacts: { total: number; draft: number; previews: number };
      agents: { total: number };
      approvals: { total: number };
      toolCalls: { total: number };
      limits: {
        rooms: { used: number; limit: number; remaining: number; isOverLimit: boolean };
        tasks: { used: number; limit: number; remaining: number; isOverLimit: boolean };
      };
    };
  }>();

  assert.deepEqual(usageBody.usage.rooms, {
    total: 4,
    created: 4,
    live: 0,
    ended: 0,
    archived: 0
  });
  assert.equal(usageBody.usage.tasks.total, 3);
  assert.equal(usageBody.usage.tasks.pending, 3);
  assert.equal(usageBody.usage.artifacts.total, 3);
  assert.equal(usageBody.usage.artifacts.draft, 3);
  assert.equal(usageBody.usage.artifacts.previews, 1);
  assert.equal(usageBody.usage.agents.total, 0);
  assert.equal(usageBody.usage.approvals.total, 0);
  assert.equal(usageBody.usage.toolCalls.total, 0);
  assert.equal(usageBody.usage.limits.rooms.used, 4);
  assert.equal(
    usageBody.usage.limits.rooms.remaining,
    Math.max(usageBody.usage.limits.rooms.limit - usageBody.usage.limits.rooms.used, 0)
  );
  assert.equal(usageBody.usage.limits.rooms.isOverLimit, usageBody.usage.limits.rooms.used > usageBody.usage.limits.rooms.limit);
  assert.equal(usageBody.usage.limits.tasks.used, 3);
  assert.equal(
    usageBody.usage.limits.tasks.remaining,
    Math.max(usageBody.usage.limits.tasks.limit - usageBody.usage.limits.tasks.used, 0)
  );
  assert.equal(usageBody.usage.limits.tasks.isOverLimit, usageBody.usage.limits.tasks.used > usageBody.usage.limits.tasks.limit);

  const invalidTemplateResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/rooms`,
    headers: ownerHeaders,
    payload: {
      title: "Unknown",
      templateId: "workshop"
    }
  });

  assert.equal(invalidTemplateResponse.statusCode, 400);

  await server.close();
});

test("organization usage exposes provider cost units from persisted activity", async () => {
  const db = createFakeDb();
  const server = buildServer({
    db,
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false
  });
  const ownerHeaders = {
    "x-dev-user-email": "owner@example.com",
    "x-dev-user-name": "Owner"
  };

  const organizationResponse = await server.inject({
    method: "POST",
    url: "/organizations",
    headers: ownerHeaders,
    payload: {
      name: "Acme"
    }
  });
  const organizationBody = organizationResponse.json<{ organization: { id: string } }>();
  const roomResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/rooms`,
    headers: ownerHeaders,
    payload: {
      title: "Cost review"
    }
  });
  const roomBody = roomResponse.json<{ room: { id: string } }>();
  const participant = db.roomParticipantRecords.find((record) => record.roomId === roomBody.room.id && record.userId === "user-1");

  assert.ok(participant);
  participant.joinedAt = new Date("2026-06-01T10:00:00.000Z");
  participant.leftAt = new Date("2026-06-01T10:30:00.000Z");
  db.transcriptSegmentRecords.push({
    id: "transcript-cost-1",
    roomId: roomBody.room.id,
    speakerUserId: "user-1",
    speakerAgentId: null,
    text: "Five minutes of speech.",
    startedAt: new Date("2026-06-01T10:00:00.000Z"),
    endedAt: new Date("2026-06-01T10:05:00.000Z"),
    createdAt: new Date("2026-06-01T10:05:00.000Z")
  });
  db.sandboxSessionRecords.push({
    id: "sandbox-cost-1",
    roomId: roomBody.room.id,
    taskId: null,
    createdByAgentId: null,
    provider: "E2B",
    status: "STOPPED",
    workdir: "/tmp/workroom",
    previewUrl: null,
    metadata: null,
    createdAt: new Date("2026-06-01T10:10:00.000Z"),
    updatedAt: new Date("2026-06-01T10:30:00.000Z")
  });
  db.sandboxSessionRecords.push({
    id: "sandbox-cost-2",
    roomId: roomBody.room.id,
    taskId: null,
    createdByAgentId: null,
    provider: "LOCAL_MOCK",
    status: "STOPPED",
    workdir: "/tmp/mock",
    previewUrl: null,
    metadata: null,
    createdAt: new Date("2026-06-01T10:10:00.000Z"),
    updatedAt: new Date("2026-06-01T10:40:00.000Z")
  });
  db.agentToolCallRecords.push({
    id: "agent-tool-call-cost-1",
    roomId: roomBody.room.id,
    taskId: null,
    artifactId: null,
    approvalId: null,
    agentId: "agent-cost-1",
    toolName: "remote.provider.call",
    status: "FAILED",
    arguments: {},
    result: null,
    errorCode: -1,
    errorMessage: "Provider failed.",
    startedAt: new Date("2026-06-01T10:00:00.000Z"),
    finishedAt: new Date("2026-06-01T10:00:01.000Z"),
    durationMs: 1000,
    createdAt: new Date("2026-06-01T10:00:00.000Z"),
    updatedAt: new Date("2026-06-01T10:00:01.000Z")
  });

  const usageResponse = await server.inject({
    method: "GET",
    url: `/organizations/${organizationBody.organization.id}/usage`,
    headers: ownerHeaders
  });

  assert.equal(usageResponse.statusCode, 200);
  assert.deepEqual(
    usageResponse.json<{
      usage: {
        providerUsage: {
          liveKitParticipantMinutes: number;
          deepgramSttMinutes: number;
          e2bSandboxMinutes: number;
          connectorFailures: number;
        };
      };
    }>().usage.providerUsage,
    {
      liveKitParticipantMinutes: 30,
      deepgramSttMinutes: 5,
      e2bSandboxMinutes: 20,
      connectorFailures: 1
    }
  );

  await server.close();
});

test("room join tolerates duplicate concurrent membership writes", async () => {
  const db = createFakeDb();
  const server = buildServer({
    db,
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false
  });

  const ownerHeaders = {
    "x-dev-user-email": "owner@example.com",
    "x-dev-user-name": "Owner"
  };
  const memberHeaders = {
    "x-dev-user-email": "member@example.com",
    "x-dev-user-name": "Member"
  };

  const organizationResponse = await server.inject({
    method: "POST",
    url: "/organizations",
    headers: ownerHeaders,
    payload: {
      name: "Acme"
    }
  });
  const organizationBody = organizationResponse.json<{ organization: { id: string } }>();
  const roomResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/rooms`,
    headers: ownerHeaders,
    payload: {
      title: "Planning"
    }
  });
  const roomBody = roomResponse.json<{ room: { id: string } }>();

  const firstJoinResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/join`,
    headers: memberHeaders
  });
  assert.equal(firstJoinResponse.statusCode, 201);

  (db.organizationMember as unknown as { upsert: (_params: unknown) => Promise<never> }).upsert = async () => {
    throw createPrismaUniqueConstraintError();
  };
  (db.roomParticipant as unknown as { upsert: (_params: unknown) => Promise<never> }).upsert = async () => {
    throw createPrismaUniqueConstraintError();
  };

  const secondJoinResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/join`,
    headers: memberHeaders
  });

  assert.equal(secondJoinResponse.statusCode, 201);
  assert.equal(secondJoinResponse.json<{ participant: { role: string } }>().participant.role, "MEMBER");

  await server.close();
});

test("room livekit token endpoint returns a room-scoped join token", async () => {
  const liveKitTokenIssuer = createFakeLiveKitTokenIssuer();
  const server = buildServer({
    db: createFakeDb(),
    liveKitTokenIssuer,
    logger: false
  });

  const ownerHeaders = {
    "x-dev-user-email": "owner@example.com",
    "x-dev-user-name": "Owner"
  };

  const organizationResponse = await server.inject({
    method: "POST",
    url: "/organizations",
    headers: ownerHeaders,
    payload: {
      name: "Acme"
    }
  });
  const organizationBody = organizationResponse.json<{ organization: { id: string } }>();

  const roomResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/rooms`,
    headers: ownerHeaders,
    payload: {
      title: "Planning"
    }
  });
  const roomBody = roomResponse.json<{ room: { id: string } }>();

  const tokenResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/livekit-token`,
    headers: ownerHeaders,
    payload: {}
  });

  assert.equal(tokenResponse.statusCode, 200);
  const tokenBody = tokenResponse.json<{
    livekit: { serverUrl: string; token: string; roomName: string; identity: string };
  }>();
  assert.equal(tokenBody.livekit.serverUrl, "wss://livekit.example.test");
  assert.equal(tokenBody.livekit.token, `token:${roomBody.room.id}:user-1`);
  assert.equal(tokenBody.livekit.roomName, roomBody.room.id);
  assert.equal(tokenBody.livekit.identity, "user-1");
  assert.deepEqual(liveKitTokenIssuer.requests, [
    {
      roomId: roomBody.room.id,
      userId: "user-1",
      userName: "Owner"
    }
  ]);

  await server.close();
});

test("room livekit token endpoint rejects invalid payloads and inaccessible rooms", async () => {
  const server = buildServer({
    db: createFakeDb(),
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false
  });

  const ownerHeaders = {
    "x-dev-user-email": "owner@example.com",
    "x-dev-user-name": "Owner"
  };

  const organizationResponse = await server.inject({
    method: "POST",
    url: "/organizations",
    headers: ownerHeaders,
    payload: {
      name: "Acme"
    }
  });
  const organizationBody = organizationResponse.json<{ organization: { id: string } }>();

  const roomResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/rooms`,
    headers: ownerHeaders,
    payload: {
      title: "Planning"
    }
  });
  const roomBody = roomResponse.json<{ room: { id: string } }>();

  const invalidPayloadResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/livekit-token`,
    headers: ownerHeaders,
    payload: {
      identity: "user-provided-identity"
    }
  });

  assert.equal(invalidPayloadResponse.statusCode, 400);

  const outsiderResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/livekit-token`,
    headers: {
      "x-dev-user-email": "outsider@example.com",
      "x-dev-user-name": "Outsider"
    },
    payload: {}
  });

  assert.equal(outsiderResponse.statusCode, 404);

  await server.close();
});

test("room event gateway persists and broadcasts final transcript events", async () => {
  const db = createFakeDb();
  const server = buildServer({
    db,
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false,
    workerToken: "worker-secret"
  });

  const ownerHeaders = {
    "x-dev-user-email": "owner@example.com",
    "x-dev-user-name": "Owner"
  };

  const organizationResponse = await server.inject({
    method: "POST",
    url: "/organizations",
    headers: ownerHeaders,
    payload: {
      name: "Acme"
    }
  });
  const organizationBody = organizationResponse.json<{ organization: { id: string } }>();

  const roomResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/rooms`,
    headers: ownerHeaders,
    payload: {
      title: "Planning"
    }
  });
  const roomBody = roomResponse.json<{ room: { id: string } }>();

  await server.ready();

  const socket = await server.injectWS(
    `/rooms/${roomBody.room.id}/events?devUserEmail=owner%40example.com&devUserName=Owner`
  );
  const workerSocket = await server.injectWS(`/rooms/${roomBody.room.id}/events`, {
    headers: {
      authorization: "Bearer worker-secret"
    }
  });
  const nextMessage = new Promise<Record<string, unknown>>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for room event.")), 1000);

    socket.once("message", (data) => {
      clearTimeout(timeout);
      resolve(JSON.parse(data.toString()) as Record<string, unknown>);
    });
  });
  const nextWorkerMessage = new Promise<Record<string, unknown>>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for worker room event.")), 1000);

    workerSocket.once("message", (data) => {
      clearTimeout(timeout);
      resolve(JSON.parse(data.toString()) as Record<string, unknown>);
    });
  });

  const transcriptResponse = await server.inject({
    method: "POST",
    url: `/internal/rooms/${roomBody.room.id}/events`,
    headers: {
      authorization: "Bearer worker-secret"
    },
    payload: {
      type: "transcript.final",
      roomId: roomBody.room.id,
      speakerId: "user-1",
      text: "Hello room",
      ts: "2026-06-06T12:00:04.000Z",
      startedAt: "2026-06-06T12:00:01.000Z",
      endedAt: "2026-06-06T12:00:04.000Z"
    }
  });

  assert.equal(transcriptResponse.statusCode, 202);
  const transcriptBody = transcriptResponse.json<{
    event: { segmentId: string; type: string; speakerId: string; text: string };
  }>();

  assert.equal(transcriptBody.event.segmentId, "transcript-1");
  assert.equal(db.transcriptSegmentRecords.length, 1);
  assert.equal(db.transcriptSegmentRecords[0]?.speakerUserId, "user-1");
  assert.equal(db.transcriptSegmentRecords[0]?.text, "Hello room");
  assert.deepEqual(await nextMessage, transcriptBody.event);
  assert.deepEqual(await nextWorkerMessage, transcriptBody.event);

  socket.terminate();
  workerSocket.terminate();
  await server.close();
});

test("task route persists and broadcasts task artifact events", async () => {
  const db = createFakeDb();
  const server = buildServer({
    db,
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false
  });

  const ownerHeaders = {
    "x-dev-user-email": "owner@example.com",
    "x-dev-user-name": "Owner"
  };

  const organizationResponse = await server.inject({
    method: "POST",
    url: "/organizations",
    headers: ownerHeaders,
    payload: {
      name: "Acme"
    }
  });
  const organizationBody = organizationResponse.json<{ organization: { id: string } }>();

  const roomResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/rooms`,
    headers: ownerHeaders,
    payload: {
      title: "Planning"
    }
  });
  const roomBody = roomResponse.json<{ room: { id: string } }>();

  await server.ready();

  const socket = await server.injectWS(
    `/rooms/${roomBody.room.id}/events?devUserEmail=owner%40example.com&devUserName=Owner`
  );
  const nextMessages = readSocketMessages<{ type: string }>(socket, 2);

  const createTaskResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/tasks`,
    headers: ownerHeaders,
    payload: {
      title: "Manual spec",
      artifact: {
        type: "DOCUMENT",
        content: {
          text: "Manual draft"
        }
      }
    }
  });

  assert.equal(createTaskResponse.statusCode, 201);
  const createTaskBody = createTaskResponse.json<{
    task: { id: string; title: string; createdByUserId: string | null };
    artifact: { id: string; taskId: string | null; latestVersion: { content: { text?: string } } | null };
  }>();

  assert.equal(createTaskBody.task.title, "Manual spec");
  assert.equal(createTaskBody.task.createdByUserId, "user-1");
  assert.equal(createTaskBody.artifact.taskId, createTaskBody.task.id);
  assert.equal(createTaskBody.artifact.latestVersion?.content.text, "Manual draft");
  assert.equal(db.taskRecords.length, 1);
  assert.equal(db.artifactRecords.length, 1);
  assert.deepEqual(
    db.taskEventRecords.map((event) => event.type),
    ["task.created", "artifact.created"]
  );

  const messages = await nextMessages;
  assert.deepEqual(
    messages.map((message) => message.type),
    ["task.created", "artifact.created"]
  );

  const listTasksResponse = await server.inject({
    method: "GET",
    url: `/rooms/${roomBody.room.id}/tasks`,
    headers: ownerHeaders
  });

  assert.equal(listTasksResponse.statusCode, 200);
  const listTasksBody = listTasksResponse.json<{ items: Array<{ task: { id: string }; artifacts: unknown[] }> }>();
  assert.equal(listTasksBody.items.length, 1);
  assert.equal(listTasksBody.items[0]?.task.id, createTaskBody.task.id);
  assert.equal(listTasksBody.items[0]?.artifacts.length, 1);

  socket.terminate();
  await server.close();
});

test("task lifecycle streams logs, patches artifacts, and replays persisted events", async () => {
  const db = createFakeDb();
  const server = buildServer({
    db,
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false
  });

  const ownerHeaders = {
    "x-dev-user-email": "owner@example.com",
    "x-dev-user-name": "Owner"
  };

  const organizationResponse = await server.inject({
    method: "POST",
    url: "/organizations",
    headers: ownerHeaders,
    payload: {
      name: "Acme"
    }
  });
  const organizationBody = organizationResponse.json<{ organization: { id: string } }>();

  const roomResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/rooms`,
    headers: ownerHeaders,
    payload: {
      title: "Planning"
    }
  });
  const roomBody = roomResponse.json<{ room: { id: string } }>();

  await server.ready();

  const socket = await server.injectWS(
    `/rooms/${roomBody.room.id}/events?devUserEmail=owner%40example.com&devUserName=Owner`
  );
  const nextMessages = readSocketMessages<{
    eventId?: string;
    type: string;
    event?: { type: string };
    artifact?: { id: string; latestVersion: { content: Record<string, unknown> } | null };
    log?: { message: string };
    task?: { status: string };
  }>(socket, 10);

  const createTaskResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/tasks`,
    headers: ownerHeaders,
    payload: {
      title: "Live code",
      artifact: {
        type: "CODE",
        content: {
          files: [
            {
              path: "index.ts",
              content: "console.log('draft');"
            }
          ]
        }
      }
    }
  });

  assert.equal(createTaskResponse.statusCode, 201);
  const createTaskBody = createTaskResponse.json<{
    task: { id: string; status: string };
    artifact: { id: string; latestVersion: { content: Record<string, unknown> } | null };
  }>();
  assert.equal(createTaskBody.task.status, "PENDING");

  const runningResponse = await server.inject({
    method: "PATCH",
    url: `/rooms/${roomBody.room.id}/tasks/${createTaskBody.task.id}/status`,
    headers: ownerHeaders,
    payload: {
      status: "RUNNING"
    }
  });

  assert.equal(runningResponse.statusCode, 200);

  const logResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/tasks/${createTaskBody.task.id}/logs`,
    headers: ownerHeaders,
    payload: {
      message: "Generating files"
    }
  });

  assert.equal(logResponse.statusCode, 201);

  const patchResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/artifacts/${createTaskBody.artifact.id}/patches`,
    headers: ownerHeaders,
    payload: {
      patch: {
        text: "Patched live",
        files: [
          {
            path: "index.ts",
            content: "console.log('patched');"
          }
        ]
      }
    }
  });

  assert.equal(patchResponse.statusCode, 201);

  const updateArtifactResponse = await server.inject({
    method: "PATCH",
    url: `/rooms/${roomBody.room.id}/artifacts/${createTaskBody.artifact.id}`,
    headers: ownerHeaders,
    payload: {
      title: "Live code ready",
      status: "READY",
      content: {
        text: "Ready",
        files: [
          {
            path: "index.ts",
            content: "console.log('ready');"
          }
        ]
      }
    }
  });

  assert.equal(updateArtifactResponse.statusCode, 200);

  const previewResponse = await server.inject({
    method: "PATCH",
    url: `/rooms/${roomBody.room.id}/artifacts/${createTaskBody.artifact.id}/preview-url`,
    headers: ownerHeaders,
    payload: {
      previewUrl: "https://example.com/preview"
    }
  });

  assert.equal(previewResponse.statusCode, 202);
  const previewApprovalBody = previewResponse.json<{
    status: string;
    approval: { id: string; action: string; status: string; artifactId: string | null; payload: { previewUrl?: string } };
  }>();
  assert.equal(previewApprovalBody.status, "approval_required");
  assert.equal(previewApprovalBody.approval.action, "publish_preview");
  assert.equal(previewApprovalBody.approval.status, "PENDING");
  assert.equal(previewApprovalBody.approval.artifactId, createTaskBody.artifact.id);
  assert.equal(previewApprovalBody.approval.payload.previewUrl, "https://example.com/preview");
  assert.equal(db.artifactVersionRecords.length, 3);

  const previewDecisionResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/approvals/${previewApprovalBody.approval.id}/decision`,
    headers: ownerHeaders,
    payload: {
      status: "APPROVED"
    }
  });

  assert.equal(previewDecisionResponse.statusCode, 200);

  const approvedPreviewResponse = await server.inject({
    method: "PATCH",
    url: `/rooms/${roomBody.room.id}/artifacts/${createTaskBody.artifact.id}/preview-url`,
    headers: ownerHeaders,
    payload: {
      approvalId: previewApprovalBody.approval.id,
      previewUrl: "https://example.com/preview"
    }
  });

  assert.equal(approvedPreviewResponse.statusCode, 200);
  assert.equal(approvedPreviewResponse.json<{ status: string }>().status, "published");

  const completedResponse = await server.inject({
    method: "PATCH",
    url: `/rooms/${roomBody.room.id}/tasks/${createTaskBody.task.id}/status`,
    headers: ownerHeaders,
    payload: {
      status: "COMPLETED"
    }
  });

  assert.equal(completedResponse.statusCode, 200);

  const messages = await nextMessages;
  assert.deepEqual(
    messages.map((message) => message.type),
    [
      "task.created",
      "artifact.created",
      "task.status",
      "task.log",
      "artifact.patch",
      "artifact.updated",
      "room.event",
      "room.event",
      "artifact.preview_url",
      "task.status"
    ]
  );
  assert.equal(messages[2]?.task?.status, "RUNNING");
  assert.equal(messages[3]?.log?.message, "Generating files");
  assert.equal(messages[6]?.event?.type, "APPROVAL_REQUESTED");
  assert.equal(messages[7]?.event?.type, "APPROVAL_RESOLVED");
  assert.equal(messages[9]?.task?.status, "COMPLETED");
  assert.ok(db.auditLogRecords.some((event) => event.action === "APPROVAL_REQUESTED"));
  assert.ok(db.auditLogRecords.some((event) => event.action === "APPROVAL_RESOLVED"));
  assert.equal(db.taskRecords[0]?.status, "COMPLETED");
  assert.ok(db.taskRecords[0]?.completedAt);
  assert.deepEqual(
    db.taskEventRecords.map((event) => event.type),
    [
      "task.created",
      "artifact.created",
      "task.status",
      "task.log",
      "artifact.patch",
      "artifact.updated",
      "artifact.preview_url",
      "task.status"
    ]
  );
  assert.equal(db.artifactVersionRecords.length, 4);
  assert.equal(db.artifactVersionRecords[3]?.content.previewUrl, "https://example.com/preview");

  const listTasksResponse = await server.inject({
    method: "GET",
    url: `/rooms/${roomBody.room.id}/tasks`,
    headers: ownerHeaders
  });

  assert.equal(listTasksResponse.statusCode, 200);
  const listTasksBody = listTasksResponse.json<{
    items: Array<{ task: { status: string }; artifacts: Array<{ title: string }>; logs: Array<{ message: string }> }>;
  }>();
  assert.equal(listTasksBody.items[0]?.task.status, "COMPLETED");
  assert.equal(listTasksBody.items[0]?.artifacts[0]?.title, "Live code ready");
  assert.deepEqual(
    listTasksBody.items[0]?.logs.map((log) => log.message),
    ["Generating files"]
  );

  const replayResponse = await server.inject({
    method: "GET",
    url: `/rooms/${roomBody.room.id}/events/replay?afterEventId=${messages[1]?.eventId}`,
    headers: ownerHeaders
  });

  assert.equal(replayResponse.statusCode, 200);
  const replayBody = replayResponse.json<{ events: Array<{ type: string }> }>();
  assert.deepEqual(
    replayBody.events.map((event) => event.type),
    ["task.status", "task.log", "artifact.patch", "artifact.updated", "artifact.preview_url", "task.status"]
  );

  socket.terminate();
  await server.close();
});

test("room MCP HTTP token lets an external agent work in a real room", async (t) => {
  const db = createFakeDb();
  const server = buildServer({
    db,
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false
  });

  const ownerHeaders = {
    "x-dev-user-email": "owner@example.com",
    "x-dev-user-name": "Owner"
  };
  const memberHeaders = {
    "x-dev-user-email": "member@example.com",
    "x-dev-user-name": "Member"
  };
  let socket: TestWebSocket | null = null;

  t.after(async () => {
    socket?.terminate();
    await server.close();
  });

  const organizationResponse = await server.inject({
    method: "POST",
    url: "/organizations",
    headers: ownerHeaders,
    payload: {
      name: "Acme"
    }
  });
  const organizationBody = organizationResponse.json<{ organization: { id: string } }>();

  const roomResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/rooms`,
    headers: ownerHeaders,
    payload: {
      title: "MCP room"
    }
  });
  const roomBody = roomResponse.json<{ room: { id: string } }>();

  const baseUrl = await server.listen({
    port: 0,
    host: "127.0.0.1"
  });

  socket = await server.injectWS(
    `/rooms/${roomBody.room.id}/events?devUserEmail=owner%40example.com&devUserName=Owner`
  );
  const nextMessages = readSocketMessages<{ type: string; event?: { type: string } }>(socket, 19);

  const sessionResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/agent-sessions`,
    headers: ownerHeaders,
    payload: {
      name: "Remote MCP Agent",
      provider: "MCP",
      capabilities: ["CODE_GENERATION", "PROTOTYPING"],
      metadata: {
        ownerUserId: "user-1"
      }
    }
  });

  assert.equal(sessionResponse.statusCode, 201);
  const sessionBody = sessionResponse.json<{
    agent: { id: string; name: string };
    session: { token: string; tokenType: string };
  }>();
  assert.equal(sessionBody.agent.name, "Remote MCP Agent");
  assert.equal(sessionBody.session.tokenType, "Bearer");

  const context = await callMcpHttpTool(baseUrl, roomBody.room.id, sessionBody.session.token, "room.get_context_pack", {
    roomId: roomBody.room.id
  });
  assert.equal(readRecord(context, "contextPack").roomId, roomBody.room.id);

  await callMcpHttpTool(baseUrl, roomBody.room.id, sessionBody.session.token, "agent.register", {
    roomId: roomBody.room.id,
    agentId: sessionBody.agent.id,
    name: "Remote MCP Agent",
    provider: "MCP",
    transport: "HTTP",
    capabilities: ["CODE_GENERATION", "PROTOTYPING"]
  });

  const createdTask = await callMcpHttpTool(baseUrl, roomBody.room.id, sessionBody.session.token, "room.create_task", {
    roomId: roomBody.room.id,
    title: "Build preview",
    description: "Create a sandboxed preview",
    riskLevel: "LOW"
  });
  const taskId = readString(readRecord(createdTask, "task"), "id");

  await callMcpHttpTool(baseUrl, roomBody.room.id, sessionBody.session.token, "agent.claim_task", {
    roomId: roomBody.room.id,
    agentId: sessionBody.agent.id,
    taskId
  });
  await callMcpHttpTool(baseUrl, roomBody.room.id, sessionBody.session.token, "room.append_log", {
    roomId: roomBody.room.id,
    taskId,
    message: "Writing preview files"
  });

  const artifactResult = await callMcpHttpTool(baseUrl, roomBody.room.id, sessionBody.session.token, "room.create_artifact", {
    roomId: roomBody.room.id,
    taskId,
    type: "PREVIEW",
    title: "Preview",
    content: {
      text: "Preview draft"
    }
  });
  const artifactId = readString(readRecord(artifactResult, "artifact"), "id");

  const runResult = await callMcpHttpTool(baseUrl, roomBody.room.id, sessionBody.session.token, "agent.start_run", {
    roomId: roomBody.room.id,
    agentId: sessionBody.agent.id,
    taskId,
    metadata: {
      mode: "preview"
    }
  });
  const run = readRecord(runResult, "run");
  const runId = readString(run, "id");
  assert.equal(run.ownerUserId, "user-1");
  assert.equal(readRecord(runResult, "runEvent").ownerUserId, "user-1");

  await callMcpHttpTool(baseUrl, roomBody.room.id, sessionBody.session.token, "agent.emit_event", {
    roomId: roomBody.room.id,
    agentId: sessionBody.agent.id,
    runId,
    message: "Plan ready",
    payload: {
      step: "plan"
    }
  });

  await callMcpHttpTool(baseUrl, roomBody.room.id, sessionBody.session.token, "room.write_artifact", {
    roomId: roomBody.room.id,
    artifactId,
    runId,
    status: "READY",
    content: {
      text: "Preview ready",
      files: [
        {
          path: "index.html",
          content: "<main>Preview</main>"
        },
        {
          path: "README.md",
          content: "# Preview"
        }
      ]
    }
  });

  const blockedPreviewResponse = await postMcpHttp(baseUrl, roomBody.room.id, sessionBody.session.token, {
    jsonrpc: "2.0",
    id: "blocked-preview",
    method: "tools/call",
    params: {
      name: "room.set_preview_url",
      arguments: {
        roomId: roomBody.room.id,
        artifactId,
        previewUrl: "https://preview.example/remote-mcp"
      }
    }
  });
  assert.equal(blockedPreviewResponse.status, 200);
  assert.equal((await blockedPreviewResponse.json() as { error: { code: number } }).error.code, -32010);

  const approvalResult = await callMcpHttpTool(baseUrl, roomBody.room.id, sessionBody.session.token, "approval.request", {
    roomId: roomBody.room.id,
    agentId: sessionBody.agent.id,
    taskId,
    artifactId,
    riskLevel: "MEDIUM",
    action: "publish_preview",
    reason: "Expose sandbox URL to room participants",
    payload: {
      previewUrl: "https://preview.example/remote-mcp"
    }
  });
  const approvalId = readString(readRecord(approvalResult, "approval"), "id");

  const memberJoinResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/join`,
    headers: memberHeaders
  });
  assert.equal(memberJoinResponse.statusCode, 201);

  const memberApprovalListResponse = await server.inject({
    method: "GET",
    url: `/rooms/${roomBody.room.id}/approvals`,
    headers: memberHeaders
  });
  assert.equal(memberApprovalListResponse.statusCode, 200);

  const memberPolicyResponse = await server.inject({
    method: "GET",
    url: `/rooms/${roomBody.room.id}/policy`,
    headers: memberHeaders
  });
  assert.equal(memberPolicyResponse.statusCode, 200);
  const memberPolicyBody = memberPolicyResponse.json<{
    policy: {
      agentSessions: { canCreate: boolean; organizationRole: string | null; roomRole: string | null };
      approvalDecisions: { canDecide: boolean; organizationRole: string | null; roomRole: string | null };
      rules: Array<{ action: string; requiresApproval: boolean }>;
    };
  }>();
  assert.equal(memberPolicyBody.policy.agentSessions.canCreate, false);
  assert.equal(memberPolicyBody.policy.agentSessions.organizationRole, "MEMBER");
  assert.equal(memberPolicyBody.policy.agentSessions.roomRole, "MEMBER");
  assert.equal(memberPolicyBody.policy.approvalDecisions.canDecide, false);
  assert.equal(memberPolicyBody.policy.approvalDecisions.organizationRole, "MEMBER");
  assert.equal(memberPolicyBody.policy.approvalDecisions.roomRole, "MEMBER");
  assert.deepEqual(
    memberPolicyBody.policy.rules
      .filter((rule) => rule.requiresApproval)
      .map((rule) => rule.action)
      .sort(),
    ["apply_to_local_repo", "publish_preview", "run_local_check"]
  );

  const memberAgentSessionResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/agent-sessions`,
    headers: memberHeaders,
    payload: {
      name: "Member-created agent",
      provider: "MCP",
      capabilities: ["ORCHESTRATION", "CODE_GENERATION", "PROTOTYPING"]
    }
  });
  assert.equal(memberAgentSessionResponse.statusCode, 403);

  const memberDecisionResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/approvals/${approvalId}/decision`,
    headers: memberHeaders,
    payload: {
      status: "APPROVED"
    }
  });
  assert.equal(memberDecisionResponse.statusCode, 403);

  const decisionResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/approvals/${approvalId}/decision`,
    headers: ownerHeaders,
    payload: {
      status: "APPROVED"
    }
  });
  assert.equal(decisionResponse.statusCode, 200);
  assert.equal(decisionResponse.json<{ approval: { status: string } }>().approval.status, "APPROVED");

  const sandboxResult = await callMcpHttpTool(baseUrl, roomBody.room.id, sessionBody.session.token, "preview.create_session", {
    roomId: roomBody.room.id,
    agentId: sessionBody.agent.id,
    taskId,
    provider: "LOCAL_MOCK",
    workdir: "/tmp/workroom-preview"
  });
  const sandboxSessionId = readString(readRecord(sandboxResult, "session"), "id");

  await callMcpHttpTool(baseUrl, roomBody.room.id, sessionBody.session.token, "preview.write_files", {
    roomId: roomBody.room.id,
    sessionId: sandboxSessionId,
    files: [
      {
        path: "index.html",
        content: "<main>Preview</main>"
      },
      {
        path: "README.md",
        content: "# Preview"
      }
    ]
  });

  await callMcpHttpTool(baseUrl, roomBody.room.id, sessionBody.session.token, "preview.start_server", {
    roomId: roomBody.room.id,
    sessionId: sandboxSessionId,
    command: "python3 -m http.server 3000",
    port: 3000
  });

  const publishedPreview = await callMcpHttpTool(baseUrl, roomBody.room.id, sessionBody.session.token, "preview.publish_url", {
    roomId: roomBody.room.id,
    sessionId: sandboxSessionId,
    artifactId,
    approvalId,
    port: 3000
  });
  assert.equal(readString(readRecord(publishedPreview, "session"), "previewUrl"), `https://preview.local/${sandboxSessionId}/3000`);

  await callMcpHttpTool(baseUrl, roomBody.room.id, sessionBody.session.token, "agent.finish_run", {
    roomId: roomBody.room.id,
    runId,
    status: "COMPLETED",
    summary: "Preview files ready"
  });

  const messages = await nextMessages;
  assert.ok(messages.some((message) => message.type === "room.event" && message.event?.type === "AGENT_REGISTERED"));
  assert.ok(messages.some((message) => message.type === "room.event" && message.event?.type === "AGENT_RUN_STARTED"));
  assert.ok(messages.some((message) => message.type === "room.event" && message.event?.type === "AGENT_RUN_EVENT"));
  assert.ok(messages.some((message) => message.type === "room.event" && message.event?.type === "AGENT_RUN_FINISHED"));
  assert.ok(messages.some((message) => message.type === "room.event" && message.event?.type === "AGENT_TOOL_CALL_BLOCKED"));
  assert.ok(messages.some((message) => message.type === "room.event" && message.event?.type === "APPROVAL_REQUESTED"));
  assert.ok(messages.some((message) => message.type === "room.event" && message.event?.type === "SANDBOX_SESSION_CREATED"));
  assert.ok(messages.some((message) => message.type === "room.event" && message.event?.type === "SANDBOX_FILES_WRITTEN"));
  assert.ok(messages.some((message) => message.type === "room.event" && message.event?.type === "SANDBOX_SERVER_STARTED"));
  assert.ok(messages.some((message) => message.type === "room.event" && message.event?.type === "SANDBOX_PREVIEW_PUBLISHED"));
  assert.ok(messages.some((message) => message.type === "artifact.preview_url"));
  assert.ok(
    db.agentToolCallRecords.some((toolCall) => {
      const keys = toolCall.result?.keys;

      return toolCall.toolName === "agent.start_run" && toolCall.status === "SUCCEEDED" && Array.isArray(keys) && keys.includes("run");
    })
  );
  assert.ok(
    db.agentToolCallRecords.some(
      (toolCall) =>
        toolCall.toolName === "room.set_preview_url" &&
        toolCall.status === "BLOCKED" &&
        toolCall.errorCode === -32010
    )
  );
  const toolCallsResponse = await server.inject({
    method: "GET",
    url: `/rooms/${roomBody.room.id}/tool-calls`,
    headers: ownerHeaders
  });
  assert.equal(toolCallsResponse.statusCode, 200);
  const toolCallsBody = toolCallsResponse.json<{
    toolCalls: Array<{
      toolName: string;
      status: string;
      arguments: Record<string, unknown>;
      result: Record<string, unknown> | null;
      errorCode: number | null;
    }>;
  }>();
  assert.ok(toolCallsBody.toolCalls.some((toolCall) => toolCall.toolName === "agent.start_run" && toolCall.status === "SUCCEEDED"));
  assert.ok(toolCallsBody.toolCalls.some((toolCall) => toolCall.toolName === "room.set_preview_url" && toolCall.status === "BLOCKED"));
  assert.equal(
    toolCallsBody.toolCalls.some((toolCall) => JSON.stringify(toolCall.arguments).includes("room_agent_")),
    false
  );
  assert.equal(db.agentRunRecords.length, 1);
  assert.equal(db.agentRunRecords[0]?.status, "COMPLETED");
  assert.equal(db.agentRunRecords[0]?.ownerUserId, "user-1");
  assert.deepEqual(
    db.agentRunEventRecords.map((event) => event.type),
    ["agent.run.started", "agent.event", "agent.run.completed"]
  );
  assert.ok(db.agentRunEventRecords.every((event) => event.ownerUserId === "user-1"));
  const listRunTasksResponse = await server.inject({
    method: "GET",
    url: `/rooms/${roomBody.room.id}/tasks`,
    headers: ownerHeaders
  });
  assert.equal(listRunTasksResponse.statusCode, 200);
  const listRunTasksBody = listRunTasksResponse.json<{
    items: Array<{ runEvents: Array<{ id: string; ownerUserId: string | null; type: string; payload: Record<string, unknown> | null }> }>;
  }>();
  assert.deepEqual(
    listRunTasksBody.items[0]?.runEvents.map((event) => [event.id, event.type]),
    db.agentRunEventRecords.map((event) => [event.id, event.type])
  );
  assert.ok(listRunTasksBody.items[0]?.runEvents.every((event) => event.ownerUserId === "user-1"));
  assert.deepEqual(
    db.artifactFileRecords.map((file) => file.path),
    ["index.html", "README.md"]
  );
  assert.equal(db.artifactFileVersionRecords.length, 2);
  assert.ok(db.artifactFileVersionRecords.every((version) => version.runId === runId));
  assert.equal(db.artifactFileDiffRecords.length, 2);
  assert.ok(db.artifactFileDiffRecords[0]?.unifiedDiff.includes("+++ b/index.html"));
  assert.equal(db.sandboxSessionRecords.length, 1);
  assert.equal(db.sandboxSessionRecords[0]?.status, "READY");
  assert.equal(db.sandboxSessionRecords[0]?.previewUrl, `https://preview.local/${sandboxSessionId}/3000`);

  const artifactFilesResponse = await server.inject({
    method: "GET",
    url: `/rooms/${roomBody.room.id}/artifacts/${artifactId}/files`,
    headers: ownerHeaders
  });
  assert.equal(artifactFilesResponse.statusCode, 200);
  const artifactFilesBody = artifactFilesResponse.json<{
    files: Array<{
      id: string;
      path: string;
      latestVersion: { content: string; runId: string | null } | null;
      latestDiff: { unifiedDiff: string } | null;
    }>;
  }>();
  assert.deepEqual(
    artifactFilesBody.files.map((file) => [file.path, file.latestVersion?.content, file.latestVersion?.runId]),
    [
      ["index.html", "<main>Preview</main>", runId],
      ["README.md", "# Preview", runId]
    ]
  );
  assert.ok(artifactFilesBody.files[0]?.latestDiff?.unifiedDiff.includes("+++ b/index.html"));
  assert.ok(artifactFilesBody.files[1]?.latestDiff?.unifiedDiff.includes("+++ b/README.md"));

  const fileCommentResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/comments`,
    headers: ownerHeaders,
    payload: {
      artifactId,
      artifactFileId: artifactFilesBody.files[0]?.id,
      lineNumber: 1,
      body: "Clarify the preview heading."
    }
  });
  assert.equal(fileCommentResponse.statusCode, 201);
  const fileCommentBody = fileCommentResponse.json<{
    comment: { artifactFileId: string | null; body: string; lineNumber: number | null; createdByUserEmail: string | null };
  }>();
  assert.equal(fileCommentBody.comment.artifactFileId, artifactFilesBody.files[0]?.id);
  assert.equal(fileCommentBody.comment.lineNumber, 1);
  assert.equal(fileCommentBody.comment.createdByUserEmail, ownerHeaders["x-dev-user-email"]);

  const runEventId = db.agentRunEventRecords[0]?.id;
  assert.ok(runEventId);
  const runCommentResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/comments`,
    headers: ownerHeaders,
    payload: {
      agentRunEventId: runEventId,
      body: "This run step is ready for follow-up."
    }
  });
  assert.equal(runCommentResponse.statusCode, 201);
  assert.equal(db.roomCommentRecords.length, 2);

  const fileCommentsResponse = await server.inject({
    method: "GET",
    url: `/rooms/${roomBody.room.id}/comments?artifactFileId=${artifactFilesBody.files[0]?.id}`,
    headers: ownerHeaders
  });
  assert.equal(fileCommentsResponse.statusCode, 200);
  const fileCommentsBody = fileCommentsResponse.json<{ comments: Array<{ body: string; lineNumber: number | null }> }>();
  assert.deepEqual(fileCommentsBody.comments.map((comment) => [comment.body, comment.lineNumber]), [
    ["Clarify the preview heading.", 1]
  ]);

  const runCommentsResponse = await server.inject({
    method: "GET",
    url: `/rooms/${roomBody.room.id}/comments?agentRunEventId=${runEventId}`,
    headers: ownerHeaders
  });
  assert.equal(runCommentsResponse.statusCode, 200);
  const runCommentsBody = runCommentsResponse.json<{ comments: Array<{ body: string; agentRunEventId: string | null }> }>();
  assert.deepEqual(runCommentsBody.comments.map((comment) => [comment.body, comment.agentRunEventId]), [
    ["This run step is ready for follow-up.", runEventId]
  ]);

  const artifactFilesZipResponse = await server.inject({
    method: "GET",
    url: `/rooms/${roomBody.room.id}/artifacts/${artifactId}/files.zip`,
    headers: ownerHeaders
  });
  assert.equal(artifactFilesZipResponse.statusCode, 200);
  assert.equal(artifactFilesZipResponse.headers["content-type"], "application/zip");
  assert.match(String(artifactFilesZipResponse.headers["content-disposition"]), /artifact-.+-files\.zip/);
  assert.ok(artifactFilesZipResponse.body.startsWith("PK"));
  assert.ok(artifactFilesZipResponse.body.includes("index.html"));
  assert.ok(artifactFilesZipResponse.body.includes("README.md"));
  assert.ok(artifactFilesZipResponse.body.includes("<main>Preview</main>"));

  const eventsResult = await callMcpHttpTool(baseUrl, roomBody.room.id, sessionBody.session.token, "room.list_events", {
    roomId: roomBody.room.id
  });
  const eventTypes = readArray(eventsResult, "events").map((event) => readString(event, "type"));
  assert.ok(eventTypes.includes("AGENT_REGISTERED"));
  assert.ok(eventTypes.includes("AGENT_RUN_STARTED"));
  assert.ok(eventTypes.includes("AGENT_RUN_EVENT"));
  assert.ok(eventTypes.includes("AGENT_RUN_FINISHED"));
  assert.ok(eventTypes.includes("AGENT_TOOL_CALL_BLOCKED"));
  assert.ok(eventTypes.includes("SANDBOX_SESSION_CREATED"));
  assert.ok(eventTypes.includes("SANDBOX_FILES_WRITTEN"));
  assert.ok(eventTypes.includes("SANDBOX_SERVER_STARTED"));
  assert.ok(eventTypes.includes("SANDBOX_PREVIEW_PUBLISHED"));
  assert.ok(eventTypes.includes("TASK_CREATED"));
  assert.ok(eventTypes.includes("TASK_LOG_APPENDED"));
  assert.ok(eventTypes.includes("ARTIFACT_CREATED"));
  assert.ok(eventTypes.includes("ARTIFACT_PREVIEW_SET"));
  assert.ok(eventTypes.includes("APPROVAL_REQUESTED"));

  const replayResponse = await server.inject({
    method: "GET",
    url: `/rooms/${roomBody.room.id}/events/replay`,
    headers: ownerHeaders
  });
  assert.equal(replayResponse.statusCode, 200);
  const replayBody = replayResponse.json<{ events: Array<{ type: string; event?: { type: string } }> }>();
  assert.ok(replayBody.events.some((event) => event.type === "room.event" && event.event?.type === "AGENT_REGISTERED"));
  assert.ok(replayBody.events.some((event) => event.type === "room.event" && event.event?.type === "AGENT_RUN_STARTED"));
  assert.ok(replayBody.events.some((event) => event.type === "room.event" && event.event?.type === "AGENT_RUN_FINISHED"));
  assert.ok(replayBody.events.some((event) => event.type === "room.event" && event.event?.type === "AGENT_TOOL_CALL_BLOCKED"));
  assert.ok(replayBody.events.some((event) => event.type === "room.event" && event.event?.type === "SANDBOX_PREVIEW_PUBLISHED"));
  assert.ok(replayBody.events.some((event) => event.type === "room.event" && event.event?.type === "APPROVAL_REQUESTED"));

  const agentListResponse = await server.inject({
    method: "GET",
    url: `/rooms/${roomBody.room.id}/agents`,
    headers: ownerHeaders
  });
  assert.equal(agentListResponse.statusCode, 200);
  const agentListBody = agentListResponse.json<{ agents: Array<{ id: string; name: string }> }>();
  assert.deepEqual(
    agentListBody.agents.map((agent) => [agent.id, agent.name]),
    [[sessionBody.agent.id, "Remote MCP Agent"]]
  );

  const approvalListResponse = await server.inject({
    method: "GET",
    url: `/rooms/${roomBody.room.id}/approvals`,
    headers: ownerHeaders
  });
  assert.equal(approvalListResponse.statusCode, 200);
  const approvalListBody = approvalListResponse.json<{ approvals: Array<{ id: string; status: string; action: string }> }>();
  assert.deepEqual(
    approvalListBody.approvals.map((approval) => ({
      id: approval.id,
      status: approval.status,
      action: approval.action
    })),
    [
    {
      id: approvalId,
      status: "APPROVED",
      action: "publish_preview"
    }
    ]
  );

  const repeatedDecisionResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/approvals/${approvalId}/decision`,
    headers: ownerHeaders,
    payload: {
      status: "REJECTED"
    }
  });
  assert.equal(repeatedDecisionResponse.statusCode, 409);

  const impersonationResponse = await postMcpHttp(baseUrl, roomBody.room.id, sessionBody.session.token, {
    jsonrpc: "2.0",
    id: "impersonation",
    method: "tools/call",
    params: {
      name: "agent.claim_task",
      arguments: {
        roomId: roomBody.room.id,
        agentId: "agent-other",
        taskId
      }
    }
  });
  assert.equal(impersonationResponse.status, 200);
  assert.equal((await impersonationResponse.json() as { error: { code: number } }).error.code, -32001);

  const missingTokenResponse = await fetch(`${baseUrl}/rooms/${roomBody.room.id}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "missing-token",
      method: "tools/list"
    })
  });
  assert.equal(missingTokenResponse.status, 401);

  db.agentConnectionRecords.splice(0);
  const missingSessionResponse = await postMcpHttp(baseUrl, roomBody.room.id, sessionBody.session.token, {
    jsonrpc: "2.0",
    id: "missing-session",
    method: "tools/call",
    params: {
      name: "room.list_events",
      arguments: {
        roomId: roomBody.room.id
      }
    }
  });
  assert.equal(missingSessionResponse.status, 200);
  assert.equal(((await missingSessionResponse.json()) as { error: { code: number } }).error.code, -32001);

  assert.equal(db.taskRecords[0]?.assignedAgentId, sessionBody.agent.id);
  assert.equal(db.artifactVersionRecords.at(-1)?.content.previewUrl, `https://preview.local/${sandboxSessionId}/3000`);
  assert.equal(db.approvalRecords[0]?.status, "APPROVED");

});

test("organization admins can raise policy rule risk without weakening approval gates", async (t) => {
  const db = createFakeDb();
  const server = buildServer({
    db,
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false
  });

  const ownerHeaders = {
    "x-dev-user-email": "owner@example.com",
    "x-dev-user-name": "Owner"
  };
  const memberHeaders = {
    "x-dev-user-email": "member@example.com",
    "x-dev-user-name": "Member"
  };

  t.after(async () => {
    await server.close();
  });

  const organizationResponse = await server.inject({
    method: "POST",
    url: "/organizations",
    headers: ownerHeaders,
    payload: {
      name: "Acme"
    }
  });
  const organizationBody = organizationResponse.json<{ organization: { id: string } }>();

  const roomResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/rooms`,
    headers: ownerHeaders,
    payload: {
      title: "Policy room"
    }
  });
  const roomBody = roomResponse.json<{ room: { id: string } }>();

  const memberJoinResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/join`,
    headers: memberHeaders
  });
  assert.equal(memberJoinResponse.statusCode, 201);

  const memberPolicyUpdateResponse = await server.inject({
    method: "PATCH",
    url: `/rooms/${roomBody.room.id}/policy/rules/publish-preview`,
    headers: memberHeaders,
    payload: {
      riskLevel: "HIGH"
    }
  });
  assert.equal(memberPolicyUpdateResponse.statusCode, 403);

  const ownerPolicyUpdateResponse = await server.inject({
    method: "PATCH",
    url: `/rooms/${roomBody.room.id}/policy/rules/publish-preview`,
    headers: ownerHeaders,
    payload: {
      riskLevel: "HIGH"
    }
  });
  assert.equal(ownerPolicyUpdateResponse.statusCode, 200);
  const ownerPolicyUpdateBody = ownerPolicyUpdateResponse.json<{
    rule: { id: string; baseRiskLevel: string; isOverridden: boolean; riskLevel: string };
  }>();
  assert.equal(ownerPolicyUpdateBody.rule.id, "publish-preview");
  assert.equal(ownerPolicyUpdateBody.rule.baseRiskLevel, "MEDIUM");
  assert.equal(ownerPolicyUpdateBody.rule.isOverridden, true);
  assert.equal(ownerPolicyUpdateBody.rule.riskLevel, "HIGH");

  const ownerPolicyResponse = await server.inject({
    method: "GET",
    url: `/rooms/${roomBody.room.id}/policy`,
    headers: ownerHeaders
  });
  assert.equal(ownerPolicyResponse.statusCode, 200);
  const ownerPolicyBody = ownerPolicyResponse.json<{
    policy: {
      policyRules: { canManage: boolean; organizationRole: string | null };
      rules: Array<{ id: string; riskLevel: string; isOverridden: boolean }>;
    };
  }>();
  assert.equal(ownerPolicyBody.policy.policyRules.canManage, true);
  assert.equal(ownerPolicyBody.policy.policyRules.organizationRole, "OWNER");
  const publishPreviewRule = ownerPolicyBody.policy.rules.find((rule) => rule.id === "publish-preview");
  assert.ok(publishPreviewRule);
  assert.equal(publishPreviewRule.isOverridden, true);
  assert.equal(publishPreviewRule.riskLevel, "HIGH");

  const baseUrl = await server.listen({
    port: 0,
    host: "127.0.0.1"
  });

  const sessionResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/agent-sessions`,
    headers: ownerHeaders,
    payload: {
      name: "Policy MCP Agent",
      provider: "MCP",
      capabilities: ["PROTOTYPING"]
    }
  });
  assert.equal(sessionResponse.statusCode, 201);
  const sessionBody = sessionResponse.json<{
    agent: { id: string };
    session: { token: string };
  }>();

  const createdTask = await callMcpHttpTool(baseUrl, roomBody.room.id, sessionBody.session.token, "room.create_task", {
    roomId: roomBody.room.id,
    title: "Build preview",
    riskLevel: "LOW"
  });
  const taskId = readString(readRecord(createdTask, "task"), "id");
  const artifactResult = await callMcpHttpTool(baseUrl, roomBody.room.id, sessionBody.session.token, "room.create_artifact", {
    roomId: roomBody.room.id,
    taskId,
    type: "PREVIEW",
    title: "Preview",
    content: {
      text: "Preview draft"
    }
  });
  const artifactId = readString(readRecord(artifactResult, "artifact"), "id");
  const mediumApprovalResult = await callMcpHttpTool(baseUrl, roomBody.room.id, sessionBody.session.token, "approval.request", {
    roomId: roomBody.room.id,
    agentId: sessionBody.agent.id,
    taskId,
    artifactId,
    riskLevel: "MEDIUM",
    action: "publish_preview",
    reason: "Expose sandbox URL to room participants",
    payload: {
      previewUrl: "https://preview.example/policy"
    }
  });
  const mediumApprovalId = readString(readRecord(mediumApprovalResult, "approval"), "id");

  const mediumDecisionResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/approvals/${mediumApprovalId}/decision`,
    headers: ownerHeaders,
    payload: {
      status: "APPROVED"
    }
  });
  assert.equal(mediumDecisionResponse.statusCode, 200);

  const mediumPreviewResponse = await postMcpHttp(baseUrl, roomBody.room.id, sessionBody.session.token, {
    jsonrpc: "2.0",
    id: "medium-preview",
    method: "tools/call",
    params: {
      name: "room.set_preview_url",
      arguments: {
        roomId: roomBody.room.id,
        artifactId,
        approvalId: mediumApprovalId,
        previewUrl: "https://preview.example/policy"
      }
    }
  });
  assert.equal(mediumPreviewResponse.status, 200);
  assert.equal(((await mediumPreviewResponse.json()) as { error: { code: number } }).error.code, -32010);

  const previewApprovalResponse = await server.inject({
    method: "PATCH",
    url: `/rooms/${roomBody.room.id}/artifacts/${artifactId}/preview-url`,
    headers: ownerHeaders,
    payload: {
      approvalId: mediumApprovalId,
      previewUrl: "https://preview.example/policy"
    }
  });
  assert.equal(previewApprovalResponse.statusCode, 400);

  const pendingHighApprovalResponse = await server.inject({
    method: "PATCH",
    url: `/rooms/${roomBody.room.id}/artifacts/${artifactId}/preview-url`,
    headers: ownerHeaders,
    payload: {
      previewUrl: "https://preview.example/policy"
    }
  });
  assert.equal(pendingHighApprovalResponse.statusCode, 202);
  const pendingHighApprovalBody = pendingHighApprovalResponse.json<{ approval: { id: string; riskLevel: string } }>();
  assert.equal(pendingHighApprovalBody.approval.riskLevel, "HIGH");

  const highDecisionResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/approvals/${pendingHighApprovalBody.approval.id}/decision`,
    headers: ownerHeaders,
    payload: {
      status: "APPROVED"
    }
  });
  assert.equal(highDecisionResponse.statusCode, 200);

  const publishedPreviewResponse = await server.inject({
    method: "PATCH",
    url: `/rooms/${roomBody.room.id}/artifacts/${artifactId}/preview-url`,
    headers: ownerHeaders,
    payload: {
      approvalId: pendingHighApprovalBody.approval.id,
      previewUrl: "https://preview.example/policy"
    }
  });
  assert.equal(publishedPreviewResponse.statusCode, 200);
  assert.equal(publishedPreviewResponse.json<{ status: string }>().status, "published");
});

test("room MCP rejects preview tools when the agent lacks prototyping capability", async () => {
  const db = createFakeDb();
  const server = buildServer({
    db,
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false
  });

  const ownerHeaders = {
    "x-dev-user-email": "owner@example.com",
    "x-dev-user-name": "Owner"
  };

  const organizationResponse = await server.inject({
    method: "POST",
    url: "/organizations",
    headers: ownerHeaders,
    payload: {
      name: "Acme"
    }
  });
  const organizationBody = organizationResponse.json<{ organization: { id: string } }>();

  const roomResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/rooms`,
    headers: ownerHeaders,
    payload: {
      title: "Capability room"
    }
  });
  const roomBody = roomResponse.json<{ room: { id: string } }>();

  const baseUrl = await server.listen({
    port: 0,
    host: "127.0.0.1"
  });

  const sessionResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/agent-sessions`,
    headers: ownerHeaders,
    payload: {
      name: "Research MCP Agent",
      provider: "MCP",
      capabilities: ["RESEARCH"]
    }
  });
  assert.equal(sessionResponse.statusCode, 201);
  const sessionBody = sessionResponse.json<{
    agent: { id: string };
    session: { token: string };
  }>();

  const createdTask = await callMcpHttpTool(baseUrl, roomBody.room.id, sessionBody.session.token, "room.create_task", {
    roomId: roomBody.room.id,
    agentId: sessionBody.agent.id,
    title: "Research only task",
    riskLevel: "LOW"
  });
  const taskId = readString(readRecord(createdTask, "task"), "id");
  const blockedResponse = await postMcpHttp(baseUrl, roomBody.room.id, sessionBody.session.token, {
    jsonrpc: "2.0",
    id: "preview-without-capability",
    method: "tools/call",
    params: {
      name: "room.create_artifact",
      arguments: {
        roomId: roomBody.room.id,
        agentId: sessionBody.agent.id,
        taskId,
        type: "PREVIEW",
        title: "Preview",
        content: {
          text: "Should not be accepted"
        }
      }
    }
  });

  assert.equal(blockedResponse.status, 200);
  const blockedBody = (await blockedResponse.json()) as { error: { code: number; message: string } };
  assert.equal(blockedBody.error.code, -32011);
  assert.match(blockedBody.error.message, /PROTOTYPING/);
  assert.ok(
    db.agentToolCallRecords.some(
      (toolCall) =>
        toolCall.toolName === "room.create_artifact" &&
        toolCall.status === "FAILED" &&
        toolCall.errorCode === -32011
    )
  );

  const toolCallsResponse = await server.inject({
    method: "GET",
    url: `/rooms/${roomBody.room.id}/tool-calls`,
    headers: ownerHeaders
  });
  assert.equal(toolCallsResponse.statusCode, 200);
  assert.ok(
    toolCallsResponse
      .json<{ toolCalls: Array<{ toolName: string; status: string; errorCode: number | null }> }>()
      .toolCalls.some(
        (toolCall) =>
          toolCall.toolName === "room.create_artifact" &&
          toolCall.status === "FAILED" &&
          toolCall.errorCode === -32011
      )
  );

  await server.close();
});

test("local Codex pairing code can be consumed by the bridge and reach connected status", async (t) => {
  const db = createFakeDb();
  const server = buildServer({
    db,
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false
  });

  const ownerHeaders = {
    "x-dev-user-email": "owner@example.com",
    "x-dev-user-name": "Owner"
  };
  const previousPublicApiUrl = process.env.WORKROOM_PUBLIC_API_URL;
  const previousApiUrl = process.env.WORKROOM_API_URL;
  let bridgeSocket: Awaited<ReturnType<typeof server.injectWS>> | null = null;

  delete process.env.WORKROOM_PUBLIC_API_URL;
  process.env.WORKROOM_API_URL = "http://127.0.0.1:3001";

  t.after(async () => {
    if (previousPublicApiUrl === undefined) {
      delete process.env.WORKROOM_PUBLIC_API_URL;
    } else {
      process.env.WORKROOM_PUBLIC_API_URL = previousPublicApiUrl;
    }

    if (previousApiUrl === undefined) {
      delete process.env.WORKROOM_API_URL;
    } else {
      process.env.WORKROOM_API_URL = previousApiUrl;
    }

    bridgeSocket?.terminate();
    await server.close();
  });

  const organizationResponse = await server.inject({
    method: "POST",
    url: "/organizations",
    headers: ownerHeaders,
    payload: {
      name: "Acme"
    }
  });
  const organizationBody = organizationResponse.json<{ organization: { id: string } }>();

  const roomResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/rooms`,
    headers: ownerHeaders,
    payload: {
      title: "Codex pairing room"
    }
  });
  const roomBody = roomResponse.json<{ room: { id: string } }>();

  await server.listen({
    port: 0,
    host: "127.0.0.1"
  });

  const pairingResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/local-codex/pairing-codes`,
    headers: ownerHeaders
  });
  assert.equal(pairingResponse.statusCode, 201);
  const pairingBody = pairingResponse.json<{
    status: string;
    pairing: { code: string; command: string; status: string };
  }>();
  assert.equal(pairingBody.status, "pairing_pending");
  assert.equal(pairingBody.pairing.status, "PENDING");
  assert.match(pairingBody.pairing.code, /^jcp_/);
  assert.match(pairingBody.pairing.command, /pnpm --filter @jean\/bridge-cli dev pair/);
  assert.match(pairingBody.pairing.command, /--api-url http:\/\/127\.0\.0\.1:3001/);
  assert.equal(pairingBody.pairing.command.includes("room_agent_"), false);
  assert.notEqual(db.localAgentPairingCodeRecords[0]?.codeHash, pairingBody.pairing.code);

  const pendingStatusResponse = await server.inject({
    method: "GET",
    url: `/rooms/${roomBody.room.id}/local-codex/status?code=${encodeURIComponent(pairingBody.pairing.code)}`,
    headers: ownerHeaders
  });
  assert.equal(pendingStatusResponse.statusCode, 200);
  assert.equal(pendingStatusResponse.json<{ status: string }>().status, "pairing_pending");

  const consumeResponse = await server.inject({
    method: "POST",
    url: `/local-codex/pairing-codes/${encodeURIComponent(pairingBody.pairing.code)}/consume`
  });
  assert.equal(consumeResponse.statusCode, 201);
  const consumeBody = consumeResponse.json<{
    roomId: string;
    agent: {
      localAgentKey: string;
      command: string;
      args: string[];
      provider: string;
      transport: string;
    };
    session: {
      agentId: string;
      token: string;
    };
  }>();
  assert.equal(consumeBody.roomId, roomBody.room.id);
  assert.equal(consumeBody.agent.localAgentKey, "codex");
  assert.equal(consumeBody.agent.command, "codex");
  assert.deepEqual(consumeBody.agent.args, ["mcp-server"]);
  assert.equal(consumeBody.agent.provider, "CODEX");
  assert.equal(consumeBody.agent.transport, "mcp_stdio");
  assert.match(consumeBody.session.token, /^room_agent_/);
  assert.equal(db.localAgentPairingCodeRecords[0]?.status, "CONSUMED");
  assert.equal(db.localAgentPairingCodeRecords[0]?.agentId, consumeBody.session.agentId);

  const agentsResponse = await server.inject({
    method: "GET",
    url: `/rooms/${roomBody.room.id}/agents`,
    headers: ownerHeaders
  });
  assert.equal(agentsResponse.statusCode, 200);
  const agentsBody = agentsResponse.json<{
    agents: Array<{ id: string; metadata: Record<string, unknown> }>;
  }>();
  const codexAgent = agentsBody.agents.find((agent) => agent.id === consumeBody.session.agentId);
  assert.equal(codexAgent?.metadata.pairedByUserId, db.localAgentPairingCodeRecords[0]?.createdByUserId);

  const consumedStatusResponse = await server.inject({
    method: "GET",
    url: `/rooms/${roomBody.room.id}/local-codex/status?code=${encodeURIComponent(pairingBody.pairing.code)}`,
    headers: ownerHeaders
  });
  assert.equal(consumedStatusResponse.statusCode, 200);
  assert.equal(consumedStatusResponse.json<{ status: string }>().status, "pairing_pending");

  bridgeSocket = await server.injectWS(
    `/rooms/${roomBody.room.id}/bridge?token=${encodeURIComponent(consumeBody.session.token)}`
  );
  const readyMessage = readSocketMessages<{ type: string; agentId: string }>(bridgeSocket, 1);
  bridgeSocket.send(
    JSON.stringify({
      type: "bridge.hello",
      protocolVersion: "2026-06-17",
      bridgeId: "test-codex-pairing",
      roomId: roomBody.room.id,
      agent: {
        localAgentKey: "codex",
        agentId: consumeBody.session.agentId,
        name: "Codex Local",
        provider: "CODEX",
        transport: "mcp_stdio",
        capabilities: ["CODE_GENERATION", "PROTOTYPING"],
        metadata: {}
      },
      runConfig: {
        timeoutMs: 5000
      }
    })
  );
  assert.equal((await readyMessage)[0]?.type, "bridge.ready");

  const connectedStatusResponse = await server.inject({
    method: "GET",
    url: `/rooms/${roomBody.room.id}/local-codex/status?code=${encodeURIComponent(pairingBody.pairing.code)}`,
    headers: ownerHeaders
  });
  assert.equal(connectedStatusResponse.statusCode, 200);
  const connectedStatusBody = connectedStatusResponse.json<{
    status: string;
    connection: { agent: { agentId: string } };
  }>();
  assert.equal(connectedStatusBody.status, "connected");
  assert.equal(connectedStatusBody.connection.agent.agentId, consumeBody.session.agentId);
});

test("local Codex pairing records auth errors reported by the bridge", async (t) => {
  const db = createFakeDb();
  const server = buildServer({
    db,
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false
  });

  const ownerHeaders = {
    "x-dev-user-email": "owner@example.com",
    "x-dev-user-name": "Owner"
  };

  t.after(async () => {
    await server.close();
  });

  const organizationResponse = await server.inject({
    method: "POST",
    url: "/organizations",
    headers: ownerHeaders,
    payload: {
      name: "Acme"
    }
  });
  const organizationBody = organizationResponse.json<{ organization: { id: string } }>();

  const roomResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/rooms`,
    headers: ownerHeaders,
    payload: {
      title: "Codex auth error room"
    }
  });
  const roomBody = roomResponse.json<{ room: { id: string } }>();

  const pairingResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/local-codex/pairing-codes`,
    headers: ownerHeaders
  });
  assert.equal(pairingResponse.statusCode, 201);
  const pairingCode = pairingResponse.json<{ pairing: { code: string } }>().pairing.code;

  const errorResponse = await server.inject({
    method: "POST",
    url: `/local-codex/pairing-codes/${encodeURIComponent(pairingCode)}/error`,
    payload: {
      status: "CODEX_AUTH_ERROR",
      message: "Codex local auth check failed. Run codex login."
    }
  });
  assert.equal(errorResponse.statusCode, 200);
  assert.equal(db.localAgentPairingCodeRecords[0]?.status, "CODEX_AUTH_ERROR");

  const statusResponse = await server.inject({
    method: "GET",
    url: `/rooms/${roomBody.room.id}/local-codex/status?code=${encodeURIComponent(pairingCode)}`,
    headers: ownerHeaders
  });
  assert.equal(statusResponse.statusCode, 200);
  const statusBody = statusResponse.json<{ status: string; pairing: { errorMessage: string } }>();
  assert.equal(statusBody.status, "codex_auth_error");
  assert.equal(statusBody.pairing.errorMessage, "Codex local auth check failed. Run codex login.");
});

test("local bridge dispatch lets Jean delegate code tasks to a connected bridge agent", async (t) => {
  const db = createFakeDb();
  const server = buildServer({
    db,
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false,
    workerToken: "worker-secret"
  });

  const ownerHeaders = {
    "x-dev-user-email": "owner@example.com",
    "x-dev-user-name": "Owner"
  };
  let bridgeSocket: Awaited<ReturnType<typeof server.injectWS>> | null = null;

  t.after(async () => {
    bridgeSocket?.terminate();
    await server.close();
  });

  const organizationResponse = await server.inject({
    method: "POST",
    url: "/organizations",
    headers: ownerHeaders,
    payload: {
      name: "Acme"
    }
  });
  const organizationBody = organizationResponse.json<{ organization: { id: string } }>();

  const roomResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/rooms`,
    headers: ownerHeaders,
    payload: {
      title: "Bridge room"
    }
  });
  const roomBody = roomResponse.json<{ room: { id: string } }>();

  const baseUrl = await server.listen({
    port: 0,
    host: "127.0.0.1"
  });

  const sessionResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/agent-sessions`,
    headers: ownerHeaders,
    payload: {
      name: "Codex Local",
      provider: "CODEX",
      transport: "STDIO",
      capabilities: ["CODE_GENERATION", "PROTOTYPING"]
    }
  });
  assert.equal(sessionResponse.statusCode, 201);
  const sessionBody = sessionResponse.json<{
    agent: { id: string; name: string };
    session: { token: string };
  }>();

  bridgeSocket = await server.injectWS(
    `/rooms/${roomBody.room.id}/bridge?token=${encodeURIComponent(sessionBody.session.token)}`
  );
  const readyMessage = readSocketMessages<{ type: string; agentId: string }>(bridgeSocket, 1);
  bridgeSocket.send(
    JSON.stringify({
      type: "bridge.hello",
      protocolVersion: "2026-06-17",
      bridgeId: "test-bridge",
      roomId: roomBody.room.id,
      agent: {
        localAgentKey: "codex",
        agentId: sessionBody.agent.id,
        name: "Codex Local",
        provider: "CODEX",
        transport: "mock",
        capabilities: ["CODE_GENERATION", "PROTOTYPING"],
        metadata: {}
      },
      runConfig: {
        timeoutMs: 5000
      }
    })
  );
  const [ready] = await readyMessage;
  assert.equal(ready?.type, "bridge.ready");
  assert.equal(ready?.agentId, sessionBody.agent.id);

  const bridgeRun = new Promise<void>((resolve, reject) => {
    bridgeSocket.once("message", (data) => {
      void (async () => {
        const message = JSON.parse(data.toString()) as {
          type: string;
          requestId: string;
          roomId: string;
          taskId: string;
          artifactId: string;
          title: string;
        };

        assert.equal(message.type, "bridge.task.run");
        bridgeSocket.send(
          JSON.stringify({
            type: "bridge.task.accepted",
            requestId: message.requestId,
            taskId: message.taskId,
            ts: "2026-06-06T12:00:01.000Z"
          })
        );
        await callMcpHttpTool(baseUrl, roomBody.room.id, sessionBody.session.token, "agent.claim_task", {
          roomId: roomBody.room.id,
          agentId: sessionBody.agent.id,
          taskId: message.taskId
        });
        await callMcpHttpTool(baseUrl, roomBody.room.id, sessionBody.session.token, "room.append_log", {
          roomId: roomBody.room.id,
          taskId: message.taskId,
          message: "Codex mock is writing files"
        });
        await callMcpHttpTool(baseUrl, roomBody.room.id, sessionBody.session.token, "room.write_artifact", {
          roomId: roomBody.room.id,
          artifactId: message.artifactId,
          title: message.title,
          status: "READY",
          content: {
            text: "Bridge Codex result",
            files: [
              {
                path: "README.md",
                content: "Generated through jean-bridge"
              }
            ]
          }
        });
        bridgeSocket.send(
          JSON.stringify({
            type: "bridge.task.completed",
            requestId: message.requestId,
            taskId: message.taskId,
            summary: "Bridge Codex result",
            metadata: {
              test: true
            },
            ts: "2026-06-06T12:00:02.000Z"
          })
        );
        resolve();
      })().catch(reject);
    });
  });

  const transcriptResponse = await server.inject({
    method: "POST",
    url: `/internal/rooms/${roomBody.room.id}/events`,
    headers: {
      authorization: "Bearer worker-secret"
    },
    payload: {
      type: "transcript.final",
      roomId: roomBody.room.id,
      speakerId: "user-1",
      text: "Jean code build a pricing card",
      ts: "2026-06-06T12:00:04.000Z",
      startedAt: "2026-06-06T12:00:01.000Z",
      endedAt: "2026-06-06T12:00:04.000Z"
    }
  });

  assert.equal(transcriptResponse.statusCode, 202);
  await bridgeRun;
  assert.equal(db.taskRecords.at(-1)?.assignedAgentId, sessionBody.agent.id);
  assert.equal(db.taskRecords.at(-1)?.status, "COMPLETED");
  assert.equal(db.artifactRecords.at(-1)?.status, "READY");
  assert.equal(db.artifactVersionRecords.at(-1)?.content.text, "Bridge Codex result");
  const logMessages = getTaskLogMessages(db);
  assert.ok(logMessages.includes("Delegated to Codex Local via jean-bridge."));
  assert.ok(logMessages.includes("Codex Local claimed the task."));
  assert.ok(logMessages.includes("Codex mock is writing files"));

});

test("Jean routes prototype tasks to a connected Lovable bridge agent", async (t) => {
  const db = createFakeDb();
  const server = buildServer({
    db,
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false,
    workerToken: "worker-secret"
  });

  const ownerHeaders = {
    "x-dev-user-email": "owner@example.com",
    "x-dev-user-name": "Owner"
  };
  let bridgeSocket: Awaited<ReturnType<typeof server.injectWS>> | null = null;

  t.after(async () => {
    bridgeSocket?.terminate();
    await server.close();
  });

  const organizationResponse = await server.inject({
    method: "POST",
    url: "/organizations",
    headers: ownerHeaders,
    payload: {
      name: "Acme"
    }
  });
  const organizationBody = organizationResponse.json<{ organization: { id: string } }>();

  const roomResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/rooms`,
    headers: ownerHeaders,
    payload: {
      title: "Lovable bridge room"
    }
  });
  const roomBody = roomResponse.json<{ room: { id: string } }>();

  const baseUrl = await server.listen({
    port: 0,
    host: "127.0.0.1"
  });

  const sessionResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/agent-sessions`,
    headers: ownerHeaders,
    payload: {
      name: "Lovable",
      provider: "LOVABLE",
      transport: "STDIO",
      capabilities: ["CODE_GENERATION", "PROTOTYPING"]
    }
  });
  assert.equal(sessionResponse.statusCode, 201);
  const sessionBody = sessionResponse.json<{
    agent: { id: string; name: string };
    session: { token: string };
  }>();
  assert.equal(sessionBody.agent.name, "Lovable");

  bridgeSocket = await server.injectWS(
    `/rooms/${roomBody.room.id}/bridge?token=${encodeURIComponent(sessionBody.session.token)}`
  );
  const readyMessage = readSocketMessages<{ type: string; agentId: string }>(bridgeSocket, 1);
  bridgeSocket.send(
    JSON.stringify({
      type: "bridge.hello",
      protocolVersion: "2026-06-17",
      bridgeId: "test-lovable-bridge",
      roomId: roomBody.room.id,
      agent: {
        localAgentKey: "lovable",
        agentId: sessionBody.agent.id,
        name: "Lovable",
        provider: "LOVABLE",
        transport: "mcp_stdio",
        capabilities: ["CODE_GENERATION", "PROTOTYPING"],
        metadata: {}
      },
      runConfig: {
        timeoutMs: 5000
      }
    })
  );
  const [ready] = await readyMessage;
  assert.equal(ready?.type, "bridge.ready");
  assert.equal(ready?.agentId, sessionBody.agent.id);

  const bridgeRun = new Promise<void>((resolve, reject) => {
    bridgeSocket.once("message", (data) => {
      void (async () => {
        const message = JSON.parse(data.toString()) as {
          type: string;
          requestId: string;
          roomId: string;
          taskId: string;
          artifactId: string;
          taskType: string;
          artifactType: string;
        };

        assert.equal(message.type, "bridge.task.run");
        assert.equal(message.taskType, "prototype");
        assert.equal(message.artifactType, "PREVIEW");
        bridgeSocket.send(
          JSON.stringify({
            type: "bridge.task.accepted",
            requestId: message.requestId,
            taskId: message.taskId,
            ts: "2026-06-06T12:00:01.000Z"
          })
        );
        await callMcpHttpTool(baseUrl, roomBody.room.id, sessionBody.session.token, "agent.claim_task", {
          roomId: roomBody.room.id,
          agentId: sessionBody.agent.id,
          taskId: message.taskId
        });
        await callMcpHttpTool(baseUrl, roomBody.room.id, sessionBody.session.token, "room.write_artifact", {
          roomId: roomBody.room.id,
          artifactId: message.artifactId,
          status: "READY",
          content: {
            provider: "lovable",
            text: "Lovable prototype ready",
            previewUrl: "https://preview.lovable.test/app"
          }
        });
        bridgeSocket.send(
          JSON.stringify({
            type: "bridge.task.completed",
            requestId: message.requestId,
            taskId: message.taskId,
            summary: "Lovable prototype ready",
            metadata: {
              provider: "lovable",
              previewUrl: "https://preview.lovable.test/app"
            },
            ts: "2026-06-06T12:00:02.000Z"
          })
        );
        resolve();
      })().catch(reject);
    });
  });

  const transcriptResponse = await server.inject({
    method: "POST",
    url: `/internal/rooms/${roomBody.room.id}/events`,
    headers: {
      authorization: "Bearer worker-secret"
    },
    payload: {
      type: "transcript.final",
      roomId: roomBody.room.id,
      speakerId: "user-1",
      text: "Jean, crée une preview HTML de dashboard",
      ts: "2026-06-06T12:00:04.000Z",
      startedAt: "2026-06-06T12:00:01.000Z",
      endedAt: "2026-06-06T12:00:04.000Z"
    }
  });

  assert.equal(transcriptResponse.statusCode, 202);
  await bridgeRun;
  assert.equal(db.taskRecords.at(-1)?.assignedAgentId, sessionBody.agent.id);
  assert.equal(db.taskRecords.at(-1)?.status, "COMPLETED");
  assert.equal(db.artifactRecords.at(-1)?.type, "PREVIEW");
  assert.equal(db.artifactRecords.at(-1)?.status, "READY");
  assert.equal(db.artifactVersionRecords.at(-1)?.content.provider, "lovable");
  assert.equal(db.artifactVersionRecords.at(-1)?.content.previewUrl, "https://preview.lovable.test/app");
  const logMessages = getTaskLogMessages(db);
  assert.ok(logMessages.includes("Delegated to Lovable via jean-bridge."));
  assert.ok(logMessages.includes("Lovable claimed the task."));
});

test("local bridge applies artifact files after human approval", async (t) => {
  const db = createFakeDb();
  const server = buildServer({
    db,
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false
  });

  const ownerHeaders = {
    "x-dev-user-email": "owner@example.com",
    "x-dev-user-name": "Owner"
  };
  let bridgeSocket: Awaited<ReturnType<typeof server.injectWS>> | null = null;

  t.after(async () => {
    bridgeSocket?.terminate();
    await server.close();
  });

  const organizationResponse = await server.inject({
    method: "POST",
    url: "/organizations",
    headers: ownerHeaders,
    payload: {
      name: "Acme"
    }
  });
  const organizationBody = organizationResponse.json<{ organization: { id: string } }>();

  const roomResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/rooms`,
    headers: ownerHeaders,
    payload: {
      title: "Local apply room"
    }
  });
  const roomBody = roomResponse.json<{ room: { id: string } }>();

  await server.listen({
    port: 0,
    host: "127.0.0.1"
  });

  const sessionResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/agent-sessions`,
    headers: ownerHeaders,
    payload: {
      name: "Codex Local",
      provider: "CODEX",
      transport: "STDIO",
      capabilities: ["CODE_GENERATION", "PROTOTYPING"]
    }
  });
  assert.equal(sessionResponse.statusCode, 201);
  const sessionBody = sessionResponse.json<{
    agent: { id: string };
    session: { token: string };
  }>();

  bridgeSocket = await server.injectWS(
    `/rooms/${roomBody.room.id}/bridge?token=${encodeURIComponent(sessionBody.session.token)}`
  );
  const readyMessage = readSocketMessages<{ type: string }>(bridgeSocket, 1);
  bridgeSocket.send(
    JSON.stringify({
      type: "bridge.hello",
      protocolVersion: "2026-06-17",
      bridgeId: "test-local-apply",
      roomId: roomBody.room.id,
      agent: {
        localAgentKey: "codex",
        agentId: sessionBody.agent.id,
        name: "Codex Local",
        provider: "CODEX",
        transport: "mock",
        capabilities: ["CODE_GENERATION", "PROTOTYPING"],
        metadata: {}
      },
      runConfig: {
        timeoutMs: 5000
      }
    })
  );
  assert.equal((await readyMessage)[0]?.type, "bridge.ready");

  const taskResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/tasks`,
    headers: ownerHeaders,
    payload: {
      title: "Apply this code",
      artifact: {
        title: "Local apply files",
        type: "CODE",
        content: {
          text: "Files ready",
          files: [
            {
              path: "src/index.html",
              content: "<main>Ready</main>"
            }
          ]
        }
      }
    }
  });
  assert.equal(taskResponse.statusCode, 201);
  const taskBody = taskResponse.json<{ artifact: { id: string } }>();

  const approvalResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/artifacts/${taskBody.artifact.id}/local-actions/apply`,
    headers: ownerHeaders,
    payload: {}
  });
  assert.equal(approvalResponse.statusCode, 202);
  const approvalBody = approvalResponse.json<{
    status: string;
    approval: { id: string; action: string; status: string; payload: { fileCount?: number } };
  }>();
  assert.equal(approvalBody.status, "approval_required");
  assert.equal(approvalBody.approval.action, "apply_to_local_repo");
  assert.equal(approvalBody.approval.status, "PENDING");
  assert.equal(approvalBody.approval.payload.fileCount, 1);

  const decisionResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/approvals/${approvalBody.approval.id}/decision`,
    headers: ownerHeaders,
    payload: {
      status: "APPROVED"
    }
  });
  assert.equal(decisionResponse.statusCode, 200);

  const localActionRun = new Promise<void>((resolve, reject) => {
    bridgeSocket?.once("message", (data) => {
      try {
        const message = JSON.parse(data.toString()) as {
          type: string;
          requestId: string;
          actionType: string;
          artifactId: string;
          files: Array<{ path: string; content: string }>;
        };

        assert.equal(message.type, "bridge.local_action.run");
        assert.equal(message.actionType, "apply_artifact_files");
        assert.deepEqual(
          message.files.map((file) => [file.path, file.content]),
          [["src/index.html", "<main>Ready</main>"]]
        );
        bridgeSocket?.send(
          JSON.stringify({
            type: "bridge.local_action.accepted",
            requestId: message.requestId,
            actionType: message.actionType,
            artifactId: message.artifactId,
            ts: "2026-06-06T12:00:01.000Z"
          })
        );
        bridgeSocket?.send(
          JSON.stringify({
            type: "bridge.local_action.completed",
            requestId: message.requestId,
            actionType: message.actionType,
            artifactId: message.artifactId,
            summary: "Applied 1 file.",
            metadata: {
              fileCount: 1
            },
            ts: "2026-06-06T12:00:02.000Z"
          })
        );
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });

  const applyResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/artifacts/${taskBody.artifact.id}/local-actions/apply`,
    headers: ownerHeaders,
    payload: {}
  });
  await localActionRun;

  assert.equal(applyResponse.statusCode, 200);
  assert.equal(applyResponse.json<{ status: string }>().status, "applied");
  assert.ok(db.auditLogRecords.some((event) => event.action === "LOCAL_ACTION_STARTED"));
  assert.ok(db.auditLogRecords.some((event) => event.action === "LOCAL_ACTION_FINISHED"));

  const checkApprovalResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/artifacts/${taskBody.artifact.id}/local-actions/checks`,
    headers: ownerHeaders,
    payload: {
      checkName: "test"
    }
  });
  assert.equal(checkApprovalResponse.statusCode, 202);
  const checkApprovalBody = checkApprovalResponse.json<{
    approval: { id: string; action: string; payload: { checkName?: string } };
  }>();
  assert.equal(checkApprovalBody.approval.action, "run_local_check");
  assert.equal(checkApprovalBody.approval.payload.checkName, "test");

  const checkDecisionResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/approvals/${checkApprovalBody.approval.id}/decision`,
    headers: ownerHeaders,
    payload: {
      status: "APPROVED"
    }
  });
  assert.equal(checkDecisionResponse.statusCode, 200);

  const localCheckRun = new Promise<void>((resolve, reject) => {
    bridgeSocket?.once("message", (data) => {
      try {
        const message = JSON.parse(data.toString()) as {
          type: string;
          requestId: string;
          actionType: string;
          artifactId: string;
          checkName: string;
        };

        assert.equal(message.type, "bridge.local_action.run");
        assert.equal(message.actionType, "run_check");
        assert.equal(message.checkName, "test");
        bridgeSocket?.send(
          JSON.stringify({
            type: "bridge.local_action.accepted",
            requestId: message.requestId,
            actionType: message.actionType,
            artifactId: message.artifactId,
            ts: "2026-06-06T12:00:03.000Z"
          })
        );
        bridgeSocket?.send(
          JSON.stringify({
            type: "bridge.local_action.completed",
            requestId: message.requestId,
            actionType: message.actionType,
            artifactId: message.artifactId,
            summary: "Check test passed.",
            metadata: {
              checkName: "test"
            },
            ts: "2026-06-06T12:00:04.000Z"
          })
        );
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });

  const checkResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/artifacts/${taskBody.artifact.id}/local-actions/checks`,
    headers: ownerHeaders,
    payload: {
      checkName: "test"
    }
  });
  await localCheckRun;

  assert.equal(checkResponse.statusCode, 200);
  assert.equal(checkResponse.json<{ status: string }>().status, "passed");
});

test("local bridge dispatch supports canceling an in-flight delegated task", async (t) => {
  const db = createFakeDb();
  const server = buildServer({
    db,
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false,
    workerToken: "worker-secret"
  });

  const ownerHeaders = {
    "x-dev-user-email": "owner@example.com",
    "x-dev-user-name": "Owner"
  };
  let bridgeSocket: Awaited<ReturnType<typeof server.injectWS>> | null = null;

  t.after(async () => {
    bridgeSocket?.terminate();
    await server.close();
  });

  const organizationResponse = await server.inject({
    method: "POST",
    url: "/organizations",
    headers: ownerHeaders,
    payload: {
      name: "Acme"
    }
  });
  const organizationBody = organizationResponse.json<{ organization: { id: string } }>();

  const roomResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/rooms`,
    headers: ownerHeaders,
    payload: {
      title: "Bridge cancel room"
    }
  });
  const roomBody = roomResponse.json<{ room: { id: string } }>();

  await server.listen({
    port: 0,
    host: "127.0.0.1"
  });

  const sessionResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/agent-sessions`,
    headers: ownerHeaders,
    payload: {
      name: "Codex Local",
      provider: "CODEX",
      transport: "STDIO",
      capabilities: ["CODE_GENERATION", "PROTOTYPING"]
    }
  });
  assert.equal(sessionResponse.statusCode, 201);
  const sessionBody = sessionResponse.json<{
    agent: { id: string };
    session: { token: string };
  }>();

  bridgeSocket = await server.injectWS(
    `/rooms/${roomBody.room.id}/bridge?token=${encodeURIComponent(sessionBody.session.token)}`
  );
  const readyMessage = readSocketMessages<{ type: string }>(bridgeSocket, 1);
  bridgeSocket.send(
    JSON.stringify({
      type: "bridge.hello",
      protocolVersion: "2026-06-17",
      bridgeId: "test-bridge-cancel",
      roomId: roomBody.room.id,
      agent: {
        localAgentKey: "codex",
        agentId: sessionBody.agent.id,
        name: "Codex Local",
        provider: "CODEX",
        transport: "mock",
        capabilities: ["CODE_GENERATION", "PROTOTYPING"],
        metadata: {}
      },
      runConfig: {
        timeoutMs: 5000
      }
    })
  );
  assert.equal((await readyMessage)[0]?.type, "bridge.ready");

  const taskRun = new Promise<{ requestId: string; taskId: string }>((resolve) => {
    bridgeSocket.once("message", (data) => {
      const message = JSON.parse(data.toString()) as {
        type: string;
        requestId: string;
        taskId: string;
      };

      assert.equal(message.type, "bridge.task.run");
      bridgeSocket.send(
        JSON.stringify({
          type: "bridge.task.accepted",
          requestId: message.requestId,
          taskId: message.taskId,
          ts: "2026-06-06T12:00:01.000Z"
        })
      );
      resolve({
        requestId: message.requestId,
        taskId: message.taskId
      });
    });
  });
  const transcriptResponsePromise = server.inject({
    method: "POST",
    url: `/internal/rooms/${roomBody.room.id}/events`,
    headers: {
      authorization: "Bearer worker-secret"
    },
    payload: {
      type: "transcript.final",
      roomId: roomBody.room.id,
      speakerId: "user-1",
      text: "Jean code build a slow widget",
      ts: "2026-06-06T12:00:04.000Z",
      startedAt: "2026-06-06T12:00:01.000Z",
      endedAt: "2026-06-06T12:00:04.000Z"
    }
  });
  const run = await taskRun;
  const cancelMessage = readSocketMessages<{ type: string; requestId: string; taskId: string }>(bridgeSocket, 1);
  const cancelResponse = await server.inject({
    method: "PATCH",
    url: `/rooms/${roomBody.room.id}/tasks/${run.taskId}/status`,
    headers: ownerHeaders,
    payload: {
      status: "CANCELED"
    }
  });

  assert.equal(cancelResponse.statusCode, 200);
  const [cancel] = await cancelMessage;
  assert.equal(cancel?.type, "bridge.task.cancel");
  assert.equal(cancel?.requestId, run.requestId);
  assert.equal(cancel?.taskId, run.taskId);
  bridgeSocket.send(
    JSON.stringify({
      type: "bridge.task.canceled",
      requestId: run.requestId,
      taskId: run.taskId,
      reason: "Canceled by test",
      ts: "2026-06-06T12:00:02.000Z"
    })
  );
  assert.equal((await transcriptResponsePromise).statusCode, 202);
  assert.equal(db.taskRecords.at(-1)?.status, "CANCELED");

});

test("local bridge marks delegated tasks as bridge_disconnected and can retry after reconnect", async (t) => {
  const db = createFakeDb();
  const server = buildServer({
    db,
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false,
    workerToken: "worker-secret"
  });

  const ownerHeaders = {
    "x-dev-user-email": "owner@example.com",
    "x-dev-user-name": "Owner"
  };
  let bridgeSocket: Awaited<ReturnType<typeof server.injectWS>> | null = null;

  t.after(async () => {
    bridgeSocket?.terminate();
    await server.close();
  });

  const organizationResponse = await server.inject({
    method: "POST",
    url: "/organizations",
    headers: ownerHeaders,
    payload: {
      name: "Acme"
    }
  });
  const organizationBody = organizationResponse.json<{ organization: { id: string } }>();

  const roomResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/rooms`,
    headers: ownerHeaders,
    payload: {
      title: "Bridge disconnect room"
    }
  });
  const roomBody = roomResponse.json<{ room: { id: string } }>();

  const baseUrl = await server.listen({
    port: 0,
    host: "127.0.0.1"
  });

  const sessionResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/agent-sessions`,
    headers: ownerHeaders,
    payload: {
      name: "Codex Local",
      provider: "CODEX",
      transport: "STDIO",
      capabilities: ["CODE_GENERATION", "PROTOTYPING"]
    }
  });
  const sessionBody = sessionResponse.json<{
    agent: { id: string };
    session: { token: string };
  }>();

  bridgeSocket = await server.injectWS(
    `/rooms/${roomBody.room.id}/bridge?token=${encodeURIComponent(sessionBody.session.token)}`
  );
  const initialSocket = bridgeSocket;
  const readyMessage = readSocketMessages<{ type: string }>(initialSocket, 1);
  initialSocket.send(
    JSON.stringify({
      type: "bridge.hello",
      protocolVersion: "2026-06-17",
      bridgeId: "test-bridge-disconnect",
      roomId: roomBody.room.id,
      agent: {
        localAgentKey: "codex",
        agentId: sessionBody.agent.id,
        name: "Codex Local",
        provider: "CODEX",
        transport: "mock",
        capabilities: ["CODE_GENERATION", "PROTOTYPING"],
        metadata: {}
      },
      runConfig: {
        timeoutMs: 5000
      }
    })
  );
  assert.equal((await readyMessage)[0]?.type, "bridge.ready");

  const taskRun = new Promise<void>((resolve) => {
    initialSocket.once("message", (data) => {
      const message = JSON.parse(data.toString()) as {
        type: string;
        requestId: string;
        taskId: string;
      };

      assert.equal(message.type, "bridge.task.run");
      initialSocket.send(
        JSON.stringify({
          type: "bridge.task.accepted",
          requestId: message.requestId,
          taskId: message.taskId,
          ts: "2026-06-06T12:00:01.000Z"
        })
      );
      initialSocket.terminate();
      resolve();
    });
  });
  const transcriptResponsePromise = server.inject({
    method: "POST",
    url: `/internal/rooms/${roomBody.room.id}/events`,
    headers: {
      authorization: "Bearer worker-secret"
    },
    payload: {
      type: "transcript.final",
      roomId: roomBody.room.id,
      speakerId: "user-1",
      text: "Jean code build a resilient widget",
      ts: "2026-06-06T12:00:04.000Z",
      startedAt: "2026-06-06T12:00:01.000Z",
      endedAt: "2026-06-06T12:00:04.000Z"
    }
  });

  await taskRun;
  assert.equal((await transcriptResponsePromise).statusCode, 202);
  const failedTask = db.taskRecords.at(-1);

  assert.equal(failedTask?.status, "FAILED");
  assert.ok(getTaskLogMessages(db).some((message) => message.startsWith("bridge_disconnected:")));

  bridgeSocket = await server.injectWS(
    `/rooms/${roomBody.room.id}/bridge?token=${encodeURIComponent(sessionBody.session.token)}`
  );
  const retrySocket = bridgeSocket;
  const retryReadyMessage = readSocketMessages<{ type: string }>(retrySocket, 1);
  retrySocket.send(
    JSON.stringify({
      type: "bridge.hello",
      protocolVersion: "2026-06-17",
      bridgeId: "test-bridge-retry",
      roomId: roomBody.room.id,
      agent: {
        localAgentKey: "codex",
        agentId: sessionBody.agent.id,
        name: "Codex Local",
        provider: "CODEX",
        transport: "mock",
        capabilities: ["CODE_GENERATION", "PROTOTYPING"],
        metadata: {}
      },
      runConfig: {
        timeoutMs: 5000
      }
    })
  );
  assert.equal((await retryReadyMessage)[0]?.type, "bridge.ready");

  const retryRun = new Promise<void>((resolve, reject) => {
    retrySocket.once("message", (data) => {
      void (async () => {
        const message = JSON.parse(data.toString()) as {
          type: string;
          requestId: string;
          roomId: string;
          taskId: string;
          artifactId: string;
          title: string;
        };

        assert.equal(message.type, "bridge.task.run");
        assert.notEqual(message.taskId, failedTask?.id);
        retrySocket.send(
          JSON.stringify({
            type: "bridge.task.accepted",
            requestId: message.requestId,
            taskId: message.taskId,
            ts: "2026-06-06T12:00:05.000Z"
          })
        );
        await callMcpHttpTool(baseUrl, roomBody.room.id, sessionBody.session.token, "agent.claim_task", {
          roomId: roomBody.room.id,
          agentId: sessionBody.agent.id,
          taskId: message.taskId
        });
        await callMcpHttpTool(baseUrl, roomBody.room.id, sessionBody.session.token, "room.write_artifact", {
          roomId: roomBody.room.id,
          artifactId: message.artifactId,
          title: message.title,
          status: "READY",
          content: {
            text: "Retry Codex result",
            files: [
              {
                path: "index.html",
                content: "<main>Retry preview</main>"
              },
              {
                path: "README.md",
                content: "# Retry"
              }
            ]
          }
        });
        retrySocket.send(
          JSON.stringify({
            type: "bridge.task.completed",
            requestId: message.requestId,
            taskId: message.taskId,
            summary: "Retry Codex result",
            metadata: {
              retry: true
            },
            ts: "2026-06-06T12:00:06.000Z"
          })
        );
        resolve();
      })().catch(reject);
    });
  });
  const retryResponse = await server.inject({
    method: "POST",
    url: `/rooms/${roomBody.room.id}/tasks/${failedTask?.id}/retry`,
    headers: ownerHeaders,
    payload: {
      instruction: "Retry after reconnect."
    }
  });

  assert.equal(retryResponse.statusCode, 201);
  const retryBody = retryResponse.json<{ task: { id: string; title: string }; artifact: { id: string } }>();
  assert.equal(retryBody.task.title, `Retry: ${failedTask?.title}`);
  await retryRun;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(db.taskRecords.find((task) => task.id === retryBody.task.id)?.status, "COMPLETED");
  assert.equal(db.artifactRecords.find((artifact) => artifact.id === retryBody.artifact.id)?.status, "READY");
  assert.equal(db.artifactVersionRecords.at(-1)?.content.text, "Retry Codex result");
  assert.ok(getTaskLogMessages(db).includes(`Retry requested from task ${failedTask?.id}.`));
});

test("Jean creates a task artifact bundle from addressed final transcripts", async () => {
  const db = createFakeDb();
  const server = buildServer({
    db,
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false,
    workerToken: "worker-secret"
  });

  const ownerHeaders = {
    "x-dev-user-email": "owner@example.com",
    "x-dev-user-name": "Owner"
  };

  const organizationResponse = await server.inject({
    method: "POST",
    url: "/organizations",
    headers: ownerHeaders,
    payload: {
      name: "Acme"
    }
  });
  const organizationBody = organizationResponse.json<{ organization: { id: string } }>();

  const roomResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/rooms`,
    headers: ownerHeaders,
    payload: {
      title: "Planning"
    }
  });
  const roomBody = roomResponse.json<{ room: { id: string } }>();

  await server.ready();

  const socket = await server.injectWS(
    `/rooms/${roomBody.room.id}/events?devUserEmail=owner%40example.com&devUserName=Owner`
  );
  const nextMessages = readSocketMessages<{
    eventId?: string;
    type: string;
    artifact?: { latestVersion: { content: Record<string, unknown> } | null };
    log?: { message: string };
    task?: { status: string; title: string };
    text?: string;
  }>(socket, 10);

  const transcriptResponse = await server.inject({
    method: "POST",
    url: `/internal/rooms/${roomBody.room.id}/events`,
    headers: {
      authorization: "Bearer worker-secret"
    },
    payload: {
      type: "transcript.final",
      roomId: roomBody.room.id,
      speakerId: "user-1",
      text: "Jean, crée une spec",
      ts: "2026-06-06T12:00:04.000Z",
      startedAt: "2026-06-06T12:00:01.000Z",
      endedAt: "2026-06-06T12:00:04.000Z"
    }
  });

  assert.equal(transcriptResponse.statusCode, 202);
  assert.equal(db.agentRecords.length, 1);
  assert.equal(db.agentRecords[0]?.name, "Jean");
  assert.equal(db.taskRecords.length, 1);
  assert.equal(db.taskRecords[0]?.title, "Spec");
  assert.equal(db.taskRecords[0]?.createdByAgentId, "agent-1");
  assert.equal(db.artifactRecords.length, 1);
  assert.equal(db.artifactRecords[0]?.type, "DOCUMENT");
  assert.deepEqual(
    db.taskEventRecords.map((event) => event.type),
    [
      "task.created",
      "artifact.created",
      "agent.speech",
      "task.status",
      "task.log",
      "task.log",
      "artifact.patch",
      "task.log",
      "task.status"
    ]
  );
  assert.equal(db.taskRecords[0]?.status, "COMPLETED");
  assert.equal(db.artifactVersionRecords.length, 2);
  assert.equal(typeof db.artifactVersionRecords[1]?.content.text, "string");
  assert.ok(Array.isArray(db.artifactVersionRecords[1]?.content.sections));

  const messages = await nextMessages;
  assert.deepEqual(
    messages.map((message) => message.type),
    [
      "transcript.final",
      "task.created",
      "artifact.created",
      "agent.speech",
      "task.status",
      "task.log",
      "task.log",
      "artifact.patch",
      "task.log",
      "task.status"
    ]
  );
  assert.equal(messages[1]?.task?.title, "Spec");
  assert.equal(messages[3]?.text, "Oui, je crée une spec.");
  assert.equal(messages[4]?.task?.status, "RUNNING");
  assert.equal(messages[5]?.log?.message, "Préparation du contexte de la tâche.");
  assert.equal(messages[9]?.task?.status, "COMPLETED");

  const replayResponse = await server.inject({
    method: "GET",
    url: `/rooms/${roomBody.room.id}/events/replay?afterEventId=${messages[2]?.eventId}`,
    headers: ownerHeaders
  });

  assert.equal(replayResponse.statusCode, 200);
  const replayBody = replayResponse.json<{ events: Array<{ type: string }> }>();
  assert.deepEqual(
    replayBody.events.map((event) => event.type),
    ["agent.speech", "task.status", "task.log", "task.log", "artifact.patch", "task.log", "task.status"]
  );

  socket.terminate();
  await server.close();
});

test("Jean local runner fills research artifacts with mock sources", async () => {
  const previousPerplexityApiKey = process.env.PERPLEXITY_API_KEY;

  delete process.env.PERPLEXITY_API_KEY;

  const db = createFakeDb();
  const server = buildServer({
    db,
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false,
    workerToken: "worker-secret"
  });

  const ownerHeaders = {
    "x-dev-user-email": "owner@example.com",
    "x-dev-user-name": "Owner"
  };

  const organizationResponse = await server.inject({
    method: "POST",
    url: "/organizations",
    headers: ownerHeaders,
    payload: {
      name: "Acme"
    }
  });
  const organizationBody = organizationResponse.json<{ organization: { id: string } }>();

  const roomResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/rooms`,
    headers: ownerHeaders,
    payload: {
      title: "Research room"
    }
  });
  const roomBody = roomResponse.json<{ room: { id: string } }>();

  await server.ready();

  const socket = await server.injectWS(
    `/rooms/${roomBody.room.id}/events?devUserEmail=owner%40example.com&devUserName=Owner`
  );
  const nextMessages = readSocketMessages<{
    type: string;
    artifact?: { type: string; latestVersion: { content: Record<string, unknown> } | null };
    task?: { status: string; title: string };
  }>(socket, 10);

  const transcriptResponse = await server.inject({
    method: "POST",
    url: `/internal/rooms/${roomBody.room.id}/events`,
    headers: {
      authorization: "Bearer worker-secret"
    },
    payload: {
      type: "transcript.final",
      roomId: roomBody.room.id,
      speakerId: "user-1",
      text: "Jean, fais une recherche sur LiveKit",
      ts: "2026-06-06T12:00:04.000Z",
      startedAt: "2026-06-06T12:00:01.000Z",
      endedAt: "2026-06-06T12:00:04.000Z"
    }
  });

  assert.equal(transcriptResponse.statusCode, 202);
  assert.equal(db.taskRecords[0]?.title, "Research: LiveKit");
  assert.equal(db.taskRecords[0]?.status, "COMPLETED");
  assert.equal(db.artifactRecords[0]?.type, "RESEARCH");
  assert.equal(db.artifactVersionRecords.length, 2);
  assert.equal(db.artifactVersionRecords[1]?.content.summary, "Synthèse locale provisoire sur LiveKit.");
  assert.ok(Array.isArray(db.artifactVersionRecords[1]?.content.sources));

  const messages = await nextMessages;
  assert.deepEqual(
    messages.map((message) => message.type),
    [
      "transcript.final",
      "task.created",
      "artifact.created",
      "agent.speech",
      "task.status",
      "task.log",
      "task.log",
      "artifact.patch",
      "task.log",
      "task.status"
    ]
  );
  assert.equal(messages[2]?.artifact?.type, "RESEARCH");
  assert.equal(messages[7]?.artifact?.latestVersion?.content.summary, "Synthèse locale provisoire sur LiveKit.");
  assert.equal(messages[9]?.task?.status, "COMPLETED");

  socket.terminate();
  await server.close();

  if (previousPerplexityApiKey) {
    process.env.PERPLEXITY_API_KEY = previousPerplexityApiKey;
  }
});

test("Jean routes prototype tasks to v0 when an API key is configured", async () => {
  const previousFetch = globalThis.fetch;
  const previousV0ApiKey = process.env.V0_API_KEY;
  const previousV0Model = process.env.V0_MODEL;
  const previousV0BaseUrl = process.env.V0_API_BASE_URL;
  const requests: Array<{ body: Record<string, unknown>; url: string }> = [];

  process.env.V0_API_KEY = "test-v0-key";
  process.env.V0_MODEL = "v0-1.5-md";
  process.env.V0_API_BASE_URL = "https://api.v0.example/v1";
  globalThis.fetch = (async (url, init) => {
    requests.push({
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
      url: String(url)
    });

    return new Response(
      JSON.stringify({
        id: "chat-v0-route",
        webUrl: "https://v0.dev/chat/chat-v0-route",
        latestVersion: {
          id: "version-v0-route",
          files: [
            {
              path: "app/page.tsx",
              content: "export default function Page() { return <main>Prototype v0</main>; }"
            }
          ],
          previewUrl: "https://preview.v0.dev/chat-v0-route"
        }
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      }
    );
  }) as typeof fetch;

  const db = createFakeDb();
  const server = buildServer({
    db,
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false,
    workerToken: "worker-secret"
  });

  const ownerHeaders = {
    "x-dev-user-email": "owner@example.com",
    "x-dev-user-name": "Owner"
  };

  try {
    const organizationResponse = await server.inject({
      method: "POST",
      url: "/organizations",
      headers: ownerHeaders,
      payload: {
        name: "Acme"
      }
    });
    const organizationBody = organizationResponse.json<{ organization: { id: string } }>();

    const roomResponse = await server.inject({
      method: "POST",
      url: `/organizations/${organizationBody.organization.id}/rooms`,
      headers: ownerHeaders,
      payload: {
        title: "v0 prototype room"
      }
    });
    const roomBody = roomResponse.json<{ room: { id: string } }>();

    await server.ready();

    const socket = await server.injectWS(
      `/rooms/${roomBody.room.id}/events?devUserEmail=owner%40example.com&devUserName=Owner`
    );
    const nextMessages = readSocketMessages<{
      type: string;
      artifact?: { latestVersion: { content: Record<string, unknown> } | null; type: string };
      log?: { message: string };
      previewUrl?: string;
      task?: { status: string; title: string };
    }>(socket, 10);

    const transcriptResponse = await server.inject({
      method: "POST",
      url: `/internal/rooms/${roomBody.room.id}/events`,
      headers: {
        authorization: "Bearer worker-secret"
      },
      payload: {
        type: "transcript.final",
        roomId: roomBody.room.id,
        speakerId: "user-1",
        text: "Jean, crée une preview v0 de dashboard",
        ts: "2026-06-06T12:00:04.000Z",
        startedAt: "2026-06-06T12:00:01.000Z",
        endedAt: "2026-06-06T12:00:04.000Z"
      }
    });

    assert.equal(transcriptResponse.statusCode, 202);
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.url, "https://api.v0.example/v1/chats");
    assert.equal(requests[0]?.body.model, "v0-1.5-md");
    assert.match(String(requests[0]?.body.message), /preview v0 de dashboard/);
    assert.equal(db.taskRecords[0]?.title, "Prototype");
    assert.equal(db.taskRecords[0]?.status, "COMPLETED");
    assert.equal(db.artifactRecords[0]?.type, "PREVIEW");
    assert.equal(db.artifactVersionRecords[1]?.content.provider, "v0");
    assert.equal(db.artifactVersionRecords[2]?.content.previewUrl, "https://preview.v0.dev/chat-v0-route");

    const messages = await nextMessages;

    assert.deepEqual(
      messages.map((message) => message.type),
      [
        "transcript.final",
        "task.created",
        "artifact.created",
        "agent.speech",
        "task.status",
        "task.log",
        "task.log",
        "artifact.patch",
        "artifact.preview_url",
        "task.status"
      ]
    );
    assert.equal(messages[2]?.artifact?.type, "PREVIEW");
    assert.equal(messages[5]?.log?.message, "v0 generation is running.");
    assert.equal(messages[7]?.artifact?.latestVersion?.content.provider, "v0");
    assert.equal(messages[8]?.previewUrl, "https://preview.v0.dev/chat-v0-route");
    assert.equal(messages[9]?.task?.status, "COMPLETED");

    socket.terminate();
  } finally {
    await server.close();
    globalThis.fetch = previousFetch;

    if (previousV0ApiKey) {
      process.env.V0_API_KEY = previousV0ApiKey;
    } else {
      delete process.env.V0_API_KEY;
    }

    if (previousV0Model) {
      process.env.V0_MODEL = previousV0Model;
    } else {
      delete process.env.V0_MODEL;
    }

    if (previousV0BaseUrl) {
      process.env.V0_API_BASE_URL = previousV0BaseUrl;
    } else {
      delete process.env.V0_API_BASE_URL;
    }
  }
});

test("Jean routes prototype tasks to E2B and publishes a preview URL", async () => {
  const providerInputs: Array<{ objective: string; title: string }> = [];
  const fakeE2BProvider: SandboxProvider = {
    async *runPrototype(input) {
      providerInputs.push(input);

      yield {
        type: "log",
        message: "Sandbox E2B prêt: sandbox-test."
      };
      yield {
        type: "artifact.patch",
        patch: {
          provider: "e2b",
          sandboxId: "sandbox-test",
          text: `Preview E2B générée pour: ${input.objective}.`,
          files: [
            {
              path: "index.html",
              content: "<!doctype html><div id=\"root\">Preview</div>"
            }
          ]
        }
      };
      yield {
        type: "log",
        message: "Serveur de preview E2B lancé."
      };
      yield {
        type: "artifact.preview_url",
        previewUrl: "https://3000-sandbox-test.e2b.app"
      };
    }
  };
  const e2bConnector = createE2BConnector({
    provider: fakeE2BProvider
  });

  assert.ok(e2bConnector);

  const db = createFakeDb();
  const server = buildServer({
    agentConnectors: [e2bConnector],
    db,
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false,
    workerToken: "worker-secret"
  });

  const ownerHeaders = {
    "x-dev-user-email": "owner@example.com",
    "x-dev-user-name": "Owner"
  };

  const organizationResponse = await server.inject({
    method: "POST",
    url: "/organizations",
    headers: ownerHeaders,
    payload: {
      name: "Acme"
    }
  });
  const organizationBody = organizationResponse.json<{ organization: { id: string } }>();

  const roomResponse = await server.inject({
    method: "POST",
    url: `/organizations/${organizationBody.organization.id}/rooms`,
    headers: ownerHeaders,
    payload: {
      title: "Prototype room"
    }
  });
  const roomBody = roomResponse.json<{ room: { id: string } }>();

  await server.ready();

  const socket = await server.injectWS(
    `/rooms/${roomBody.room.id}/events?devUserEmail=owner%40example.com&devUserName=Owner`
  );
  const nextMessages = readSocketMessages<{
    type: string;
    artifact?: { type: string; latestVersion: { content: Record<string, unknown> } | null };
    log?: { message: string };
    previewUrl?: string;
    task?: { status: string; title: string };
  }>(socket, 11);

  const transcriptResponse = await server.inject({
    method: "POST",
    url: `/internal/rooms/${roomBody.room.id}/events`,
    headers: {
      authorization: "Bearer worker-secret"
    },
    payload: {
      type: "transcript.final",
      roomId: roomBody.room.id,
      speakerId: "user-1",
      text: "Jean, crée une preview HTML de dashboard",
      ts: "2026-06-06T12:00:04.000Z",
      startedAt: "2026-06-06T12:00:01.000Z",
      endedAt: "2026-06-06T12:00:04.000Z"
    }
  });

  assert.equal(transcriptResponse.statusCode, 202);
  assert.deepEqual(providerInputs, [
    {
      objective: "crée une preview HTML de dashboard",
      title: "Prototype"
    }
  ]);
  assert.equal(db.taskRecords[0]?.title, "Prototype");
  assert.equal(db.taskRecords[0]?.status, "COMPLETED");
  assert.equal(db.artifactRecords[0]?.type, "PREVIEW");
  assert.equal(db.artifactVersionRecords.length, 3);
  assert.equal(db.artifactVersionRecords[1]?.content.provider, "e2b");
  assert.equal(db.artifactVersionRecords[2]?.content.previewUrl, "https://3000-sandbox-test.e2b.app");

  const messages = await nextMessages;
  assert.deepEqual(
    messages.map((message) => message.type),
    [
      "transcript.final",
      "task.created",
      "artifact.created",
      "agent.speech",
      "task.status",
      "task.log",
      "task.log",
      "artifact.patch",
      "task.log",
      "artifact.preview_url",
      "task.status"
    ]
  );
  assert.equal(messages[2]?.artifact?.type, "PREVIEW");
  assert.equal(messages[5]?.log?.message, "Préparation de la preview E2B.");
  assert.equal(messages[7]?.artifact?.latestVersion?.content.provider, "e2b");
  assert.equal(messages[9]?.previewUrl, "https://3000-sandbox-test.e2b.app");
  assert.equal(messages[10]?.task?.status, "COMPLETED");

  socket.terminate();
  await server.close();
});

test("Jean routes research tasks to Perplexity when an API key is configured", async () => {
  const previousFetch = globalThis.fetch;
  const previousPerplexityApiKey = process.env.PERPLEXITY_API_KEY;
  const previousPerplexityModel = process.env.PERPLEXITY_MODEL;
  const requests: Array<{ url: string; body: unknown }> = [];

  process.env.PERPLEXITY_API_KEY = "test-perplexity-key";
  process.env.PERPLEXITY_MODEL = "sonar-pro";
  globalThis.fetch = (async (url, init) => {
    requests.push({
      url: String(url),
      body: init?.body ? JSON.parse(String(init.body)) : null
    });

    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content:
                "LiveKit est une plateforme temps réel pour audio, vidéo et données.\n\nElle est utilisée pour construire des expériences de communication live."
            }
          }
        ],
        search_results: [
          {
            title: "LiveKit Docs",
            url: "https://docs.livekit.io/",
            snippet: "LiveKit documentation."
          }
        ],
        citations: ["https://docs.livekit.io/"]
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      }
    );
  }) as typeof fetch;

  const db = createFakeDb();
  const server = buildServer({
    db,
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false,
    workerToken: "worker-secret"
  });

  try {
    const ownerHeaders = {
      "x-dev-user-email": "owner@example.com",
      "x-dev-user-name": "Owner"
    };

    const organizationResponse = await server.inject({
      method: "POST",
      url: "/organizations",
      headers: ownerHeaders,
      payload: {
        name: "Acme"
      }
    });
    const organizationBody = organizationResponse.json<{ organization: { id: string } }>();

    const roomResponse = await server.inject({
      method: "POST",
      url: `/organizations/${organizationBody.organization.id}/rooms`,
      headers: ownerHeaders,
      payload: {
        title: "Perplexity room"
      }
    });
    const roomBody = roomResponse.json<{ room: { id: string } }>();

    await server.ready();

    const socket = await server.injectWS(
      `/rooms/${roomBody.room.id}/events?devUserEmail=owner%40example.com&devUserName=Owner`
    );
    const nextMessages = readSocketMessages<{
      type: string;
      artifact?: { latestVersion: { content: Record<string, unknown> } | null };
      log?: { message: string };
      task?: { status: string };
    }>(socket, 9);

    const transcriptResponse = await server.inject({
      method: "POST",
      url: `/internal/rooms/${roomBody.room.id}/events`,
      headers: {
        authorization: "Bearer worker-secret"
      },
      payload: {
        type: "transcript.final",
        roomId: roomBody.room.id,
        speakerId: "user-1",
        text: "Jean, fais une recherche sur LiveKit",
        ts: "2026-06-06T12:00:04.000Z",
        startedAt: "2026-06-06T12:00:01.000Z",
        endedAt: "2026-06-06T12:00:04.000Z"
      }
    });

    assert.equal(transcriptResponse.statusCode, 202);
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.url, "https://api.perplexity.ai/chat/completions");
    assert.equal(db.taskRecords[0]?.status, "COMPLETED");
    assert.equal(db.artifactRecords[0]?.type, "RESEARCH");
    assert.equal(db.artifactVersionRecords[1]?.content.provider, "perplexity");
    assert.equal(db.artifactVersionRecords[1]?.content.model, "sonar-pro");
    assert.deepEqual(db.artifactVersionRecords[1]?.content.sources, [
      {
        title: "LiveKit Docs",
        url: "https://docs.livekit.io/"
      }
    ]);

    const messages = await nextMessages;
    assert.deepEqual(
      messages.map((message) => message.type),
      [
        "transcript.final",
        "task.created",
        "artifact.created",
        "agent.speech",
        "task.status",
        "task.log",
        "task.log",
        "artifact.patch",
        "task.status"
      ]
    );
    assert.equal(messages[5]?.log?.message, "Recherche Perplexity en cours.");
    assert.equal(messages[7]?.artifact?.latestVersion?.content.provider, "perplexity");
    assert.equal(messages[8]?.task?.status, "COMPLETED");

    socket.terminate();
  } finally {
    await server.close();
    globalThis.fetch = previousFetch;

    if (previousPerplexityApiKey) {
      process.env.PERPLEXITY_API_KEY = previousPerplexityApiKey;
    } else {
      delete process.env.PERPLEXITY_API_KEY;
    }

    if (previousPerplexityModel) {
      process.env.PERPLEXITY_MODEL = previousPerplexityModel;
    } else {
      delete process.env.PERPLEXITY_MODEL;
    }
  }
});

test("room event ingestion rejects invalid events and invalid worker tokens", async () => {
  const server = buildServer({
    db: createFakeDb(),
    liveKitTokenIssuer: createFakeLiveKitTokenIssuer(),
    logger: false,
    workerToken: "worker-secret"
  });

  const invalidTokenResponse = await server.inject({
    method: "POST",
    url: "/internal/rooms/room-1/events",
    headers: {
      authorization: "Bearer wrong-secret"
    },
    payload: {
      type: "transcript.partial",
      roomId: "room-1",
      speakerId: "user-1",
      text: "Hello",
      ts: "2026-06-06T12:00:00.000Z"
    }
  });

  assert.equal(invalidTokenResponse.statusCode, 401);

  const invalidEventResponse = await server.inject({
    method: "POST",
    url: "/internal/rooms/room-1/events",
    headers: {
      authorization: "Bearer worker-secret"
    },
    payload: {
      type: "transcript.partial",
      roomId: "room-2",
      speakerId: "user-1",
      text: "Hello",
      ts: "2026-06-06T12:00:00.000Z"
    }
  });

  assert.equal(invalidEventResponse.statusCode, 400);

  await server.close();
});

type FakeLiveKitTokenIssuer = LiveKitTokenIssuer & {
  requests: LiveKitTokenRequest[];
};

function createFakeLiveKitTokenIssuer(): FakeLiveKitTokenIssuer {
  const requests: LiveKitTokenRequest[] = [];

  return {
    serverUrl: "wss://livekit.example.test",
    requests,
    async issueRoomToken(request) {
      requests.push(request);

      return `token:${request.roomId}:${request.userId}`;
    }
  };
}

type TestWebSocket = {
  once(event: "message", listener: (data: { toString(): string }) => void): void;
  terminate(): void;
};

function readSocketMessages<T extends Record<string, unknown>>(socket: TestWebSocket, count: number): Promise<T[]> {
  const messages: T[] = [];

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for room events.")), 1000);
    const readNext = () => {
      socket.once("message", (data) => {
        messages.push(JSON.parse(data.toString()) as T);

        if (messages.length === count) {
          clearTimeout(timeout);
          resolve(messages);
          return;
        }

        readNext();
      });
    };

    readNext();
  });
}

function getTaskLogMessages(db: ReturnType<typeof createFakeDb>): string[] {
  return db.taskEventRecords
    .filter((event) => event.type === "task.log")
    .map((event) => event.payload?.message)
    .filter((message): message is string => typeof message === "string");
}

async function callMcpHttpTool(
  baseUrl: string,
  roomId: string,
  token: string,
  name: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const response = await postMcpHttp(baseUrl, roomId, token, {
    jsonrpc: "2.0",
    id: name,
    method: "tools/call",
    params: {
      name,
      arguments: args
    }
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    result?: { structuredContent: Record<string, unknown> };
    error?: { message: string };
  };

  assert.equal(body.error, undefined);
  assert.ok(body.result);

  return body.result.structuredContent;
}

function postMcpHttp(baseUrl: string, roomId: string, token: string, payload: Record<string, unknown>) {
  return fetch(`${baseUrl}/rooms/${roomId}/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

function readRecord(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);

  return value as Record<string, unknown>;
}

function readArray(record: Record<string, unknown>, key: string): Array<Record<string, unknown>> {
  const value = record[key];
  assert.ok(Array.isArray(value));

  return value as Array<Record<string, unknown>>;
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  assert.equal(typeof value, "string");

  return value as string;
}

function createPrismaUniqueConstraintError(): Error & { code: string } {
  const error = new Error("Unique constraint failed.") as Error & { code: string };

  error.code = "P2002";

  return error;
}

function createFakeDb(): FakeApiDatabase {
  const now = new Date("2026-06-06T12:00:00.000Z");
  const users: FakeUser[] = [];
  const organizations: FakeOrganization[] = [];
  const memberships: FakeOrganizationMember[] = [];
  const rooms: FakeRoom[] = [];
  const participants: FakeRoomParticipant[] = [];
  const agents: FakeAgent[] = [];
  const agentConnections: FakeAgentConnection[] = [];
  const agentRuns: FakeAgentRun[] = [];
  const agentRunEvents: FakeAgentRunEvent[] = [];
  const agentToolCalls: FakeAgentToolCall[] = [];
  const localAgentPairingCodes: FakeLocalAgentPairingCode[] = [];
  const tasks: FakeTask[] = [];
  const taskEvents: FakeTaskEvent[] = [];
  const artifacts: FakeArtifact[] = [];
  const artifactVersions: FakeArtifactVersion[] = [];
  const artifactFiles: FakeArtifactFile[] = [];
  const artifactFileVersions: FakeArtifactFileVersion[] = [];
  const artifactFileDiffs: FakeArtifactFileDiff[] = [];
  const organizationPolicyRuleOverrides: FakeOrganizationPolicyRuleOverride[] = [];
  const billingWaitlistEntries: FakeBillingWaitlistEntry[] = [];
  const providerCostEntries: FakeProviderCostEntry[] = [];
  const providerExchangeRates: FakeProviderExchangeRate[] = [];
  const roomComments: FakeRoomComment[] = [];
  const sandboxSessions: FakeSandboxSession[] = [];
  const approvals: FakeApproval[] = [];
  const auditLogs: FakeAuditLog[] = [];
  const transcriptSegments: FakeTranscriptSegment[] = [];

  const db = {
    agent: {
      async findFirst(params: { where: { organizationId: string; name: string; provider: FakeAgent["provider"] } }) {
        return (
          agents.find(
            (agent) =>
              agent.organizationId === params.where.organizationId &&
              agent.name === params.where.name &&
              agent.provider === params.where.provider
          ) ?? null
        );
      },
      async create(params: {
        data: {
          organizationId: string;
          name: string;
          provider: FakeAgent["provider"];
          capabilities: FakeAgent["capabilities"];
        };
      }) {
        const agent: FakeAgent = {
          id: `agent-${agents.length + 1}`,
          organizationId: params.data.organizationId,
          name: params.data.name,
          provider: params.data.provider,
          capabilities: params.data.capabilities,
          createdAt: now,
          updatedAt: now
        };

        agents.push(agent);

        return agent;
      },
      async findMany(params: { where: { organizationId: string } }) {
        return agents.filter((agent) => agent.organizationId === params.where.organizationId);
      }
    },
    agentConnection: {
      async findFirst(params: { where: { id: string; agentId: string } }) {
        return (
          agentConnections.find(
            (connection) => connection.id === params.where.id && connection.agentId === params.where.agentId
          ) ?? null
        );
      },
      async findMany(params: {
        where: { agentId: { in: string[] } };
        orderBy?: { createdAt: "asc" | "desc" };
      }) {
        return sortByCreatedAt(
          agentConnections.filter((connection) => params.where.agentId.in.includes(connection.agentId)),
          params.orderBy?.createdAt
        );
      },
      async create(params: {
        data: {
          agentId: string;
          transport: FakeAgentConnection["transport"];
          endpoint: string | null;
        };
      }) {
        const connection: FakeAgentConnection = {
          id: `agent-connection-${agentConnections.length + 1}`,
          agentId: params.data.agentId,
          transport: params.data.transport,
          endpoint: params.data.endpoint,
          createdAt: now,
          updatedAt: now
        };

        agentConnections.push(connection);

        return connection;
      }
    },
    agentRun: {
      async create(params: {
        data: {
          roomId: string;
          taskId: string | null;
          agentId: string;
          ownerUserId: string | null;
          status: FakeAgentRun["status"];
          metadata: Record<string, unknown>;
        };
      }) {
        const agentRun: FakeAgentRun = {
          id: `agent-run-${agentRuns.length + 1}`,
          roomId: params.data.roomId,
          taskId: params.data.taskId,
          agentId: params.data.agentId,
          ownerUserId: params.data.ownerUserId,
          status: params.data.status,
          startedAt: new Date(now.getTime() + agentRuns.length + 1),
          finishedAt: null,
          summary: null,
          metadata: params.data.metadata,
          createdAt: new Date(now.getTime() + agentRuns.length + 1),
          updatedAt: new Date(now.getTime() + agentRuns.length + 1)
        };

        agentRuns.push(agentRun);

        return agentRun;
      },
      async findFirst(params: { where: { id: string; roomId: string; agentId: string } }) {
        return (
          agentRuns.find(
            (run) => run.id === params.where.id && run.roomId === params.where.roomId && run.agentId === params.where.agentId
          ) ?? null
        );
      },
      async update(params: {
        where: { id: string };
        data: {
          status: FakeAgentRun["status"];
          finishedAt: Date;
          summary: string | null;
        };
      }) {
        const run = agentRuns.find((candidate) => candidate.id === params.where.id);

        if (!run) {
          throw new Error("Agent run not found.");
        }

        run.status = params.data.status;
        run.finishedAt = params.data.finishedAt;
        run.summary = params.data.summary;
        run.updatedAt = params.data.finishedAt;

        return run;
      }
    },
    agentRunEvent: {
      async create(params: {
        data: {
          roomId: string;
          taskId: string | null;
          artifactId: string | null;
          runId: string;
          agentId: string;
          ownerUserId: string | null;
          type: string;
          severity: string;
          visibility: string;
          payload: Record<string, unknown>;
        };
      }) {
        const agentRunEvent: FakeAgentRunEvent = {
          id: `agent-run-event-${agentRunEvents.length + 1}`,
          roomId: params.data.roomId,
          taskId: params.data.taskId,
          artifactId: params.data.artifactId,
          runId: params.data.runId,
          agentId: params.data.agentId,
          ownerUserId: params.data.ownerUserId,
          type: params.data.type,
          severity: params.data.severity,
          visibility: params.data.visibility,
          payload: params.data.payload,
          createdAt: new Date(now.getTime() + agentRunEvents.length + 1)
        };

        agentRunEvents.push(agentRunEvent);

        return agentRunEvent;
      },
      async findFirst(params: { where: { id: string; roomId: string } }) {
        return (
          agentRunEvents.find(
            (event) => event.id === params.where.id && event.roomId === params.where.roomId
          ) ?? null
        );
      }
    },
    localAgentPairingCode: {
      async create(params: {
        data: {
          roomId: string;
          createdByUserId: string;
          codeHash: string;
          status: FakeLocalAgentPairingCode["status"];
          expiresAt: Date;
        };
      }) {
        const pairing: FakeLocalAgentPairingCode = {
          id: `pairing-${localAgentPairingCodes.length + 1}`,
          roomId: params.data.roomId,
          createdByUserId: params.data.createdByUserId,
          agentId: null,
          codeHash: params.data.codeHash,
          status: params.data.status,
          errorMessage: null,
          expiresAt: params.data.expiresAt,
          consumedAt: null,
          createdAt: new Date(now.getTime() + localAgentPairingCodes.length + 1),
          updatedAt: new Date(now.getTime() + localAgentPairingCodes.length + 1)
        };

        localAgentPairingCodes.push(pairing);

        return pairing;
      },
      async findUnique(params: { where: { codeHash: string } }) {
        return localAgentPairingCodes.find((pairing) => pairing.codeHash === params.where.codeHash) ?? null;
      },
      async findFirst(params: { where: { roomId: string }; orderBy?: { createdAt: "asc" | "desc" } }) {
        return (
          sortByCreatedAt(
            localAgentPairingCodes.filter((pairing) => pairing.roomId === params.where.roomId),
            params.orderBy?.createdAt
          )[0] ?? null
        );
      },
      async findMany(params: {
        where: { roomId: string; agentId?: { in: string[] } };
        orderBy?: { createdAt: "asc" | "desc" };
      }) {
        return sortByCreatedAt(
          localAgentPairingCodes.filter(
            (pairing) =>
              pairing.roomId === params.where.roomId &&
              (!params.where.agentId || (pairing.agentId !== null && params.where.agentId.in.includes(pairing.agentId)))
          ),
          params.orderBy?.createdAt
        );
      },
      async update(params: {
        where: { id: string };
        data: {
          agentId?: string;
          consumedAt?: Date;
          errorMessage?: string | null;
          status?: FakeLocalAgentPairingCode["status"];
        };
      }) {
        const pairing = localAgentPairingCodes.find((candidate) => candidate.id === params.where.id);

        if (!pairing) {
          throw new Error("Local agent pairing code not found.");
        }

        if (params.data.agentId !== undefined) {
          pairing.agentId = params.data.agentId;
        }

        if (params.data.consumedAt !== undefined) {
          pairing.consumedAt = params.data.consumedAt;
        }

        if (params.data.errorMessage !== undefined) {
          pairing.errorMessage = params.data.errorMessage;
        }

        if (params.data.status !== undefined) {
          pairing.status = params.data.status;
        }

        pairing.updatedAt = now;

        return pairing;
      }
    },
    user: {
      async upsert(params: {
        where: { email: string };
        create: { email: string; name: string | null };
        update: { name: string | null };
      }) {
        const existing = users.find((user) => user.email === params.where.email);

        if (existing) {
          existing.name = params.update.name;
          existing.updatedAt = now;
          return existing;
        }

        const user: FakeUser = {
          id: `user-${users.length + 1}`,
          email: params.create.email,
          name: params.create.name,
          createdAt: now,
          updatedAt: now
        };

        users.push(user);

        return user;
      }
    },
    organization: {
      async create(params: { data: { name: string; members: { create: { userId: string; role: "OWNER" } } } }) {
        const organization: FakeOrganization = {
          id: `org-${organizations.length + 1}`,
          name: params.data.name,
          createdAt: now,
          updatedAt: now
        };

        organizations.push(organization);
        memberships.push({
          id: `member-${memberships.length + 1}`,
          organizationId: organization.id,
          userId: params.data.members.create.userId,
          role: params.data.members.create.role,
          createdAt: now,
          updatedAt: now
        });

        return organization;
      },
      async findMany(params: { where: { members: { some: { userId: string } } }; orderBy: { createdAt: "desc" } }) {
        const userOrganizationIds = memberships
          .filter((membership) => membership.userId === params.where.members.some.userId)
          .map((membership) => membership.organizationId);

        return organizations.filter((organization) => userOrganizationIds.includes(organization.id));
      }
    },
    organizationMember: {
      async findUnique(params: { where: { organizationId_userId: { organizationId: string; userId: string } } }) {
        return (
          memberships.find(
            (membership) =>
              membership.organizationId === params.where.organizationId_userId.organizationId &&
              membership.userId === params.where.organizationId_userId.userId
          ) ?? null
        );
      },
      async findMany(params: {
        where: { organizationId: string };
        include?: { user: { select: { id: boolean; email: boolean; name: boolean } } };
        orderBy?: { createdAt: "asc" | "desc" };
      }) {
        const matchingMemberships = sortByCreatedAt(
          memberships.filter((membership) => membership.organizationId === params.where.organizationId),
          params.orderBy?.createdAt
        );

        if (!params.include?.user) {
          return matchingMemberships;
        }

        return matchingMemberships.map((membership) => ({
          ...membership,
          user: users.find((user) => user.id === membership.userId) ?? {
            id: membership.userId,
            email: "missing@example.com",
            name: null
          }
        }));
      },
      async upsert(params: {
        where: { organizationId_userId: { organizationId: string; userId: string } };
        create: { organizationId: string; userId: string; role: "MEMBER" };
        update: Record<string, never>;
      }) {
        const existing =
          memberships.find(
            (membership) =>
              membership.organizationId === params.where.organizationId_userId.organizationId &&
              membership.userId === params.where.organizationId_userId.userId
          ) ?? null;

        if (existing) {
          return existing;
        }

        const membership: FakeOrganizationMember = {
          id: `member-${memberships.length + 1}`,
          organizationId: params.create.organizationId,
          userId: params.create.userId,
          role: params.create.role,
          createdAt: now,
          updatedAt: now
        };

        memberships.push(membership);

        return membership;
      },
      async update(params: {
        where: { organizationId_userId: { organizationId: string; userId: string } };
        data: { role: FakeOrganizationMember["role"] };
        include?: { user: { select: { id: boolean; email: boolean; name: boolean } } };
      }) {
        const membership = memberships.find(
          (candidate) =>
            candidate.organizationId === params.where.organizationId_userId.organizationId &&
            candidate.userId === params.where.organizationId_userId.userId
        );

        if (!membership) {
          throw new Error("Organization member not found.");
        }

        membership.role = params.data.role;
        membership.updatedAt = new Date(now.getTime() + memberships.length + 1);

        if (!params.include?.user) {
          return membership;
        }

        return {
          ...membership,
          user: users.find((user) => user.id === membership.userId) ?? {
            id: membership.userId,
            email: "missing@example.com",
            name: null
          }
        };
      }
    },
    organizationPolicyRuleOverride: {
      async findMany(params: { where: { organizationId: string } }) {
        return organizationPolicyRuleOverrides.filter((override) => override.organizationId === params.where.organizationId);
      },
      async findUnique(params: { where: { organizationId_ruleId: { organizationId: string; ruleId: string } } }) {
        return (
          organizationPolicyRuleOverrides.find(
            (override) =>
              override.organizationId === params.where.organizationId_ruleId.organizationId &&
              override.ruleId === params.where.organizationId_ruleId.ruleId
          ) ?? null
        );
      },
      async upsert(params: {
        where: { organizationId_ruleId: { organizationId: string; ruleId: string } };
        create: {
          organizationId: string;
          ruleId: string;
          riskLevel: FakeOrganizationPolicyRuleOverride["riskLevel"];
          updatedByUserId: string;
        };
        update: {
          riskLevel: FakeOrganizationPolicyRuleOverride["riskLevel"];
          updatedByUserId: string;
        };
      }) {
        const existing = organizationPolicyRuleOverrides.find(
          (override) =>
            override.organizationId === params.where.organizationId_ruleId.organizationId &&
            override.ruleId === params.where.organizationId_ruleId.ruleId
        );

        if (existing) {
          existing.riskLevel = params.update.riskLevel;
          existing.updatedByUserId = params.update.updatedByUserId;
          existing.updatedAt = new Date(now.getTime() + organizationPolicyRuleOverrides.length + 1);

          return existing;
        }

        const override: FakeOrganizationPolicyRuleOverride = {
          id: `policy-rule-override-${organizationPolicyRuleOverrides.length + 1}`,
          organizationId: params.create.organizationId,
          ruleId: params.create.ruleId,
          riskLevel: params.create.riskLevel,
          updatedByUserId: params.create.updatedByUserId,
          createdAt: new Date(now.getTime() + organizationPolicyRuleOverrides.length + 1),
          updatedAt: new Date(now.getTime() + organizationPolicyRuleOverrides.length + 1)
        };

        organizationPolicyRuleOverrides.push(override);

        return override;
      }
    },
    billingWaitlistEntry: {
      async findMany(params: { where: { organizationId: string }; orderBy?: { createdAt: "asc" | "desc" } }) {
        return sortByCreatedAt(
          billingWaitlistEntries.filter((entry) => entry.organizationId === params.where.organizationId),
          params.orderBy?.createdAt
        );
      },
      async upsert(params: {
        where: { organizationId_email: { organizationId: string; email: string } };
        create: {
          organizationId: string;
          createdByUserId: string;
          email: string;
          name: string | null;
          note: string | null;
        };
        update: {
          name: string | null;
          note: string | null;
        };
      }) {
        const existing = billingWaitlistEntries.find(
          (entry) =>
            entry.organizationId === params.where.organizationId_email.organizationId &&
            entry.email === params.where.organizationId_email.email
        );

        if (existing) {
          existing.name = params.update.name;
          existing.note = params.update.note;
          existing.updatedAt = new Date(now.getTime() + billingWaitlistEntries.length + 1);
          return existing;
        }

        const entry: FakeBillingWaitlistEntry = {
          id: `billing-waitlist-${billingWaitlistEntries.length + 1}`,
          organizationId: params.create.organizationId,
          createdByUserId: params.create.createdByUserId,
          email: params.create.email,
          name: params.create.name,
          note: params.create.note,
          createdAt: new Date(now.getTime() + billingWaitlistEntries.length + 1),
          updatedAt: new Date(now.getTime() + billingWaitlistEntries.length + 1)
        };

        billingWaitlistEntries.push(entry);

        return entry;
      }
    },
    providerCostEntry: {
      async findMany(params: { where: { organizationId: string }; orderBy?: { periodStart: "asc" | "desc" } }) {
        return [...providerCostEntries]
          .filter((entry) => entry.organizationId === params.where.organizationId)
          .sort((left, right) =>
            params.orderBy?.periodStart === "desc"
              ? right.periodStart.getTime() - left.periodStart.getTime()
              : left.periodStart.getTime() - right.periodStart.getTime()
          );
      },
      async create(params: {
        data: {
          organizationId: string;
          createdByUserId: string;
          provider: string;
          amountCents: number;
          currency: string;
          periodStart: Date;
          periodEnd: Date;
          sourceUrl: string | null;
          note: string | null;
        };
      }) {
        const entry: FakeProviderCostEntry = {
          id: `provider-cost-${providerCostEntries.length + 1}`,
          organizationId: params.data.organizationId,
          createdByUserId: params.data.createdByUserId,
          provider: params.data.provider,
          amountCents: params.data.amountCents,
          currency: params.data.currency,
          periodStart: params.data.periodStart,
          periodEnd: params.data.periodEnd,
          sourceUrl: params.data.sourceUrl,
          note: params.data.note,
          createdAt: new Date(now.getTime() + providerCostEntries.length + 1),
          updatedAt: new Date(now.getTime() + providerCostEntries.length + 1)
        };

        providerCostEntries.push(entry);

        return entry;
      }
    },
    providerExchangeRate: {
      async findMany(params: {
        where: { organizationId: string; reportingCurrency?: string };
        orderBy?: { effectiveAt: "asc" | "desc" };
      }) {
        return [...providerExchangeRates]
          .filter(
            (rate) =>
              rate.organizationId === params.where.organizationId &&
              (!params.where.reportingCurrency || rate.reportingCurrency === params.where.reportingCurrency)
          )
          .sort((left, right) =>
            params.orderBy?.effectiveAt === "desc"
              ? right.effectiveAt.getTime() - left.effectiveAt.getTime()
              : left.effectiveAt.getTime() - right.effectiveAt.getTime()
          );
      },
      async create(params: {
        data: {
          organizationId: string;
          sourceCurrency: string;
          reportingCurrency: string;
          rateBps: number;
          effectiveAt: Date;
          sourceUrl: string | null;
          note: string | null;
        };
      }) {
        const rate: FakeProviderExchangeRate = {
          id: `provider-exchange-rate-${providerExchangeRates.length + 1}`,
          organizationId: params.data.organizationId,
          sourceCurrency: params.data.sourceCurrency,
          reportingCurrency: params.data.reportingCurrency,
          rateBps: params.data.rateBps,
          effectiveAt: params.data.effectiveAt,
          sourceUrl: params.data.sourceUrl,
          note: params.data.note,
          createdAt: new Date(now.getTime() + providerExchangeRates.length + 1),
          updatedAt: new Date(now.getTime() + providerExchangeRates.length + 1)
        };

        providerExchangeRates.push(rate);

        return rate;
      }
    },
    room: {
      async create(params: {
        data: {
          organizationId: string;
          createdByUserId: string;
          title: string;
          participants: { create: { userId: string; role: "HOST" } };
        };
      }) {
        const room: FakeRoom = {
          id: `room-${rooms.length + 1}`,
          organizationId: params.data.organizationId,
          createdByUserId: params.data.createdByUserId,
          title: params.data.title,
          status: "CREATED",
          createdAt: now,
          updatedAt: now,
          endedAt: null
        };

        rooms.push(room);
        participants.push({
          id: `participant-${participants.length + 1}`,
          roomId: room.id,
          userId: params.data.participants.create.userId,
          agentId: null,
          role: params.data.participants.create.role,
          joinedAt: now,
          leftAt: null
        });

        return room;
      },
      async findMany(params: { where: { organizationId: string }; orderBy: { createdAt: "desc" } }) {
        return rooms.filter((room) => room.organizationId === params.where.organizationId);
      },
      async findFirst(params: {
        where: { id: string; organization: { members: { some: { userId: string } } } };
        include?: { participants: true | { include: { agent: true; user: true } } };
      }) {
        const room = rooms.find((candidate) => candidate.id === params.where.id);

        if (!room) {
          return null;
        }

        const isMember = memberships.some(
          (membership) =>
            membership.organizationId === room.organizationId &&
            membership.userId === params.where.organization.members.some.userId
        );

        if (!isMember) {
          return null;
        }

        return {
          ...room,
          participants: participants
            .filter((participant) => participant.roomId === room.id)
            .map((participant) => ({
              ...participant,
              agent: participant.agentId ? agents.find((agent) => agent.id === participant.agentId) ?? null : null,
              user: participant.userId ? users.find((user) => user.id === participant.userId) ?? null : null
            }))
        };
      },
      async findUnique(params: { where: { id: string } }) {
        return rooms.find((room) => room.id === params.where.id) ?? null;
      },
      async update(params: { where: { id: string }; data: { title: string } }) {
        const room = rooms.find((candidate) => candidate.id === params.where.id);

        if (!room) {
          throw new Error("Room not found.");
        }

        room.title = params.data.title;
        room.updatedAt = now;

        return room;
      },
      async delete(params: { where: { id: string } }) {
        const roomIndex = rooms.findIndex((candidate) => candidate.id === params.where.id);

        if (roomIndex === -1) {
          throw new Error("Room not found.");
        }

        const room = rooms[roomIndex];
        rooms.splice(roomIndex, 1);

        for (let index = participants.length - 1; index >= 0; index -= 1) {
          if (participants[index]?.roomId === room.id) {
            participants.splice(index, 1);
          }
        }

        return room;
      }
    },
    roomComment: {
      async findMany(params: {
        where: {
          roomId: string;
          artifactId?: string;
          artifactFileId?: string;
          agentRunEventId?: string;
        };
        include?: { createdByUser?: { select: { id: true; email: true; name: true } } };
        orderBy?: { createdAt: "asc" | "desc" };
      }) {
        return roomComments
          .filter(
            (comment) =>
              comment.roomId === params.where.roomId &&
              (params.where.artifactId === undefined || comment.artifactId === params.where.artifactId) &&
              (params.where.artifactFileId === undefined || comment.artifactFileId === params.where.artifactFileId) &&
              (params.where.agentRunEventId === undefined || comment.agentRunEventId === params.where.agentRunEventId)
          )
          .sort((left, right) =>
            params.orderBy?.createdAt === "desc"
              ? right.createdAt.getTime() - left.createdAt.getTime()
              : left.createdAt.getTime() - right.createdAt.getTime()
          )
          .map((comment) => ({
            ...comment,
            createdByUser: users.find((user) => user.id === comment.createdByUserId) ?? null
          }));
      },
      async create(params: {
        data: {
          roomId: string;
          artifactId: string | null;
          artifactFileId: string | null;
          agentRunEventId: string | null;
          createdByUserId: string;
          lineNumber: number | null;
          body: string;
        };
        include?: { createdByUser?: { select: { id: true; email: true; name: true } } };
      }) {
        const roomComment: FakeRoomComment = {
          id: `room-comment-${roomComments.length + 1}`,
          roomId: params.data.roomId,
          artifactId: params.data.artifactId,
          artifactFileId: params.data.artifactFileId,
          agentRunEventId: params.data.agentRunEventId,
          createdByUserId: params.data.createdByUserId,
          lineNumber: params.data.lineNumber,
          body: params.data.body,
          createdAt: new Date(now.getTime() + roomComments.length + 1),
          updatedAt: new Date(now.getTime() + roomComments.length + 1)
        };

        roomComments.push(roomComment);

        return {
          ...roomComment,
          createdByUser: users.find((user) => user.id === roomComment.createdByUserId) ?? null
        };
      }
    },
    roomParticipant: {
      async upsert(params: {
        where:
          | { roomId_userId: { roomId: string; userId: string } }
          | { roomId_agentId: { roomId: string; agentId: string } };
        create:
          | { roomId: string; userId: string; role: "MEMBER" }
          | { roomId: string; agentId: string; role: "AGENT" };
        update: { leftAt: null };
      }) {
        const roomUserKey = "roomId_userId" in params.where ? params.where.roomId_userId : null;
        const roomAgentKey = "roomId_agentId" in params.where ? params.where.roomId_agentId : null;
        const existing =
          participants.find(
            (participant) =>
              (roomUserKey
                ? participant.roomId === roomUserKey.roomId && participant.userId === roomUserKey.userId
                : false) ||
              (roomAgentKey
                ? participant.roomId === roomAgentKey.roomId && participant.agentId === roomAgentKey.agentId
                : false)
          ) ?? null;

        if (existing) {
          existing.leftAt = params.update.leftAt;
          return existing;
        }

        const participant: FakeRoomParticipant = {
          id: `participant-${participants.length + 1}`,
          roomId: params.create.roomId,
          userId: "userId" in params.create ? params.create.userId : null,
          agentId: "agentId" in params.create ? params.create.agentId : null,
          role: params.create.role,
          joinedAt: now,
          leftAt: null
        };

        participants.push(participant);

        return participant;
      },
      async findUnique(params: {
        where: {
          roomId_agentId?: { roomId: string; agentId: string };
          roomId_userId?: { roomId: string; userId: string };
        };
      }) {
        const roomAgentKey = params.where.roomId_agentId;
        const roomUserKey = params.where.roomId_userId;

        return (
          participants.find(
            (participant) =>
              (roomAgentKey
                ? participant.roomId === roomAgentKey.roomId && participant.agentId === roomAgentKey.agentId
                : false) ||
              (roomUserKey
                ? participant.roomId === roomUserKey.roomId && participant.userId === roomUserKey.userId
                : false)
          ) ?? null
        );
      },
      async findMany(params: {
        where: { roomId: string; agentId?: { not: null } };
        include?: { agent?: true; user?: true };
        orderBy?: { joinedAt: "asc" | "desc" };
      }) {
        let matchingParticipants = participants.filter((participant) => participant.roomId === params.where.roomId);

        if (params.where.agentId) {
          matchingParticipants = matchingParticipants.filter((participant) => participant.agentId !== null);
        }

        return sortByJoinedAt(matchingParticipants, params.orderBy?.joinedAt).map((participant) => ({
          ...participant,
          agent:
            params.include?.agent && participant.agentId
              ? agents.find((agent) => agent.id === participant.agentId) ?? null
              : null,
          user:
            params.include?.user && participant.userId
              ? users.find((user) => user.id === participant.userId) ?? null
              : null
        }));
      }
    },
    sandboxSession: {
      async create(params: {
        data: {
          roomId: string;
          taskId: string | null;
          createdByAgentId: string | null;
          provider: FakeSandboxSession["provider"];
          status: FakeSandboxSession["status"];
          workdir: string;
          previewUrl: string | null;
          metadata: Record<string, unknown>;
        };
      }) {
        const sandboxSession: FakeSandboxSession = {
          id: `sandbox-session-${sandboxSessions.length + 1}`,
          roomId: params.data.roomId,
          taskId: params.data.taskId,
          createdByAgentId: params.data.createdByAgentId,
          provider: params.data.provider,
          status: params.data.status,
          workdir: params.data.workdir,
          previewUrl: params.data.previewUrl,
          metadata: params.data.metadata,
          createdAt: new Date(now.getTime() + sandboxSessions.length + 1),
          updatedAt: new Date(now.getTime() + sandboxSessions.length + 1)
        };

        sandboxSessions.push(sandboxSession);

        return sandboxSession;
      },
      async findFirst(params: { where: { id: string; roomId: string } }) {
        return (
          sandboxSessions.find(
            (session) => session.id === params.where.id && session.roomId === params.where.roomId
          ) ?? null
        );
      },
      async findMany(params: { where: { roomId: string }; orderBy?: { createdAt: "asc" | "desc" } }) {
        return sortByCreatedAt(
          sandboxSessions.filter((session) => session.roomId === params.where.roomId),
          params.orderBy?.createdAt
        );
      },
      async update(params: {
        where: { id: string };
        data: {
          status?: FakeSandboxSession["status"];
          previewUrl?: string;
          metadata?: Record<string, unknown>;
        };
      }) {
        const sandboxSession = sandboxSessions.find((candidate) => candidate.id === params.where.id);

        if (!sandboxSession) {
          throw new Error("Sandbox session not found.");
        }

        if (params.data.status !== undefined) {
          sandboxSession.status = params.data.status;
        }

        if (params.data.previewUrl !== undefined) {
          sandboxSession.previewUrl = params.data.previewUrl;
        }

        if (params.data.metadata !== undefined) {
          sandboxSession.metadata = params.data.metadata;
        }

        sandboxSession.updatedAt = now;

        return sandboxSession;
      }
    },
    task: {
      async create(params: {
        data: {
          roomId: string;
          createdByUserId: string | null;
          createdByAgentId: string | null;
          assignedAgentId: string | null;
          title: string;
          description: string | null;
          status: FakeTask["status"];
          riskLevel: FakeTask["riskLevel"];
        };
      }) {
        const task: FakeTask = {
          id: `task-${tasks.length + 1}`,
          roomId: params.data.roomId,
          createdByUserId: params.data.createdByUserId,
          createdByAgentId: params.data.createdByAgentId,
          assignedAgentId: params.data.assignedAgentId,
          title: params.data.title,
          description: params.data.description,
          status: params.data.status,
          riskLevel: params.data.riskLevel,
          createdAt: now,
          updatedAt: now,
          completedAt: null
        };

        tasks.push(task);

        return task;
      },
      async findFirst(params: {
        where: { id: string; roomId: string };
        include?: {
          artifacts?: {
            include?: { versions?: { orderBy: { version: "desc" }; take: number } };
            orderBy?: { createdAt: "asc" | "desc" };
          };
          events?: {
            where?: { type: string };
            orderBy?: { occurredAt: "asc" | "desc" };
          };
          agentRunEvents?: {
            orderBy?: { createdAt: "asc" | "desc" };
          };
        };
      }) {
        const task = tasks.find((candidate) => candidate.id === params.where.id && candidate.roomId === params.where.roomId);

        if (!task || !params.include?.artifacts) {
          return task ?? null;
        }

        return {
          ...task,
          artifacts: sortByCreatedAt(
            artifacts.filter((artifact) => artifact.taskId === task.id),
            params.include.artifacts.orderBy?.createdAt
          ).map((artifact) => ({
            ...artifact,
            versions: sortArtifactVersions(
              artifactVersions.filter((version) => version.artifactId === artifact.id)
            ).slice(0, params.include?.artifacts?.include?.versions?.take ?? artifactVersions.length)
          })),
          events: sortByOccurredAt(
            taskEvents.filter(
              (event) =>
                event.taskId === task.id &&
                (!params.include?.events?.where?.type || event.type === params.include.events.where.type)
            ),
            params.include.events?.orderBy?.occurredAt
          ),
          agentRunEvents: sortByCreatedAt(
            agentRunEvents.filter((event) => event.taskId === task.id),
            params.include.agentRunEvents?.orderBy?.createdAt
          )
        };
      },
      async update(params: {
        where: { id: string };
        data: { assignedAgentId?: string; status: FakeTask["status"]; completedAt: Date | null };
      }) {
        const task = tasks.find((candidate) => candidate.id === params.where.id);

        if (!task) {
          throw new Error("Task not found.");
        }

        if (params.data.assignedAgentId !== undefined) {
          task.assignedAgentId = params.data.assignedAgentId;
        }

        task.status = params.data.status;
        task.completedAt = params.data.completedAt;
        task.updatedAt = now;

        return task;
      },
      async findMany(params: {
        where: { roomId: string };
        include?: {
          artifacts?: {
            include?: { versions?: { orderBy: { version: "desc" }; take: number } };
            orderBy?: { createdAt: "asc" | "desc" };
          };
          events?: {
            where?: { type: string };
            orderBy?: { occurredAt: "asc" | "desc" };
          };
          agentRunEvents?: {
            orderBy?: { createdAt: "asc" | "desc" };
          };
        };
        orderBy?: { createdAt: "asc" | "desc" };
      }) {
        const matchingTasks = sortByCreatedAt(
          tasks.filter((task) => task.roomId === params.where.roomId),
          params.orderBy?.createdAt
        );

        if (!params.include?.artifacts) {
          return matchingTasks;
        }

        return matchingTasks.map((task) => ({
          ...task,
          artifacts: sortByCreatedAt(
            artifacts.filter((artifact) => artifact.taskId === task.id),
            params.include?.artifacts?.orderBy?.createdAt
          ).map((artifact) => ({
            ...artifact,
            versions: sortArtifactVersions(
              artifactVersions.filter((version) => version.artifactId === artifact.id)
            ).slice(0, params.include?.artifacts?.include?.versions?.take ?? artifactVersions.length)
          })),
          events: sortByOccurredAt(
            taskEvents.filter(
              (event) =>
                event.taskId === task.id &&
                (!params.include?.events?.where?.type || event.type === params.include.events.where.type)
            ),
            params.include?.events?.orderBy?.occurredAt
          ),
          agentRunEvents: sortByCreatedAt(
            agentRunEvents.filter((event) => event.taskId === task.id),
            params.include?.agentRunEvents?.orderBy?.createdAt
          )
        }));
      }
    },
    taskEvent: {
      async create(params: {
        data: {
          roomId: string;
          taskId: string;
          type: string;
          payload: Record<string, unknown>;
        };
      }) {
        const taskEvent: FakeTaskEvent = {
          id: `task-event-${taskEvents.length + 1}`,
          roomId: params.data.roomId,
          taskId: params.data.taskId,
          type: params.data.type,
          payload: params.data.payload,
          occurredAt: new Date(now.getTime() + taskEvents.length + 1)
        };

        taskEvents.push(taskEvent);

        return taskEvent;
      },
      async findUnique(params: { where: { id: string } }) {
        return taskEvents.find((event) => event.id === params.where.id) ?? null;
      },
      async findMany(params: {
        where: { roomId: string; occurredAt?: { gt: Date } };
        orderBy?: Array<{ occurredAt?: "asc" | "desc"; id?: "asc" | "desc" }>;
        cursor?: { id: string };
        skip?: number;
        take?: number;
      }) {
        let matchingEvents = taskEvents.filter(
          (event) =>
            event.roomId === params.where.roomId &&
            (!params.where.occurredAt || event.occurredAt > params.where.occurredAt.gt)
        );

        matchingEvents = sortByTaskEventOrder(matchingEvents, params.orderBy);

        if (params.cursor) {
          const cursorIndex = matchingEvents.findIndex((event) => event.id === params.cursor?.id);

          if (cursorIndex !== -1) {
            matchingEvents = matchingEvents.slice(cursorIndex + (params.skip ?? 0));
          }
        }

        return matchingEvents.slice(0, params.take ?? matchingEvents.length);
      }
    },
    artifact: {
      async create(params: {
        data: {
          roomId: string;
          taskId: string;
          createdByUserId: string | null;
          createdByAgentId: string | null;
          type: FakeArtifact["type"];
          status: FakeArtifact["status"];
          title: string;
        };
      }) {
        const artifact: FakeArtifact = {
          id: `artifact-${artifacts.length + 1}`,
          roomId: params.data.roomId,
          taskId: params.data.taskId,
          createdByUserId: params.data.createdByUserId,
          createdByAgentId: params.data.createdByAgentId,
          type: params.data.type,
          status: params.data.status,
          title: params.data.title,
          createdAt: now,
          updatedAt: now
        };

        artifacts.push(artifact);

        return artifact;
      },
      async findFirst(params: {
        where: { id: string; roomId: string };
        include?: { versions?: { orderBy: { version: "desc" }; take: number } };
      }) {
        const artifact = artifacts.find(
          (candidate) => candidate.id === params.where.id && candidate.roomId === params.where.roomId
        );

        if (!artifact) {
          return null;
        }

        return {
          ...artifact,
          versions: sortArtifactVersions(
            artifactVersions.filter((version) => version.artifactId === artifact.id)
          ).slice(0, params.include?.versions?.take ?? artifactVersions.length)
        };
      },
      async findMany(params: { where: { roomId: string } }) {
        return artifacts.filter((artifact) => artifact.roomId === params.where.roomId);
      },
      async update(params: { where: { id: string }; data: { title?: string; status?: FakeArtifact["status"] } }) {
        const artifact = artifacts.find((candidate) => candidate.id === params.where.id);

        if (!artifact) {
          throw new Error("Artifact not found.");
        }

        if (params.data.title !== undefined) {
          artifact.title = params.data.title;
        }

        if (params.data.status !== undefined) {
          artifact.status = params.data.status;
        }

        artifact.updatedAt = now;

        return artifact;
      }
    },
    artifactVersion: {
      async create(params: {
        data: {
          artifactId: string;
          createdByUserId: string | null;
          createdByAgentId: string | null;
          version: number;
          content: Record<string, unknown>;
        };
      }) {
        const artifactVersion: FakeArtifactVersion = {
          id: `artifact-version-${artifactVersions.length + 1}`,
          artifactId: params.data.artifactId,
          createdByUserId: params.data.createdByUserId,
          createdByAgentId: params.data.createdByAgentId,
          version: params.data.version,
          content: params.data.content,
          createdAt: now
        };

        artifactVersions.push(artifactVersion);

        return artifactVersion;
      }
    },
    artifactFile: {
      async findUnique(params: { where: { artifactId_path: { artifactId: string; path: string } } }) {
        return (
          artifactFiles.find(
            (file) =>
              file.artifactId === params.where.artifactId_path.artifactId && file.path === params.where.artifactId_path.path
          ) ?? null
        );
      },
      async findFirst(params: { where: { id: string; roomId: string } }) {
        return (
          artifactFiles.find((file) => file.id === params.where.id && file.roomId === params.where.roomId) ?? null
        );
      },
      async findMany(params: {
        where: { roomId: string; artifactId: string };
        include?: { versions?: { orderBy: { version: "desc" }; take: number } };
        orderBy?: { path: "asc" | "desc" };
      }) {
        const matchingFiles = artifactFiles
          .filter((file) => file.roomId === params.where.roomId && file.artifactId === params.where.artifactId)
          .sort((left, right) =>
            params.orderBy?.path === "desc" ? right.path.localeCompare(left.path) : left.path.localeCompare(right.path)
          );

        return matchingFiles.map((file) => ({
          ...file,
          versions: sortArtifactFileVersions(
            artifactFileVersions.filter((version) => version.artifactFileId === file.id),
            params.include?.versions?.orderBy.version
          )
            .slice(0, params.include?.versions?.take ?? artifactFileVersions.length)
            .map((version) => ({
              ...version,
              nextDiffs: artifactFileDiffs
                .filter((diff) => diff.newVersionId === version.id)
                .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
                .slice(0, 1)
            }))
        }));
      },
      async create(params: {
        data: {
          roomId: string;
          taskId: string | null;
          artifactId: string;
          path: string;
          type: string;
          language: string | null;
          size: number;
          contentHash: string;
          latestVersionId: string | null;
        };
      }) {
        const artifactFile: FakeArtifactFile = {
          id: `artifact-file-${artifactFiles.length + 1}`,
          roomId: params.data.roomId,
          taskId: params.data.taskId,
          artifactId: params.data.artifactId,
          path: params.data.path,
          type: params.data.type,
          language: params.data.language,
          size: params.data.size,
          contentHash: params.data.contentHash,
          latestVersionId: params.data.latestVersionId,
          createdAt: new Date(now.getTime() + artifactFiles.length + 1),
          updatedAt: new Date(now.getTime() + artifactFiles.length + 1)
        };

        artifactFiles.push(artifactFile);

        return artifactFile;
      },
      async update(params: {
        where: { id: string };
        data: {
          type: string;
          language: string | null;
          size: number;
          contentHash: string;
          latestVersionId: string;
        };
      }) {
        const artifactFile = artifactFiles.find((candidate) => candidate.id === params.where.id);

        if (!artifactFile) {
          throw new Error("Artifact file not found.");
        }

        artifactFile.type = params.data.type;
        artifactFile.language = params.data.language;
        artifactFile.size = params.data.size;
        artifactFile.contentHash = params.data.contentHash;
        artifactFile.latestVersionId = params.data.latestVersionId;
        artifactFile.updatedAt = now;

        return artifactFile;
      }
    },
    artifactFileVersion: {
      async findFirst(params: {
        where: { artifactFileId: string };
        orderBy?: { version: "asc" | "desc" };
      }) {
        return (
          sortArtifactFileVersions(
            artifactFileVersions.filter((version) => version.artifactFileId === params.where.artifactFileId),
            params.orderBy?.version
          )[0] ?? null
        );
      },
      async create(params: {
        data: {
          artifactFileId: string;
          artifactVersionId: string;
          runId: string | null;
          version: number;
          content: string;
          contentHash: string;
          size: number;
        };
      }) {
        const artifactFileVersion: FakeArtifactFileVersion = {
          id: `artifact-file-version-${artifactFileVersions.length + 1}`,
          artifactFileId: params.data.artifactFileId,
          artifactVersionId: params.data.artifactVersionId,
          runId: params.data.runId,
          version: params.data.version,
          content: params.data.content,
          contentHash: params.data.contentHash,
          size: params.data.size,
          createdAt: new Date(now.getTime() + artifactFileVersions.length + 1)
        };

        artifactFileVersions.push(artifactFileVersion);

        return artifactFileVersion;
      }
    },
    artifactFileDiff: {
      async create(params: {
        data: {
          oldVersionId: string | null;
          newVersionId: string;
          unifiedDiff: string;
        };
      }) {
        const artifactFileDiff: FakeArtifactFileDiff = {
          id: `artifact-file-diff-${artifactFileDiffs.length + 1}`,
          oldVersionId: params.data.oldVersionId,
          newVersionId: params.data.newVersionId,
          unifiedDiff: params.data.unifiedDiff,
          createdAt: new Date(now.getTime() + artifactFileDiffs.length + 1)
        };

        artifactFileDiffs.push(artifactFileDiff);

        return artifactFileDiff;
      }
    },
    approval: {
      async create(params: {
        data: {
          roomId: string;
          taskId: string | null;
          artifactId: string | null;
          requestedByAgentId: string | null;
          title: string;
          status: FakeApproval["status"];
          riskLevel: FakeApproval["riskLevel"];
        };
      }) {
        const approval: FakeApproval = {
          id: `approval-${approvals.length + 1}`,
          roomId: params.data.roomId,
          taskId: params.data.taskId,
          artifactId: params.data.artifactId,
          requestedByUserId: null,
          requestedByAgentId: params.data.requestedByAgentId,
          decidedByUserId: null,
          title: params.data.title,
          status: params.data.status,
          riskLevel: params.data.riskLevel,
          createdAt: new Date(now.getTime() + approvals.length + 1),
          decidedAt: null
        };

        approvals.push(approval);

        return approval;
      },
      async findMany(params: { where: { roomId: string }; orderBy?: { createdAt: "asc" | "desc" } }) {
        return sortByCreatedAt(
          approvals.filter((approval) => approval.roomId === params.where.roomId),
          params.orderBy?.createdAt
        );
      },
      async findFirst(params: { where: { id: string; roomId: string } }) {
        return (
          approvals.find(
            (approval) => approval.id === params.where.id && approval.roomId === params.where.roomId
          ) ?? null
        );
      },
      async update(params: {
        where: { id: string };
        data: { status: FakeApproval["status"]; decidedAt: Date; decidedByUserId: string };
      }) {
        const approval = approvals.find((candidate) => candidate.id === params.where.id);

        if (!approval) {
          throw new Error("Approval not found.");
        }

        approval.status = params.data.status;
        approval.decidedAt = params.data.decidedAt;
        approval.decidedByUserId = params.data.decidedByUserId;

        return approval;
      }
    },
    agentToolCall: {
      async create(params: {
        data: {
          roomId: string;
          taskId: string | null;
          artifactId: string | null;
          approvalId: string | null;
          agentId: string;
          toolName: string;
          status: FakeAgentToolCall["status"];
          arguments: Record<string, unknown>;
        };
      }) {
        const createdAt = new Date(now.getTime() + agentToolCalls.length + 1);
        const toolCall: FakeAgentToolCall = {
          id: `agent-tool-call-${agentToolCalls.length + 1}`,
          roomId: params.data.roomId,
          taskId: params.data.taskId,
          artifactId: params.data.artifactId,
          approvalId: params.data.approvalId,
          agentId: params.data.agentId,
          toolName: params.data.toolName,
          status: params.data.status,
          arguments: params.data.arguments,
          result: null,
          errorCode: null,
          errorMessage: null,
          startedAt: createdAt,
          finishedAt: null,
          durationMs: null,
          createdAt,
          updatedAt: createdAt
        };

        agentToolCalls.push(toolCall);

        return toolCall;
      },
      async update(params: {
        where: { id: string };
        data: {
          status: FakeAgentToolCall["status"];
          result?: Record<string, unknown>;
          errorCode?: number;
          errorMessage?: string;
          finishedAt: Date;
          durationMs: number;
        };
      }) {
        const toolCall = agentToolCalls.find((candidate) => candidate.id === params.where.id);

        if (!toolCall) {
          throw new Error("Agent tool call not found.");
        }

        toolCall.status = params.data.status;
        toolCall.result = params.data.result ?? toolCall.result;
        toolCall.errorCode = params.data.errorCode ?? toolCall.errorCode;
        toolCall.errorMessage = params.data.errorMessage ?? toolCall.errorMessage;
        toolCall.finishedAt = params.data.finishedAt;
        toolCall.durationMs = params.data.durationMs;
        toolCall.updatedAt = params.data.finishedAt;

        return toolCall;
      },
      async findMany(params: {
        where: { roomId: string };
        orderBy?: { startedAt: "asc" | "desc" };
        take?: number;
      }) {
        const sorted = [...agentToolCalls]
          .filter((toolCall) => toolCall.roomId === params.where.roomId)
          .sort((left, right) =>
            params.orderBy?.startedAt === "desc"
              ? right.startedAt.getTime() - left.startedAt.getTime()
              : left.startedAt.getTime() - right.startedAt.getTime()
          );

        return params.take ? sorted.slice(0, params.take) : sorted;
      }
    },
    auditLog: {
      async create(params: {
        data: {
          organizationId: string | null;
          roomId: string | null;
          actorUserId: string | null;
          actorAgentId: string | null;
          action: string;
          targetType: string;
          targetId: string | null;
          payload: Record<string, unknown>;
        };
      }) {
        const auditLog: FakeAuditLog = {
          id: `audit-${auditLogs.length + 1}`,
          organizationId: params.data.organizationId,
          roomId: params.data.roomId,
          actorUserId: params.data.actorUserId,
          actorAgentId: params.data.actorAgentId,
          action: params.data.action,
          targetType: params.data.targetType,
          targetId: params.data.targetId,
          payload: params.data.payload,
          createdAt: new Date(now.getTime() + auditLogs.length + 1)
        };

        auditLogs.push(auditLog);

        return auditLog;
      },
      async findMany(params: {
        where: { roomId: string; action?: string; createdAt?: { gt: Date } };
        orderBy?: { createdAt: "asc" | "desc" };
      }) {
        return sortByCreatedAt(
          auditLogs.filter(
            (auditLog) =>
              auditLog.roomId === params.where.roomId &&
              (!params.where.action || auditLog.action === params.where.action) &&
              (!params.where.createdAt || auditLog.createdAt > params.where.createdAt.gt)
          ),
          params.orderBy?.createdAt
        );
      }
    },
    transcriptSegment: {
      async create(params: {
        data: {
          roomId: string;
          speakerUserId: string;
          text: string;
          startedAt: Date;
          endedAt: Date | null;
        };
      }) {
        const transcriptSegment: FakeTranscriptSegment = {
          id: `transcript-${transcriptSegments.length + 1}`,
          roomId: params.data.roomId,
          speakerUserId: params.data.speakerUserId,
          speakerAgentId: null,
          text: params.data.text,
          startedAt: params.data.startedAt,
          endedAt: params.data.endedAt,
          createdAt: now
        };

        transcriptSegments.push(transcriptSegment);

        return transcriptSegment;
      },
      async findMany(params: { where: { roomId: string }; orderBy?: { startedAt: "asc" | "desc" } }) {
        return sortByStartedAt(
          transcriptSegments.filter((segment) => segment.roomId === params.where.roomId),
          params.orderBy?.startedAt
        );
      }
    },
    async $disconnect() {}
  } as unknown as FakeApiDatabase;

  db.agentConnectionRecords = agentConnections;
  db.agentRunEventRecords = agentRunEvents;
  db.agentRunRecords = agentRuns;
  db.agentToolCallRecords = agentToolCalls;
  db.agentRecords = agents;
  db.localAgentPairingCodeRecords = localAgentPairingCodes;
  db.approvalRecords = approvals;
  db.auditLogRecords = auditLogs;
  db.artifactFileDiffRecords = artifactFileDiffs;
  db.artifactFileRecords = artifactFiles;
  db.artifactFileVersionRecords = artifactFileVersions;
  db.artifactRecords = artifacts;
  db.artifactVersionRecords = artifactVersions;
  db.billingWaitlistEntryRecords = billingWaitlistEntries;
  db.organizationPolicyRuleOverrideRecords = organizationPolicyRuleOverrides;
  db.providerCostEntryRecords = providerCostEntries;
  db.providerExchangeRateRecords = providerExchangeRates;
  db.roomCommentRecords = roomComments;
  db.roomParticipantRecords = participants;
  db.sandboxSessionRecords = sandboxSessions;
  db.taskEventRecords = taskEvents;
  db.taskRecords = tasks;
  db.transcriptSegmentRecords = transcriptSegments;

  return db;
}

function sortByCreatedAt<T extends { createdAt: Date }>(items: T[], direction: "asc" | "desc" = "asc"): T[] {
  return [...items].sort((left, right) => {
    const comparison = left.createdAt.getTime() - right.createdAt.getTime();

    return direction === "asc" ? comparison : -comparison;
  });
}

function sortByJoinedAt<T extends { joinedAt: Date }>(items: T[], direction: "asc" | "desc" = "asc"): T[] {
  return [...items].sort((left, right) => {
    const comparison = left.joinedAt.getTime() - right.joinedAt.getTime();

    return direction === "asc" ? comparison : -comparison;
  });
}

function sortByStartedAt<T extends { startedAt: Date }>(items: T[], direction: "asc" | "desc" = "asc"): T[] {
  return [...items].sort((left, right) => {
    const comparison = left.startedAt.getTime() - right.startedAt.getTime();

    return direction === "asc" ? comparison : -comparison;
  });
}

function sortArtifactVersions(items: FakeArtifactVersion[]): FakeArtifactVersion[] {
  return [...items].sort((left, right) => right.version - left.version);
}

function sortArtifactFileVersions(
  items: FakeArtifactFileVersion[],
  direction: "asc" | "desc" = "desc"
): FakeArtifactFileVersion[] {
  return [...items].sort((left, right) => {
    const comparison = left.version - right.version;

    return direction === "asc" ? comparison : -comparison;
  });
}

function sortByOccurredAt<T extends { occurredAt: Date }>(items: T[], direction: "asc" | "desc" = "asc"): T[] {
  return [...items].sort((left, right) => {
    const comparison = left.occurredAt.getTime() - right.occurredAt.getTime();

    return direction === "asc" ? comparison : -comparison;
  });
}

function sortByTaskEventOrder(
  items: FakeTaskEvent[],
  orderBy: Array<{ occurredAt?: "asc" | "desc"; id?: "asc" | "desc" }> = [{ occurredAt: "asc" }]
): FakeTaskEvent[] {
  return [...items].sort((left, right) => {
    for (const order of orderBy) {
      if (order.occurredAt) {
        const comparison = left.occurredAt.getTime() - right.occurredAt.getTime();

        if (comparison !== 0) {
          return order.occurredAt === "asc" ? comparison : -comparison;
        }
      }

      if (order.id) {
        const comparison = left.id.localeCompare(right.id);

        if (comparison !== 0) {
          return order.id === "asc" ? comparison : -comparison;
        }
      }
    }

    return 0;
  });
}
