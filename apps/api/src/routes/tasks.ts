import type { FastifyInstance } from "fastify";
import type { AgentIntent, AgentTaskType } from "@jean/jean-core";
import {
  artifactStatusSchema,
  artifactTypeSchema,
  metadataSchema,
  taskStatusSchema,
  type ApprovalRequest,
  type ArtifactType,
  type TaskRiskLevel
} from "@jean/shared";
import { z } from "zod";

import { upsertCurrentUser } from "../auth.js";
import { HttpError, notFound } from "../errors.js";
import { ensureJeanAgent } from "../jean-flow.js";
import { runJeanTask } from "../jean-task-runner.js";
import {
  getOrganizationPolicyRuleRiskLevel,
  isRiskLevelSatisfied,
  localApplyApprovalAction,
  localApplyPolicyRuleId,
  localCheckApprovalAction,
  localCheckPolicyRuleId,
  publishPreviewApprovalAction,
  publishPreviewPolicyRuleId
} from "../policy-guard.js";
import { createRoomApproval, listRoomApprovals, publishRoomEvent, recordRoomEvent } from "../room-mcp-service.js";
import { createZipArchive } from "../zip.js";
import {
  appendTaskLog,
  createTaskWithArtifact,
  getRoomTaskState,
  listArtifactFiles,
  listRoomTaskState,
  patchArtifact,
  updateArtifact,
  updateArtifactPreviewUrl,
  updateTaskStatus
} from "../room-task-service.js";

const roomParamsSchema = z
  .object({
    roomId: z.string().min(1)
  })
  .strict();

const taskParamsSchema = z
  .object({
    roomId: z.string().min(1),
    taskId: z.string().min(1)
  })
  .strict();

const artifactParamsSchema = z
  .object({
    roomId: z.string().min(1),
    artifactId: z.string().min(1)
  })
  .strict();

const createTaskBodySchema = z
  .object({
    title: z.string().min(1),
    description: z.string().min(1).optional(),
    artifact: z
      .object({
        title: z.string().min(1).optional(),
        type: artifactTypeSchema.optional(),
        content: metadataSchema.optional()
      })
      .strict()
      .optional()
  })
  .strict();

const updateTaskStatusBodySchema = z
  .object({
    status: taskStatusSchema
  })
  .strict();

const appendTaskLogBodySchema = z
  .object({
    message: z.string().min(1)
  })
  .strict();

const commentQuerySchema = z
  .object({
    agentRunEventId: z.string().min(1).optional(),
    artifactFileId: z.string().min(1).optional(),
    artifactId: z.string().min(1).optional()
  })
  .strict();

const createCommentBodySchema = z
  .object({
    agentRunEventId: z.string().min(1).optional(),
    artifactFileId: z.string().min(1).optional(),
    artifactId: z.string().min(1).optional(),
    body: z.string().min(1).max(4000),
    lineNumber: z.number().int().positive().optional()
  })
  .strict()
  .refine((body) => body.artifactId || body.artifactFileId || body.agentRunEventId)
  .refine((body) => body.lineNumber === undefined || body.artifactFileId !== undefined);

const retryTaskBodySchema = z
  .object({
    instruction: z.string().min(1).optional()
  })
  .strict();

const updateArtifactBodySchema = z
  .object({
    title: z.string().min(1).optional(),
    status: artifactStatusSchema.optional(),
    content: metadataSchema.optional()
  })
  .strict()
  .refine((body) => body.title !== undefined || body.status !== undefined || body.content !== undefined);

const patchArtifactBodySchema = z
  .object({
    patch: metadataSchema
  })
  .strict();

const updateArtifactPreviewUrlBodySchema = z
  .object({
    approvalId: z.string().min(1).optional(),
    previewUrl: z.string().url()
  })
  .strict();

const applyArtifactFilesBodySchema = z
  .object({
    approvalId: z.string().min(1).optional()
  })
  .strict();

