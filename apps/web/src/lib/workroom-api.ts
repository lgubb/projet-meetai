import type { ApprovalRequest, RealtimeArtifact, RealtimeTask, RealtimeTaskLog, RoomAgent } from "@jean/shared";

export type DevUser = {
  email: string;
  name: string;
};

export type Organization = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationMember = {
  id: string;
  organizationId: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  role: "OWNER" | "ADMIN" | "MEMBER";
  createdAt: string;
  updatedAt: string;
};

export type Room = {
  id: string;
  organizationId: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
};

export type RoomParticipant = {
  id: string;
  roomId: string;
  userId: string | null;
  agentId: string | null;
  userEmail: string | null;
  userName: string | null;
  agentName: string | null;
  role: string;
  joinedAt: string;
  leftAt: string | null;
};

export type OrganizationsResponse = {
  organizations: Organization[];
};

export type RoomsResponse = {
  rooms: Room[];
};

export type OrganizationUsage = {
  organizationId: string;
  rooms: {
    total: number;
    created: number;
    live: number;
    ended: number;
    archived: number;
  };
  tasks: {
    total: number;
    pending: number;
    running: number;
    waitingForApproval: number;
    completed: number;
    failed: number;
    canceled: number;
  };
  artifacts: {
    total: number;
    draft: number;
    generating: number;
    ready: number;
    failed: number;
    archived: number;
    previews: number;
  };
  agents: {
    total: number;
  };
  approvals: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    canceled: number;
  };
  toolCalls: {
    total: number;
    running: number;
    succeeded: number;
    failed: number;
    blocked: number;
  };
  providerUsage: {
    liveKitParticipantMinutes: number;
    deepgramSttMinutes: number;
    e2bSandboxMinutes: number;
    connectorFailures: number;
  };
  limits: Record<
    "rooms" | "tasks" | "artifacts" | "agents" | "approvals" | "toolCalls",
    {
      used: number;
      limit: number;
      remaining: number;
      isOverLimit: boolean;
    }
  >;
};

export type OrganizationUsageResponse = {
  usage: OrganizationUsage;
};

export type OrganizationMembersResponse = {
  members: OrganizationMember[];
};

export type UpdateOrganizationMemberResponse = {
  member: OrganizationMember;
};

