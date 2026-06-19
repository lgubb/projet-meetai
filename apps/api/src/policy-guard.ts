import type { ApprovalRequest, TaskRiskLevel } from "@jean/shared";
import type { ApiDatabase } from "./db.js";

export type RoomMcpPolicy = {
  action: string;
  approvalId: string | null;
  artifactId: string | null;
  reason: string;
  requiresApproval: boolean;
  riskLevel: TaskRiskLevel;
  ruleId: string | null;
  taskId: string | null;
  toolName: string;
};

export type RoomPolicyRule = {
  id: string;
  action: string;
  appliesTo: string[];
  baseRiskLevel: TaskRiskLevel;
  description: string;
  isOverridden: boolean;
  requiresApproval: boolean;
  riskLevel: TaskRiskLevel;
  updatedAt: Date | null;
  updatedByUserId: string | null;
};

export const publishPreviewApprovalAction = "publish_preview";
export const localApplyApprovalAction = "apply_to_local_repo";
export const localCheckApprovalAction = "run_local_check";
export const publishPreviewPolicyRuleId = "publish-preview";
export const localApplyPolicyRuleId = "apply-local-artifact";
export const localCheckPolicyRuleId = "run-local-check";

const baseRoomPolicyRules = [
  {
    id: publishPreviewPolicyRuleId,
    action: publishPreviewApprovalAction,
    appliesTo: ["room.set_preview_url", "preview.publish_url", "PATCH /rooms/:roomId/artifacts/:artifactId/preview-url"],
    description: "Publishing a preview URL exposes generated content to room participants.",
    requiresApproval: true,
    riskLevel: "MEDIUM"
  },
  {
    id: localApplyPolicyRuleId,
    action: localApplyApprovalAction,
    appliesTo: ["POST /rooms/:roomId/artifacts/:artifactId/apply-local"],
    description: "Applying generated files writes to the user's local repository through the bridge.",
    requiresApproval: true,
    riskLevel: "MEDIUM"
  },
  {
    id: localCheckPolicyRuleId,
    action: localCheckApprovalAction,
    appliesTo: ["POST /rooms/:roomId/artifacts/:artifactId/run-check"],
    description: "Running local checks executes a predeclared command on the user's machine through the bridge.",
    requiresApproval: true,
    riskLevel: "MEDIUM"
  }
] satisfies Array<Omit<RoomPolicyRule, "baseRiskLevel" | "isOverridden" | "updatedAt" | "updatedByUserId">>;

const riskRank: Record<TaskRiskLevel, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3
};

export function classifyRoomMcpToolPolicy(toolName: string, args: Record<string, unknown>): RoomMcpPolicy {
  if (toolName === "room.set_preview_url" || toolName === "preview.publish_url") {
    return {
      action: publishPreviewApprovalAction,
      approvalId: optionalString(args.approvalId),
      artifactId: optionalString(args.artifactId),
      reason: "Publishing a preview URL exposes generated content to room participants.",
      requiresApproval: true,
      riskLevel: "MEDIUM",
      ruleId: publishPreviewPolicyRuleId,
      taskId: optionalString(args.taskId),
      toolName
    };
  }

  return {
    action: toolName,
    approvalId: null,
    artifactId: optionalString(args.artifactId),
    reason: "Low-risk room-scoped action.",
    requiresApproval: false,
    riskLevel: "LOW",
    ruleId: null,
    taskId: optionalString(args.taskId),
    toolName
  };
}

export function listRoomPolicyRules(): RoomPolicyRule[] {
  return baseRoomPolicyRules.map((rule) => applyPolicyRuleOverride(rule, null));
}

export async function listOrganizationPolicyRules(db: ApiDatabase, organizationId: string): Promise<RoomPolicyRule[]> {
  const overrides = await db.organizationPolicyRuleOverride.findMany({
    where: {
      organizationId
    }
  });

  return baseRoomPolicyRules.map((rule) => {
    const override = overrides.find((candidate) => candidate.ruleId === rule.id) ?? null;

    return applyPolicyRuleOverride(rule, override);
  });
}