const runArtifactCheckBodySchema = z
  .object({
    approvalId: z.string().min(1).optional(),
    checkName: z.string().min(1).optional()
  })
  .strict();

type RoomCommentRecord = {
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
  createdByUser?: {
    id: string;
    email: string;
    name: string | null;
  } | null;
};
type CreateCommentBody = z.infer<typeof createCommentBodySchema>;
type LocalApplyBridgeFile = {
  path: string;
  content: string;
  contentHash: string;
  size: number;
};

export function registerTaskRoutes(server: FastifyInstance): void {
  server.get("/rooms/:roomId/tasks", async (request) => {
    const params = roomParamsSchema.parse(request.params);
    const user = await upsertCurrentUser(server.db, request);

    await findAccessibleRoom(server, params.roomId, user.id);

    return {
      items: await listRoomTaskState(server, params.roomId)
    };
  });

  server.post("/rooms/:roomId/tasks", async (request, reply) => {
    const params = roomParamsSchema.parse(request.params);
    const body = createTaskBodySchema.parse(request.body);
    const user = await upsertCurrentUser(server.db, request);

    await findAccessibleRoom(server, params.roomId, user.id);

    const bundle = await createTaskWithArtifact(server, {
      roomId: params.roomId,
      createdByUserId: user.id,
      title: body.title,
      description: body.description ?? null,
      artifact: {
        title: body.artifact?.title ?? body.title,
        type: body.artifact?.type ?? "DOCUMENT",
        content: body.artifact?.content ?? {
          text: `Draft for ${body.title}`
        }
      }
    });

    for (const event of bundle.events) {
      server.roomEvents.publish(event);
    }

    return reply.code(201).send({
      task: bundle.task,
      artifact: bundle.artifact
    });
  });

  server.patch("/rooms/:roomId/tasks/:taskId/status", async (request) => {
    const params = taskParamsSchema.parse(request.params);
    const body = updateTaskStatusBodySchema.parse(request.body);
    const user = await upsertCurrentUser(server.db, request);

    await findAccessibleRoom(server, params.roomId, user.id);

    const result = await updateTaskStatus(server, {
      roomId: params.roomId,
      taskId: params.taskId,
      status: body.status
    });

    if (!result) {
      notFound("Task not found.");
    }

    if (body.status === "CANCELED") {
      server.localAgentBridge.cancelTask(params.roomId, params.taskId, "Canceled by a room user.");
    }

    server.roomEvents.publish(result.event);

    return {
      task: result.task
    };
  });

  server.post("/rooms/:roomId/tasks/:taskId/retry", async (request, reply) => {
    const params = taskParamsSchema.parse(request.params);
    const body = retryTaskBodySchema.parse(request.body ?? {});
    const user = await upsertCurrentUser(server.db, request);
    const room = await findAccessibleRoom(server, params.roomId, user.id);
    const source = await getRoomTaskState(server, params);

    if (!source) {
      notFound("Task not found.");
    }

    if (isTaskInFlight(source.task.status)) {
      throw new HttpError(409, "Cannot retry a task that is still in flight.");
    }

    const sourceArtifact = source.artifacts[0];

    if (!sourceArtifact) {
      notFound("Task artifact not found.");
    }

    const taskType = taskTypeForArtifact(sourceArtifact.type);

    if (!taskType) {
      throw new HttpError(409, `Cannot retry ${sourceArtifact.type} artifacts.`);
    }

    const jean = await ensureJeanAgent(server, room.organizationId);
    const instruction = body.instruction?.trim() || `Retry from current artifact: ${source.task.title}`;
    const bundle = await createTaskWithArtifact(server, {
      roomId: params.roomId,
      createdByUserId: user.id,
      assignedAgentId: jean.id,
      title: `Retry: ${source.task.title}`,
      description: instruction,
      artifact: {
        title: sourceArtifact.title,
        type: sourceArtifact.type,
        content: buildRetryArtifactContent({
          instruction,
          sourceArtifactId: sourceArtifact.id,
          sourceContent: sourceArtifact.latestVersion?.content,
          sourceTaskId: source.task.id,
          userId: user.id
        })
      }
    });

    for (const event of bundle.events) {
      server.roomEvents.publish(event);
    }

    const retryLog = await appendTaskLog(server, {
      roomId: params.roomId,
      taskId: bundle.task.id,
      message: `Retry requested from task ${source.task.id}.`
    });

    if (retryLog) {
      server.roomEvents.publish(retryLog.event);
    }

    void runJeanTask(server, {
      intent: buildRetryIntent({
        artifactType: sourceArtifact.type,
        commandText: instruction,
        taskType
      }),
      task: bundle.task,
      artifact: bundle.artifact,
      agent: jean
    }).catch((error) => {
      server.log.error(error, "Retry task runner failed unexpectedly.");
    });

    return reply.code(201).send({
      task: bundle.task,
      artifact: bundle.artifact
    });
  });

  server.post("/rooms/:roomId/tasks/:taskId/logs", async (request, reply) => {
    const params = taskParamsSchema.parse(request.params);
    const body = appendTaskLogBodySchema.parse(request.body);
    const user = await upsertCurrentUser(server.db, request);

    await findAccessibleRoom(server, params.roomId, user.id);

    const result = await appendTaskLog(server, {
      roomId: params.roomId,
      taskId: params.taskId,
      message: body.message
    });

    if (!result) {
      notFound("Task not found.");
    }

    server.roomEvents.publish(result.event);

    return reply.code(201).send({
      log: result.log
    });
  });

  server.patch("/rooms/:roomId/artifacts/:artifactId", async (request) => {
    const params = artifactParamsSchema.parse(request.params);
    const body = updateArtifactBodySchema.parse(request.body);
    const user = await upsertCurrentUser(server.db, request);

    await findAccessibleRoom(server, params.roomId, user.id);

    const result = await updateArtifact(server, {
      roomId: params.roomId,
      artifactId: params.artifactId,
      title: body.title,
      status: body.status,
      content: body.content
    });

    if (!result) {
      notFound("Artifact not found.");
    }

    server.roomEvents.publish(result.event);

    return {
      artifact: result.artifact
    };
  });

  server.post("/rooms/:roomId/artifacts/:artifactId/patches", async (request, reply) => {
    const params = artifactParamsSchema.parse(request.params);
    const body = patchArtifactBodySchema.parse(request.body);
    const user = await upsertCurrentUser(server.db, request);

    await findAccessibleRoom(server, params.roomId, user.id);

    const result = await patchArtifact(server, {
      roomId: params.roomId,
      artifactId: params.artifactId,
      patch: body.patch
    });

    if (!result) {
      notFound("Artifact not found.");
    }

    server.roomEvents.publish(result.event);

    return reply.code(201).send({
      artifact: result.artifact
    });
  });

  server.get("/rooms/:roomId/artifacts/:artifactId/files", async (request) => {
    const params = artifactParamsSchema.parse(request.params);
    const user = await upsertCurrentUser(server.db, request);

    await findAccessibleRoom(server, params.roomId, user.id);

    const files = await listArtifactFiles(server, params);

    if (!files) {
      notFound("Artifact not found.");
    }

    return {
      files
    };
  });

  server.get("/rooms/:roomId/artifacts/:artifactId/files.zip", async (request, reply) => {
    const params = artifactParamsSchema.parse(request.params);
    const user = await upsertCurrentUser(server.db, request);

    await findAccessibleRoom(server, params.roomId, user.id);

    const files = await listArtifactFiles(server, params);

    if (!files) {
      notFound("Artifact not found.");
    }

    const zip = createZipArchive(
      files.map((file) => ({
        path: file.path,
        content: file.latestVersion?.content ?? ""
      }))
    );

    return reply
      .header("content-disposition", `attachment; filename="artifact-${params.artifactId}-files.zip"`)
      .header("content-length", String(zip.byteLength))
      .header("content-type", "application/zip")
      .send(zip);
  });

  server.post("/rooms/:roomId/artifacts/:artifactId/local-actions/apply", async (request, reply) => {
    const params = artifactParamsSchema.parse(request.params);
    const body = applyArtifactFilesBodySchema.parse(request.body ?? {});
    const user = await upsertCurrentUser(server.db, request);

    await findAccessibleRoom(server, params.roomId, user.id);

    const files = await listArtifactFiles(server, params);

    if (!files) {
      notFound("Artifact not found.");
    }

    const bridgeFiles = files.flatMap((file) =>
      file.latestVersion
        ? [
            {
              path: file.path,
              content: file.latestVersion.content,
              contentHash: file.latestVersion.contentHash,
              size: file.latestVersion.size
            }
          ]
        : []
    );

    if (bridgeFiles.length === 0) {
      throw new HttpError(409, "Artifact has no persisted files to apply.");
    }

    const approval = await resolveLocalApplyApproval(server, {
      approvalId: body.approvalId,
      artifactId: params.artifactId,
      files: bridgeFiles,
      roomId: params.roomId,
      userId: user.id
    });

    if (approval.status !== "APPROVED") {
      return reply.code(202).send({
        status: "approval_required",
        approval
      });
    }

    const startedEvent = await recordRoomEvent(server, {
      type: "LOCAL_ACTION_STARTED",
      roomId: params.roomId,
      actorUserId: user.id,
      artifactId: params.artifactId,
      approvalId: approval.id,
      payload: {
        action: localApplyApprovalAction,
        approval,
        fileCount: bridgeFiles.length,
        files: bridgeFiles.map(toLocalApplyFileSummary)
      }
    });
    publishRoomEvent(server, startedEvent);

    try {
      const result = await server.localAgentBridge.dispatchLocalAction({
        roomId: params.roomId,
        artifactId: params.artifactId,
        actionType: "apply_artifact_files",
        files: bridgeFiles,
        requiredCapability: "CODE_GENERATION",
        preferredProvider: "CODEX",
        timeoutMs: 1000 * 60
      });
      const finishedEvent = await recordRoomEvent(server, {
        type: "LOCAL_ACTION_FINISHED",
        roomId: params.roomId,
        actorAgentId: result.agent.agentId,
        artifactId: params.artifactId,
        approvalId: approval.id,
        payload: {
          action: localApplyApprovalAction,
          agent: result.agent,
          requestId: result.requestId,
          summary: result.summary,
          metadata: result.metadata
        }
      });

      publishRoomEvent(server, finishedEvent);

      return {
        status: "applied",
        approval,
        result,
        event: finishedEvent
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const failedEvent = await recordRoomEvent(server, {
        type: "LOCAL_ACTION_FAILED",
        roomId: params.roomId,
        actorUserId: user.id,
        artifactId: params.artifactId,
        approvalId: approval.id,
        payload: {
          action: localApplyApprovalAction,
          error: errorMessage
        }
      });

      publishRoomEvent(server, failedEvent);
      throw new HttpError(502, errorMessage);
    }
  });

  server.post("/rooms/:roomId/artifacts/:artifactId/local-actions/checks", async (request, reply) => {
    const params = artifactParamsSchema.parse(request.params);
    const body = runArtifactCheckBodySchema.parse(request.body ?? {});
    const user = await upsertCurrentUser(server.db, request);
    const checkName = body.checkName ?? "test";

    await findAccessibleRoom(server, params.roomId, user.id);

    const files = await listArtifactFiles(server, params);

    if (!files) {
      notFound("Artifact not found.");
    }

    const approval = await resolveLocalCheckApproval(server, {
      approvalId: body.approvalId,
      artifactId: params.artifactId,
      checkName,
      roomId: params.roomId,
      userId: user.id
    });

    if (approval.status !== "APPROVED") {
      return reply.code(202).send({
        status: "approval_required",
        approval
      });
    }

    const startedEvent = await recordRoomEvent(server, {
      type: "LOCAL_ACTION_STARTED",
      roomId: params.roomId,
      actorUserId: user.id,
      artifactId: params.artifactId,
      approvalId: approval.id,
      payload: {
        action: localCheckApprovalAction,
        approval,
        checkName
      }
    });
    publishRoomEvent(server, startedEvent);

    try {
      const result = await server.localAgentBridge.dispatchLocalAction({
        roomId: params.roomId,
        artifactId: params.artifactId,
        actionType: "run_check",
        checkName,
        requiredCapability: "CODE_GENERATION",
        preferredProvider: "CODEX",
        timeoutMs: 1000 * 60
      });
      const finishedEvent = await recordRoomEvent(server, {
        type: "LOCAL_ACTION_FINISHED",
        roomId: params.roomId,
        actorAgentId: result.agent.agentId,
        artifactId: params.artifactId,
        approvalId: approval.id,
        payload: {
          action: localCheckApprovalAction,
          agent: result.agent,
          checkName,
          requestId: result.requestId,
          summary: result.summary,
          metadata: result.metadata
        }
      });

      publishRoomEvent(server, finishedEvent);

      return {
        status: "passed",
        approval,
        result,
        event: finishedEvent
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const failedEvent = await recordRoomEvent(server, {
        type: "LOCAL_ACTION_FAILED",
        roomId: params.roomId,
        actorUserId: user.id,
        artifactId: params.artifactId,
        approvalId: approval.id,
        payload: {
          action: localCheckApprovalAction,
          checkName,
          error: errorMessage
        }
      });

      publishRoomEvent(server, failedEvent);
      throw new HttpError(502, errorMessage);
    }
  });

  server.get("/rooms/:roomId/comments", async (request) => {
    const params = roomParamsSchema.parse(request.params);
    const query = commentQuerySchema.parse(request.query);
    const user = await upsertCurrentUser(server.db, request);

    await findAccessibleRoom(server, params.roomId, user.id);

    const comments = (await server.db.roomComment.findMany({
      where: {
        roomId: params.roomId,
        ...(query.artifactId ? { artifactId: query.artifactId } : {}),
        ...(query.artifactFileId ? { artifactFileId: query.artifactFileId } : {}),
        ...(query.agentRunEventId ? { agentRunEventId: query.agentRunEventId } : {})
      },
      include: {
        createdByUser: {
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
    })) as RoomCommentRecord[];

    return {
      comments: comments.map(serializeRoomComment)
    };
  });

  server.post("/rooms/:roomId/comments", async (request, reply) => {
    const params = roomParamsSchema.parse(request.params);
    const body = createCommentBodySchema.parse(request.body);
    const user = await upsertCurrentUser(server.db, request);

    await findAccessibleRoom(server, params.roomId, user.id);
    await assertCommentTargetsInRoom(server, params.roomId, body);

    const comment = (await server.db.roomComment.create({
      data: {
        roomId: params.roomId,
        artifactId: body.artifactId ?? null,
        artifactFileId: body.artifactFileId ?? null,
        agentRunEventId: body.agentRunEventId ?? null,
        createdByUserId: user.id,
        lineNumber: body.lineNumber ?? null,
        body: body.body
      },
      include: {
        createdByUser: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      }
    })) as RoomCommentRecord;

    return reply.code(201).send({
      comment: serializeRoomComment(comment)
    });
  });

  server.patch("/rooms/:roomId/artifacts/:artifactId/preview-url", async (request, reply) => {
    const params = artifactParamsSchema.parse(request.params);
    const body = updateArtifactPreviewUrlBodySchema.parse(request.body);
    const user = await upsertCurrentUser(server.db, request);

    await findAccessibleRoom(server, params.roomId, user.id);

    const approval = await resolvePreviewPublishApproval(server, {
      approvalId: body.approvalId,
      artifactId: params.artifactId,
      previewUrl: body.previewUrl,
      roomId: params.roomId,
      userId: user.id
    });

    if (approval.status !== "APPROVED") {
      return reply.code(202).send({
        status: "approval_required",
        approval
      });
    }

    const result = await updateArtifactPreviewUrl(server, {
      roomId: params.roomId,
      artifactId: params.artifactId,
      previewUrl: body.previewUrl
    });

    if (!result) {
      notFound("Artifact not found.");
    }

    server.roomEvents.publish(result.event);

    return {
      status: "published",
      approval,
      artifact: result.artifact
    };
  });
}

function isTaskInFlight(status: string): boolean {
  return status === "PENDING" || status === "RUNNING" || status === "WAITING_FOR_APPROVAL";
}

function taskTypeForArtifact(artifactType: ArtifactType): AgentTaskType | null {
  const taskTypes: Record<ArtifactType, AgentTaskType | null> = {
    CODE: "code",
    DIAGRAM: "diagram",
    DOCUMENT: "doc",
    LOG: null,
    PREVIEW: "prototype",
    RESEARCH: "research"
  };

  return taskTypes[artifactType];
}

function buildRetryArtifactContent(input: {
  instruction: string;
  sourceArtifactId: string;
  sourceContent: Record<string, unknown> | null | undefined;
  sourceTaskId: string;
  userId: string;
}): Record<string, unknown> {
  return {
    ...(isRecord(input.sourceContent) ? input.sourceContent : {}),
    retry: {
      instruction: input.instruction,
      requestedByUserId: input.userId,
      sourceArtifactId: input.sourceArtifactId,
      sourceTaskId: input.sourceTaskId
    }
  };
}

function buildRetryIntent(input: {
  artifactType: ArtifactType;
  commandText: string;
  taskType: AgentTaskType;
}): AgentIntent {
  return {
    artifactType: input.artifactType,
    commandText: input.commandText,
    confidence: 0.9,
    description: input.commandText,
    language: "unknown",
    responseText: "Retrying the task from the current artifact.",
    shouldAct: true,
    taskType: input.taskType,
    title: "Retry task"
  };
}

async function resolveLocalApplyApproval(
  server: FastifyInstance,
  input: {
    approvalId?: string;
    artifactId: string;
    files: LocalApplyBridgeFile[];
    roomId: string;
    userId: string;
  }
): Promise<ApprovalRequest> {
  const approvals = await listRoomApprovals(server, input.roomId);
  const requiredRiskLevel = await getRoomPolicyRuleRiskLevel(server, input.roomId, localApplyPolicyRuleId);

  if (input.approvalId) {
    const approval = approvals.find((candidate) => candidate.id === input.approvalId);

    if (!approval) {
      notFound("Approval not found.");
    }

    assertLocalApplyApproval(approval, input.artifactId, requiredRiskLevel);

    return approval;
  }

  const reusableApproval = approvals.find(
    (approval) =>
      isLocalApplyApproval(approval, input.artifactId, requiredRiskLevel) &&
      (approval.status === "APPROVED" || approval.status === "PENDING")
  );

  if (reusableApproval) {
    return reusableApproval;
  }

  const { approval } = await createRoomApproval(server, {
    roomId: input.roomId,
    artifactId: input.artifactId,
    requestedByUserId: input.userId,
    action: localApplyApprovalAction,
    reason: "Apply generated artifact files to the local repository through the connected bridge.",
    riskLevel: requiredRiskLevel,
    payload: {
      executionLocation: "local_machine",
      fileCount: input.files.length,
      files: input.files.map(toLocalApplyFileSummary)
    }
  });

  return approval;
}

function assertLocalApplyApproval(approval: ApprovalRequest, artifactId: string, requiredRiskLevel: TaskRiskLevel): void {
  if (!isLocalApplyApproval(approval, artifactId, requiredRiskLevel)) {
    throw new HttpError(400, "Approval is not scoped to this local apply action.");
  }
}

function isLocalApplyApproval(approval: ApprovalRequest, artifactId: string, requiredRiskLevel: TaskRiskLevel): boolean {
  return (
    approval.action === localApplyApprovalAction &&
    approval.artifactId === artifactId &&
    isRiskLevelSatisfied(requiredRiskLevel, approval)
  );
}

async function resolveLocalCheckApproval(
  server: FastifyInstance,
  input: {
    approvalId?: string;
    artifactId: string;
    checkName: string;
    roomId: string;
    userId: string;
  }
): Promise<ApprovalRequest> {
  const approvals = await listRoomApprovals(server, input.roomId);
  const requiredRiskLevel = await getRoomPolicyRuleRiskLevel(server, input.roomId, localCheckPolicyRuleId);

  if (input.approvalId) {
    const approval = approvals.find((candidate) => candidate.id === input.approvalId);

    if (!approval) {
      notFound("Approval not found.");
    }

    assertLocalCheckApproval(approval, input.artifactId, input.checkName, requiredRiskLevel);

    return approval;
  }

  const reusableApproval = approvals.find(
    (approval) =>
      isLocalCheckApproval(approval, input.artifactId, input.checkName, requiredRiskLevel) &&
      (approval.status === "APPROVED" || approval.status === "PENDING")
  );

  if (reusableApproval) {
    return reusableApproval;
  }

  const { approval } = await createRoomApproval(server, {
    roomId: input.roomId,
    artifactId: input.artifactId,
    requestedByUserId: input.userId,
    action: localCheckApprovalAction,
    reason: `Run local check "${input.checkName}" through the connected bridge.`,
    riskLevel: requiredRiskLevel,
    payload: {
      checkName: input.checkName,
      executionLocation: "local_machine"
    }
  });

  return approval;
}

function assertLocalCheckApproval(
  approval: ApprovalRequest,
  artifactId: string,
  checkName: string,
  requiredRiskLevel: TaskRiskLevel
): void {
  if (!isLocalCheckApproval(approval, artifactId, checkName, requiredRiskLevel)) {
    throw new HttpError(400, "Approval is not scoped to this local check action.");
  }
}

function isLocalCheckApproval(
  approval: ApprovalRequest,
  artifactId: string,
  checkName: string,
  requiredRiskLevel: TaskRiskLevel
): boolean {
  return (
    approval.action === localCheckApprovalAction &&
    approval.artifactId === artifactId &&
    approval.payload.checkName === checkName &&
    isRiskLevelSatisfied(requiredRiskLevel, approval)
  );
}

async function resolvePreviewPublishApproval(
  server: FastifyInstance,
  input: {
    approvalId?: string;
    artifactId: string;
    previewUrl: string;
    roomId: string;
    userId: string;
  }
): Promise<ApprovalRequest> {
  const approvals = await listRoomApprovals(server, input.roomId);
  const requiredRiskLevel = await getRoomPolicyRuleRiskLevel(server, input.roomId, publishPreviewPolicyRuleId);

  if (input.approvalId) {
    const approval = approvals.find((candidate) => candidate.id === input.approvalId);

    if (!approval) {
      notFound("Approval not found.");
    }

    assertPreviewPublishApproval(approval, input.artifactId, input.previewUrl, requiredRiskLevel);

    return approval;
  }

  const reusableApproval = approvals.find(
    (approval) =>
      isPreviewPublishApproval(approval, input.artifactId, input.previewUrl, requiredRiskLevel) &&
      (approval.status === "APPROVED" || approval.status === "PENDING")
  );

  if (reusableApproval) {
    return reusableApproval;
  }

  const { approval } = await createRoomApproval(server, {
    roomId: input.roomId,
    artifactId: input.artifactId,
    requestedByUserId: input.userId,
    action: publishPreviewApprovalAction,
    reason: "Publish a preview URL to room participants.",
    riskLevel: requiredRiskLevel,
    payload: {
      previewUrl: input.previewUrl,
      source: "artifact_preview_url_route"
    }
  });

  return approval;
}

function assertPreviewPublishApproval(
  approval: ApprovalRequest,
  artifactId: string,
  previewUrl: string,
  requiredRiskLevel: TaskRiskLevel
): void {
  if (!isPreviewPublishApproval(approval, artifactId, previewUrl, requiredRiskLevel)) {
    throw new HttpError(400, "Approval is not scoped to this preview publish action.");
  }
}

function isPreviewPublishApproval(
  approval: ApprovalRequest,
  artifactId: string,
  previewUrl: string,
  requiredRiskLevel: TaskRiskLevel
): boolean {
  return (
    approval.action === publishPreviewApprovalAction &&
    approval.artifactId === artifactId &&
    approval.payload.previewUrl === previewUrl &&
    isRiskLevelSatisfied(requiredRiskLevel, approval)
  );
}

function toLocalApplyFileSummary(file: LocalApplyBridgeFile): Record<string, unknown> {
  return {
    path: file.path,
    contentHash: file.contentHash,
    size: file.size
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Local action failed.";
}

async function assertCommentTargetsInRoom(
  server: FastifyInstance,
  roomId: string,
  target: CreateCommentBody
): Promise<void> {
  if (target.artifactId) {
    const artifact = await server.db.artifact.findFirst({
      where: {
        id: target.artifactId,
        roomId
      }
    });

    if (!artifact) {
      notFound("Comment artifact target not found.");
    }
  }

  if (target.artifactFileId) {
    const artifactFile = (await server.db.artifactFile.findFirst({
      where: {
        id: target.artifactFileId,
        roomId
      }
    })) as { artifactId: string } | null;

    if (!artifactFile) {
      notFound("Comment file target not found.");
    }

    if (target.artifactId && artifactFile.artifactId !== target.artifactId) {
      throw new HttpError(400, "Comment target mismatch.");
    }
  }

  if (target.agentRunEventId) {
    const runEvent = (await server.db.agentRunEvent.findFirst({
      where: {
        id: target.agentRunEventId,
        roomId
      }
    })) as { artifactId: string | null } | null;

    if (!runEvent) {
      notFound("Comment run event target not found.");
    }

    if (target.artifactId && runEvent.artifactId && runEvent.artifactId !== target.artifactId) {
      throw new HttpError(400, "Comment target mismatch.");
    }
  }
}

function serializeRoomComment(comment: RoomCommentRecord) {
  return {
    id: comment.id,
    roomId: comment.roomId,
    artifactId: comment.artifactId,
    artifactFileId: comment.artifactFileId,
    agentRunEventId: comment.agentRunEventId,
    createdByUserId: comment.createdByUserId,
    createdByUserEmail: comment.createdByUser?.email ?? null,
    createdByUserName: comment.createdByUser?.name ?? null,
    lineNumber: comment.lineNumber,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString()
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function getRoomPolicyRuleRiskLevel(
  server: FastifyInstance,
  roomId: string,
  ruleId: string
): Promise<TaskRiskLevel> {
  const room = await server.db.room.findUnique({
    where: {
      id: roomId
    },
    select: {
      organizationId: true
    }
  });

  if (!room) {
    notFound("Room not found.");
  }

  return getOrganizationPolicyRuleRiskLevel(server.db, room.organizationId, ruleId);
}

async function findAccessibleRoom(server: FastifyInstance, roomId: string, userId: string) {
  const room = await server.db.room.findFirst({
    where: {
      id: roomId,
      organization: {
        members: {
          some: {
            userId
          }
        }
      }
    }
  });

  if (!room) {
    notFound("Room not found.");
  }

  return room;
}