export type BillingWaitlistEntry = {
  id: string;
  organizationId: string;
  createdByUserId: string;
  email: string;
  name: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BillingWaitlistResponse = {
  entries: BillingWaitlistEntry[];
};

export type JoinBillingWaitlistResponse = {
  entry: BillingWaitlistEntry;
};

export type ProviderCostEntry = {
  id: string;
  organizationId: string;
  createdByUserId: string;
  provider: string;
  amountCents: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
  sourceUrl: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProviderCostSummary = {
  currency: string;
  totalAmountCents: number;
  entryCount: number;
};

export type ProviderCostConvertedSummary = {
  reportingCurrency: string;
  totalAmountCents: number;
  convertedEntryCount: number;
  missingRateEntryCount: number;
  missingCurrencies: string[];
};

export type ProviderCostsResponse = {
  entries: ProviderCostEntry[];
  summary: ProviderCostSummary[];
  convertedSummary?: ProviderCostConvertedSummary;
};

export type CreateProviderCostResponse = {
  entry: ProviderCostEntry;
};

export type ProviderExchangeRate = {
  id: string;
  organizationId: string;
  sourceCurrency: string;
  reportingCurrency: string;
  rateBps: number;
  effectiveAt: string;
  sourceUrl: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProviderExchangeRatesResponse = {
  rates: ProviderExchangeRate[];
};

export type CreateProviderExchangeRateResponse = {
  rate: ProviderExchangeRate;
};

export type FetchProviderExchangeRateResponse = {
  rate: ProviderExchangeRate;
};

export type RoomResponse = {
  room: Room;
  participants: RoomParticipant[];
};

export type CreateOrganizationResponse = {
  organization: Organization;
};

export type CreateRoomResponse = {
  room: Room;
};

export type JoinRoomResponse = {
  room: Room;
  participant: RoomParticipant;
};

export type LiveKitConnection = {
  serverUrl: string;
  token: string;
  roomName: string;
  identity: string;
};

export type LiveKitTokenResponse = {
  livekit: LiveKitConnection;
};

export type RoomTaskItem = {
  task: RealtimeTask;
  artifacts: RealtimeArtifact[];
  logs: RealtimeTaskLog[];
  runEvents: RoomAgentRunEvent[];
};

export type RoomAgentRunEvent = {
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
  createdAt: string;
};

export type RoomTasksResponse = {
  items: RoomTaskItem[];
};

export type CreateRoomTaskResponse = {
  task: RealtimeTask;
  artifact: RealtimeArtifact;
};

export type UpdateRoomTaskStatusResponse = {
  task: RealtimeTask;
};

export type ArtifactFileItem = {
  id: string;
  roomId: string;
  taskId: string | null;
  artifactId: string;
  path: string;
  type: string;
  language: string | null;
  size: number;
  contentHash: string;
  latestVersion: {
    id: string;
    artifactVersionId: string | null;
    runId: string | null;
    version: number;
    content: string;
    contentHash: string;
    size: number;
    createdAt: string;
  } | null;
  latestDiff: {
    id: string;
    oldVersionId: string | null;
    newVersionId: string;
    unifiedDiff: string;
    createdAt: string;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type ArtifactFilesResponse = {
  files: ArtifactFileItem[];
};

export type RoomComment = {
  id: string;
  roomId: string;
  artifactId: string | null;
  artifactFileId: string | null;
  agentRunEventId: string | null;
  createdByUserId: string | null;
  createdByUserEmail: string | null;
  createdByUserName: string | null;
  lineNumber: number | null;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type RoomCommentsResponse = {
  comments: RoomComment[];
};

export type CreateRoomCommentResponse = {
  comment: RoomComment;
};

export type RoomAgentsResponse = {
  agents: RoomAgent[];
};

export type LocalCodexPairing = {
  id: string;
  status: "PENDING" | "CONSUMED" | "CODEX_AUTH_ERROR" | "BRIDGE_ERROR" | "EXPIRED";
  expiresAt: string;
  consumedAt: string | null;
  errorMessage: string | null;
  code?: string;
  command?: string;
};

export type LocalCodexConnection = {
  roomId: string;
  agent: {
    localAgentKey: string;
    agentId: string;
    name: string;
    provider: string;
    transport: string;
    capabilities: string[];
    metadata: Record<string, unknown>;
  };
  connectedAt: string;
  lastHeartbeatAt: string;
  busyTaskId: string | null;
};

export type LocalCodexStatus = {
  status: "not_connected" | "pairing_pending" | "connected" | "codex_auth_error" | "bridge_error" | "expired";
  pairing?: LocalCodexPairing;
  connection?: LocalCodexConnection;
};

export type RoomApprovalsResponse = {
  approvals: ApprovalRequest[];
};

export type ApprovalDecisionResponse = {
  approval: ApprovalRequest;
};

export type RoomToolCall = {
  id: string;
  roomId: string;
  taskId: string | null;
  artifactId: string | null;
  approvalId: string | null;
  agentId: string;
  toolName: string;
  status: "RUNNING" | "SUCCEEDED" | "FAILED" | "BLOCKED";
  arguments: Record<string, unknown>;
  result: Record<string, unknown> | null;
  errorCode: number | null;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
};

export type RoomToolCallsResponse = {
  toolCalls: RoomToolCall[];
};

export type RoomPolicyRule = {
  id: string;
  action: string;
  appliesTo: string[];
  baseRiskLevel: "LOW" | "MEDIUM" | "HIGH";
  description: string;
  isOverridden: boolean;
  requiresApproval: boolean;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  updatedAt: string | null;
  updatedByUserId: string | null;
};

export type RoomPolicy = {
  roomId: string;
  agentSessions: {
    allowedOrganizationRoles: string[];
    allowedRoomRoles: string[];
    canCreate: boolean;
    organizationRole: string | null;
    roomRole: string | null;
  };
  approvalDecisions: {
    allowedOrganizationRoles: string[];
    allowedRoomRoles: string[];
    canDecide: boolean;
    organizationRole: string | null;
    roomRole: string | null;
  };
  policyRules: {
    allowedOrganizationRoles: string[];
    canManage: boolean;
    organizationRole: string | null;
  };
  rules: RoomPolicyRule[];
};

export type RoomPolicyResponse = {
  policy: RoomPolicy;
};

export type UpdateRoomPolicyRuleResponse = {
  rule: RoomPolicyRule;
};

export type LocalApplyArtifactResponse =
  | {
      status: "approval_required";
      approval: ApprovalRequest;
    }
  | {
      status: "applied";
      approval: ApprovalRequest;
      result: {
        requestId: string;
        artifactId: string;
        summary: string | null;
        metadata: Record<string, unknown>;
      };
    };

export type LocalRunCheckArtifactResponse =
  | {
      status: "approval_required";
      approval: ApprovalRequest;
    }
  | {
      status: "passed";
      approval: ApprovalRequest;
      result: {
        requestId: string;
        artifactId: string;
        summary: string | null;
        metadata: Record<string, unknown>;
      };
    };

export class WorkroomApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "WorkroomApiError";
    this.status = status;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  user: DevUser;
};

export async function workroomApi<T>(path: string, options: RequestOptions): Promise<T> {
  const headers = createWorkroomHeaders(options, "application/json");

  const response = await fetch(`/api/workroom${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new WorkroomApiError(response.status, await readErrorMessage(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function workroomApiBlob(path: string, options: RequestOptions): Promise<Blob> {
  const headers = createWorkroomHeaders(options, "application/octet-stream");

  const response = await fetch(`/api/workroom${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new WorkroomApiError(response.status, await readErrorMessage(response));
  }

  return response.blob();
}

function createWorkroomHeaders(options: RequestOptions, accept: string): Headers {
  const headers = new Headers({
    accept,
    "x-dev-user-email": options.user.email
  });

  if (options.user.name) {
    headers.set("x-dev-user-name", options.user.name);
  }

  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
  }

  return headers;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: unknown };

    if (typeof payload.error === "string") {
      return payload.error;
    }
  } catch {
    return response.statusText;
  }

  return response.statusText;
}