export async function updateOrganizationPolicyRuleOverride(
  db: ApiDatabase,
  input: {
    organizationId: string;
    riskLevel: TaskRiskLevel;
    ruleId: string;
    updatedByUserId: string;
  }
): Promise<RoomPolicyRule | null> {
  const rule = findBaseRoomPolicyRule(input.ruleId);

  if (!rule) {
    return null;
  }

  const riskLevel = maxRiskLevel(rule.riskLevel, input.riskLevel);
  const override = await db.organizationPolicyRuleOverride.upsert({
    where: {
      organizationId_ruleId: {
        organizationId: input.organizationId,
        ruleId: input.ruleId
      }
    },
    create: {
      organizationId: input.organizationId,
      ruleId: input.ruleId,
      riskLevel,
      updatedByUserId: input.updatedByUserId
    },
    update: {
      riskLevel,
      updatedByUserId: input.updatedByUserId
    }
  });

  return applyPolicyRuleOverride(rule, override);
}

export async function classifyRoomMcpToolPolicyForRoom(
  db: ApiDatabase,
  roomId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<RoomMcpPolicy> {
  const policy = classifyRoomMcpToolPolicy(toolName, args);

  if (!policy.ruleId) {
    return policy;
  }

  const room = await db.room.findUnique({
    where: {
      id: roomId
    },
    select: {
      organizationId: true
    }
  });

  if (!room) {
    return policy;
  }

  return {
    ...policy,
    riskLevel: await getOrganizationPolicyRuleRiskLevel(db, room.organizationId, policy.ruleId)
  };
}

export async function getOrganizationPolicyRuleRiskLevel(
  db: ApiDatabase,
  organizationId: string,
  ruleId: string
): Promise<TaskRiskLevel> {
  const rule = findBaseRoomPolicyRule(ruleId);

  if (!rule) {
    return "LOW";
  }

  const override = await db.organizationPolicyRuleOverride.findUnique({
    where: {
      organizationId_ruleId: {
        organizationId,
        ruleId
      }
    }
  });

  return maxRiskLevel(rule.riskLevel, override?.riskLevel ?? rule.riskLevel);
}

export function isPolicyApprovalSatisfied(policy: RoomMcpPolicy, approval: ApprovalRequest): boolean {
  if (!policy.requiresApproval || approval.status !== "APPROVED") {
    return false;
  }

  if (approval.action !== policy.action) {
    return false;
  }

  if (riskRank[approval.riskLevel] < riskRank[policy.riskLevel]) {
    return false;
  }

  if (policy.taskId && approval.taskId !== policy.taskId) {
    return false;
  }

  if (policy.artifactId && approval.artifactId !== policy.artifactId) {
    return false;
  }

  return true;
}

export function isRiskLevelSatisfied(requiredRiskLevel: TaskRiskLevel, approval: ApprovalRequest): boolean {
  return riskRank[approval.riskLevel] >= riskRank[requiredRiskLevel];
}

function findBaseRoomPolicyRule(ruleId: string) {
  return baseRoomPolicyRules.find((rule) => rule.id === ruleId) ?? null;
}

function applyPolicyRuleOverride(
  rule: (typeof baseRoomPolicyRules)[number],
  override: { riskLevel: TaskRiskLevel; updatedAt: Date; updatedByUserId: string | null } | null
): RoomPolicyRule {
  const riskLevel = maxRiskLevel(rule.riskLevel, override?.riskLevel ?? rule.riskLevel);

  return {
    ...rule,
    appliesTo: [...rule.appliesTo],
    baseRiskLevel: rule.riskLevel,
    isOverridden: riskLevel !== rule.riskLevel,
    riskLevel,
    updatedAt: override?.updatedAt ?? null,
    updatedByUserId: override?.updatedByUserId ?? null
  };
}

function maxRiskLevel(first: TaskRiskLevel, second: TaskRiskLevel): TaskRiskLevel {
  return riskRank[first] >= riskRank[second] ? first : second;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
