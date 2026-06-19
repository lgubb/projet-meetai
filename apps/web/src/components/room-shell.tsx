"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ConnectionState,
  ControlBar,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
  useParticipants,
  type ControlBarControls,
  type TrackReferenceOrPlaceholder
} from "@livekit/components-react";
import { type Participant, Track } from "livekit-client";
import type { ApprovalRequest, RealtimeArtifact, RealtimeRoomEvent, RealtimeTaskLog, RoomAgent, RoomEvent } from "@jean/shared";

import {
  type ApprovalDecisionResponse,
  type ArtifactFileItem,
  type ArtifactFilesResponse,
  type CreateRoomCommentResponse,
  type CreateRoomTaskResponse,
  type DevUser,
  type JoinRoomResponse,
  type LiveKitConnection,
  type LiveKitTokenResponse,
  type LocalCodexStatus,
  type LocalApplyArtifactResponse,
  type LocalRunCheckArtifactResponse,
  type Room,
  type RoomAgentsResponse,
  type RoomAgentRunEvent,
  type RoomApprovalsResponse,
  type RoomComment,
  type RoomCommentsResponse,
  type RoomParticipant,
  type RoomPolicy,
  type RoomPolicyRule,
  type RoomPolicyResponse,
  type RoomResponse,
  type RoomTaskItem,
  type RoomTasksResponse,
  type RoomToolCall,
  type RoomToolCallsResponse,
  type UpdateRoomPolicyRuleResponse,
  type UpdateRoomTaskStatusResponse,
  workroomApi,
  workroomApiBlob
} from "@/lib/workroom-api";
import { defaultDevUser, readSavedDevUser, saveDevUser } from "@/lib/dev-user";
import { useRoomEvents } from "@/lib/use-room-events";

type RoomShellProps = {
  roomId: string;
};

type SandboxSelection =
  | {
      type: "room";
    }
  | {
      type: "user";
      participantId: string;
    };

type AgentCompactStatus = "idle" | "working" | "approval_needed" | "blocked";
type JeanActionMode = "passive" | "listening" | "proposing" | "executing" | "approval_needed" | "blocked";
type TaskFilter = "active" | "all" | "blocked" | "done";
type ToolCallStatusFilter = "all" | RoomToolCall["status"];

type ActionMetrics = {
  confirmed: number;
  edited: number;
  canceled: number;
  falsePositive: number;
  falseNegative: number;
};

const liveKitControls: ControlBarControls = {
  camera: true,
  chat: false,
  leave: true,
  microphone: true,
  screenShare: false,
  settings: false
};
const taskFilters: TaskFilter[] = ["all", "active", "done", "blocked"];
const toolCallStatusFilters: ToolCallStatusFilter[] = ["all", "RUNNING", "SUCCEEDED", "FAILED", "BLOCKED"];

export function RoomShell({ roomId }: RoomShellProps) {
  const [user, setUser] = useState<DevUser>(defaultDevUser);
  const [draftUser, setDraftUser] = useState<DevUser>(defaultDevUser);
  const [hasLoadedUser, setHasLoadedUser] = useState(false);
  const [room, setRoom] = useState<Room | null>(null);
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [taskItems, setTaskItems] = useState<RoomTaskItem[]>([]);
  const [agents, setAgents] = useState<RoomAgent[]>([]);
  const [localCodexStatus, setLocalCodexStatus] = useState<LocalCodexStatus>({ status: "not_connected" });
  const [localCodexPairingCode, setLocalCodexPairingCode] = useState<string | null>(null);
  const [isCreatingLocalCodexPairing, setIsCreatingLocalCodexPairing] = useState(false);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [toolCalls, setToolCalls] = useState<RoomToolCall[]>([]);
  const [roomPolicy, setRoomPolicy] = useState<RoomPolicy | null>(null);
  const [updatingPolicyRuleId, setUpdatingPolicyRuleId] = useState<string | null>(null);
  const [isRefreshingToolCalls, setIsRefreshingToolCalls] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [activeSandbox, setActiveSandbox] = useState<SandboxSelection>({ type: "room" });
  const [jeanActionMode, setJeanActionMode] = useState<JeanActionMode>("passive");
  const [jeanActionDraft, setJeanActionDraft] = useState("Prepare a focused follow-up task from this room.");
  const [isConfirmingJeanAction, setIsConfirmingJeanAction] = useState(false);
  const [retryingTaskId, setRetryingTaskId] = useState<string | null>(null);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");
  const [toolCallStatusFilter, setToolCallStatusFilter] = useState<ToolCallStatusFilter>("all");
  const [actionMetrics, setActionMetrics] = useState<ActionMetrics>({
    canceled: 0,
    confirmed: 0,
    edited: 0,
    falseNegative: 0,
    falsePositive: 0
  });
  const [liveKitConnection, setLiveKitConnection] = useState<LiveKitConnection | null>(null);
  const [notice, setNotice] = useState("");
  const [isJoining, setIsJoining] = useState(true);
  const speakerLabelsById = useMemo(() => createSpeakerLabels(participants), [participants]);
  const {
    clearEvents,
    connectionState: roomEventsConnectionState,
    error: roomEventsError,
    events: roomEvents
  } = useRoomEvents(roomId, hasLoadedUser ? user : null);
  const displayedTaskItems = useMemo(() => mergeRoomTaskEvents(taskItems, roomEvents), [taskItems, roomEvents]);
  const activeTaskItem = useMemo(
    () => displayedTaskItems.find((item) => item.task.id === activeTaskId) ?? displayedTaskItems[0] ?? null,
    [activeTaskId, displayedTaskItems]
  );
  const jeanSpeechEvents = useMemo(
    () => roomEvents.filter(isAgentSpeechEvent),
    [roomEvents]
  );
  const roomAuditEvents = useMemo(() => roomEvents.filter(isRoomAuditEvent).map((event) => event.event), [roomEvents]);
  const pendingApprovals = useMemo(
    () => approvals.filter((approval) => approval.status === "PENDING"),
    [approvals]
  );
  const latestCreatedTaskId = useMemo(() => roomEvents.find(isTaskCreatedEvent)?.task.id ?? null, [roomEvents]);
  const humanParticipants = useMemo(
    () => participants.filter((participant) => participant.role !== "AGENT"),
    [participants]
  );
  const personalAgentsByUserId = useMemo(() => groupPersonalAgentsByUserId(agents), [agents]);
  const roomAgents = useMemo(() => agents.filter((agent) => !getAgentOwnerUserId(agent)), [agents]);
  const agentStatuses = useMemo(
    () => createAgentStatusMap(agents, displayedTaskItems, approvals, localCodexStatus),
    [agents, approvals, displayedTaskItems, localCodexStatus]
  );
  const sandboxTaskItems = useMemo(
    () => getSandboxTaskItems(activeSandbox, humanParticipants, personalAgentsByUserId, displayedTaskItems),
    [activeSandbox, displayedTaskItems, humanParticipants, personalAgentsByUserId]
  );
  const displayedJeanActionMode = useMemo(
    () => deriveJeanActionMode(jeanActionMode, displayedTaskItems, pendingApprovals, jeanSpeechEvents),
    [displayedTaskItems, jeanActionMode, jeanSpeechEvents, pendingApprovals]
  );
  const filteredTaskItems = useMemo(
    () => filterTaskItems(displayedTaskItems, taskFilter),
    [displayedTaskItems, taskFilter]
  );
  const filteredToolCalls = useMemo(
    () => filterToolCalls(toolCalls, toolCallStatusFilter),
    [toolCalls, toolCallStatusFilter]
  );

  useEffect(() => {
    const savedUser = readSavedDevUser();

    setUser(savedUser);
    setDraftUser(savedUser);
    setHasLoadedUser(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedUser) {
      return;
    }

    void joinAndLoadRoom(user);
  }, [hasLoadedUser, roomId, user]);

  useEffect(() => {
    if (displayedTaskItems.length === 0) {
      setActiveTaskId(null);
      return;
    }

    if (!activeTaskId || !displayedTaskItems.some((item) => item.task.id === activeTaskId)) {
      setActiveTaskId(displayedTaskItems[0]?.task.id ?? null);
    }
  }, [activeTaskId, displayedTaskItems]);

  useEffect(() => {
    if (!latestCreatedTaskId) {
      return;
    }

    if (displayedTaskItems.some((item) => item.task.id === latestCreatedTaskId)) {
      setActiveTaskId(latestCreatedTaskId);
    }
  }, [displayedTaskItems, latestCreatedTaskId]);

  useEffect(() => {
    if (roomAuditEvents.length === 0) {
      return;
    }

    const nextAgents = roomAuditEvents.map(readRoomAgentFromEvent).filter(isPresent);
    const nextApprovals = roomAuditEvents.map(readApprovalFromEvent).filter(isPresent);

    if (nextAgents.length > 0) {
      setAgents((current) => nextAgents.reduce(upsertRoomAgent, current));
    }

    if (nextApprovals.length > 0) {
      setApprovals((current) => nextApprovals.reduce(upsertApproval, current));
    }
  }, [roomAuditEvents]);

  useEffect(() => {
    if (activeSandbox.type === "user" && !humanParticipants.some((participant) => participant.id === activeSandbox.participantId)) {
      setActiveSandbox({ type: "room" });
    }
  }, [activeSandbox, humanParticipants]);

  useEffect(() => {
    if (!hasLoadedUser || localCodexStatus.status !== "pairing_pending") {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshLocalCodexStatus(localCodexPairingCode);
    }, 2500);

    return () => window.clearInterval(interval);
  }, [hasLoadedUser, localCodexPairingCode, localCodexStatus.status, roomId, user]);

  useEffect(() => {
    if (!hasLoadedUser) {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshToolCalls({ silent: true });
    }, 7500);

    return () => window.clearInterval(interval);
  }, [hasLoadedUser, roomId, user]);

  async function joinAndLoadRoom(activeUser: DevUser) {
    setIsJoining(true);
    setLiveKitConnection(null);
    setTaskItems([]);
    setAgents([]);
    setLocalCodexStatus({ status: "not_connected" });
    setLocalCodexPairingCode(null);
    setApprovals([]);
    setToolCalls([]);
    setRoomPolicy(null);
    setActiveSandbox({ type: "room" });
    setJeanActionMode("passive");
    setNotice("");

    try {
      await workroomApi<JoinRoomResponse>(`/rooms/${roomId}/join`, {
        method: "POST",
        user: activeUser
      });

      const data = await workroomApi<RoomResponse>(`/rooms/${roomId}`, {
        user: activeUser
      });

      setRoom(data.room);
      setParticipants(data.participants);

      const taskData = await workroomApi<RoomTasksResponse>(`/rooms/${roomId}/tasks`, {
        user: activeUser
      });

      setTaskItems(taskData.items);

      const agentsData = await workroomApi<RoomAgentsResponse>(`/rooms/${roomId}/agents`, {
        user: activeUser
      });

      setAgents(agentsData.agents);

      const localCodexData = await workroomApi<LocalCodexStatus>(`/rooms/${roomId}/local-codex/status`, {
        user: activeUser
      });

      setLocalCodexStatus(localCodexData);

      const approvalsData = await workroomApi<RoomApprovalsResponse>(`/rooms/${roomId}/approvals`, {
        user: activeUser
      });

      setApprovals(approvalsData.approvals);

      const toolCallsData = await workroomApi<RoomToolCallsResponse>(`/rooms/${roomId}/tool-calls`, {
        user: activeUser
      });

      setToolCalls(toolCallsData.toolCalls);

      const policyData = await workroomApi<RoomPolicyResponse>(`/rooms/${roomId}/policy`, {
        user: activeUser
      });

      setRoomPolicy(policyData.policy);

      const liveKitData = await workroomApi<LiveKitTokenResponse>(`/rooms/${roomId}/livekit-token`, {
        method: "POST",
        body: {},
        user: activeUser
      });

      setLiveKitConnection(liveKitData.livekit);
    } catch (error) {
      setNotice(getErrorMessage(error));
      setRoom(null);
      setParticipants([]);
      setTaskItems([]);
      setAgents([]);
      setLocalCodexStatus({ status: "not_connected" });
      setLocalCodexPairingCode(null);
      setApprovals([]);
      setToolCalls([]);
      setRoomPolicy(null);
      setActiveSandbox({ type: "room" });
      setJeanActionMode("blocked");
      setLiveKitConnection(null);
    } finally {
      setIsJoining(false);
    }
  }

  function saveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextUser = {
      email: draftUser.email.trim(),
      name: draftUser.name.trim()
    };

    if (!nextUser.email) {
      setNotice("Email is required.");
      return;
    }

    saveDevUser(nextUser);
    setUser(nextUser);
  }

  async function copyShareLink() {
    await navigator.clipboard.writeText(window.location.href);
    setNotice("Room link copied.");
  }

  async function decideApproval(approvalId: string, status: "APPROVED" | "REJECTED") {
    try {
      const data = await workroomApi<ApprovalDecisionResponse>(`/rooms/${roomId}/approvals/${approvalId}/decision`, {
        method: "POST",
        body: {
          status
        },
        user
      });

      setApprovals((current) => upsertApproval(current, data.approval));
      await refreshToolCalls({ silent: true });
    } catch (error) {
      setNotice(getErrorMessage(error));
    }
  }

  async function refreshToolCalls(options: { silent?: boolean } = {}) {
    if (!options.silent) {
      setIsRefreshingToolCalls(true);
    }

    try {
      const data = await workroomApi<RoomToolCallsResponse>(`/rooms/${roomId}/tool-calls`, {
        user
      });

      setToolCalls(data.toolCalls);
    } catch (error) {
      if (!options.silent) {
        setNotice(getErrorMessage(error));
      }
    } finally {
      if (!options.silent) {
        setIsRefreshingToolCalls(false);
      }
    }
  }

  async function updatePolicyRuleRisk(ruleId: string, riskLevel: RoomPolicyRule["riskLevel"]) {
    setUpdatingPolicyRuleId(ruleId);

    try {
      const data = await workroomApi<UpdateRoomPolicyRuleResponse>(`/rooms/${roomId}/policy/rules/${ruleId}`, {
        method: "PATCH",
        body: {
          riskLevel
        },
        user
      });

      setRoomPolicy((current) =>
        current
          ? {
              ...current,
              rules: current.rules.map((rule) => (rule.id === data.rule.id ? data.rule : rule))
            }
          : current
      );
      setNotice("Policy rule updated.");
    } catch (error) {
      setNotice(getErrorMessage(error));
    } finally {
      setUpdatingPolicyRuleId(null);
    }
  }

  async function createLocalCodexPairing() {
    setIsCreatingLocalCodexPairing(true);

    try {
      const data = await workroomApi<LocalCodexStatus>(`/rooms/${roomId}/local-codex/pairing-codes`, {
        method: "POST",
        body: {},
        user
      });

      setLocalCodexStatus(data);
      setLocalCodexPairingCode(data.pairing?.code ?? null);
      setNotice("Codex local pairing created.");
    } catch (error) {
      setNotice(getErrorMessage(error));
    } finally {
      setIsCreatingLocalCodexPairing(false);
    }
  }

  async function refreshLocalCodexStatus(code: string | null) {
    const query = code ? `?code=${encodeURIComponent(code)}` : "";

    try {
      const data = await workroomApi<LocalCodexStatus>(`/rooms/${roomId}/local-codex/status${query}`, {
        user
      });

      setLocalCodexStatus(data);

      if (data.status === "connected") {
        setLocalCodexPairingCode(null);

        const agentsData = await workroomApi<RoomAgentsResponse>(`/rooms/${roomId}/agents`, {
          user
        });

        setAgents(agentsData.agents);
      }
    } catch (error) {
      setNotice(getErrorMessage(error));
    }
  }

  async function copyLocalCodexCommand(command: string) {
    await navigator.clipboard.writeText(command);
    setNotice("Codex local command copied.");
  }

  function armJeanActionMode() {
    setActiveSandbox({ type: "room" });
    setJeanActionMode("proposing");
  }

  function markJeanActionEdited() {
    setJeanActionMode("proposing");
    setActionMetrics((current) => ({
      ...current,
      edited: current.edited + 1
    }));
  }

  function cancelJeanAction() {
    setJeanActionMode("passive");
    setActionMetrics((current) => ({
      ...current,
      canceled: current.canceled + 1
    }));
  }

  function markJeanSignal(kind: "falsePositive" | "falseNegative") {
    setActionMetrics((current) => ({
      ...current,
      [kind]: current[kind] + 1
    }));
  }

  async function confirmJeanAction() {
    const objective = jeanActionDraft.trim();

    if (!objective) {
      setNotice("Jean action cannot be empty.");
      return;
    }

    setIsConfirmingJeanAction(true);
    setJeanActionMode("executing");

    try {
      const title = `Jean action: ${objective.slice(0, 72)}`;
      const data = await workroomApi<CreateRoomTaskResponse>(`/rooms/${roomId}/tasks`, {
        method: "POST",
        body: {
          title,
          description: objective,
          artifact: {
            title: "Jean action brief",
            type: "DOCUMENT",
            content: {
              text: objective,
              source: "jean-action-mode"
            }
          }
        },
        user
      });

      setTaskItems((current) =>
        mergeRoomTaskEvents([...current, { task: data.task, artifacts: [data.artifact], logs: [], runEvents: [] }], [])
      );
      setActiveTaskId(data.task.id);
      setActiveSandbox({ type: "room" });
      setActionMetrics((current) => ({
        ...current,
        confirmed: current.confirmed + 1
      }));
      setNotice("Jean action confirmed.");
    } catch (error) {
      setJeanActionMode("blocked");
      setNotice(getErrorMessage(error));
    } finally {
      setIsConfirmingJeanAction(false);
    }
  }

  async function cancelTask(taskId: string) {
    try {
      const data = await workroomApi<UpdateRoomTaskStatusResponse>(`/rooms/${roomId}/tasks/${taskId}/status`, {
        method: "PATCH",
        body: {
          status: "CANCELED"
        },
        user
      });

      setTaskItems((current) =>
        current.map((item) => (item.task.id === taskId ? { ...item, task: data.task } : item))
      );
      setNotice("Task canceled.");
    } catch (error) {
      setNotice(getErrorMessage(error));
    }
  }

  async function retryTask(taskId: string, instruction: string) {
    setRetryingTaskId(taskId);

    try {
      const data = await workroomApi<CreateRoomTaskResponse>(`/rooms/${roomId}/tasks/${taskId}/retry`, {
        method: "POST",
        body: {
          instruction
        },
        user
      });

      setTaskItems((current) =>
        mergeRoomTaskEvents([...current, { task: data.task, artifacts: [data.artifact], logs: [], runEvents: [] }], [])
      );
      setActiveTaskId(data.task.id);
      setActiveSandbox({ type: "room" });
      setNotice("Codex retry started.");
    } catch (error) {
      setNotice(getErrorMessage(error));
    } finally {
      setRetryingTaskId(null);
    }
  }

  return (
    <main className="room-page">
      <header className="room-topbar">
        <a className="brand-link" href="/">
          Jean Workroom
        </a>
        <div className="room-title-block">
          <p>{room?.status ?? (isJoining ? "Joining" : "Unavailable")}</p>
          <h1>{room?.title ?? "Room"}</h1>
        </div>
        <div className="topbar-actions">
          <button type="button" onClick={copyShareLink} disabled={!room}>
            Share
          </button>
          <a href="/">Leave</a>
        </div>
      </header>

      {notice ? <div className="notice room-notice">{notice}</div> : null}

      <section className="room-layout">
        <aside className="room-sidebar participants-sidebar">
          <div className="panel-heading">
            <h2>Participants</h2>
            <span>{humanParticipants.length}</span>
          </div>

          <form className="compact-identity-form" onSubmit={saveUser}>
            <label>
              <span>Email</span>
              <input
                value={draftUser.email}
                onChange={(event) => setDraftUser((current) => ({ ...current, email: event.target.value }))}
                type="email"
                autoComplete="email"
              />
            </label>
            <label>
              <span>Name</span>
              <input
                value={draftUser.name}
                onChange={(event) => setDraftUser((current) => ({ ...current, name: event.target.value }))}
                autoComplete="name"
              />
            </label>
            <button type="submit">Switch</button>
          </form>

          <div className="participant-list">
            <LiveKitMediaPanel
              connection={liveKitConnection}
              isLoading={isJoining}
              onDisconnect={() => setNotice("LiveKit disconnected.")}
              onError={(error) => setNotice(error.message)}
            />

            <button
              className={activeSandbox.type === "room" ? "participant-tile cockpit-tile is-selected" : "participant-tile cockpit-tile"}
              type="button"
              onClick={() => setActiveSandbox({ type: "room" })}
            >
              <div className="avatar jean-avatar">J</div>
              <div>
                <strong>Jean</strong>
                <span>Room sandbox</span>
                <AgentBadgeList agents={roomAgents} statuses={agentStatuses} />
              </div>
            </button>

            {humanParticipants.map((participant) => (
              <button
                className={
                  activeSandbox.type === "user" && activeSandbox.participantId === participant.id
                    ? "participant-tile cockpit-tile is-selected"
                    : "participant-tile cockpit-tile"
                }
                key={participant.id}
                type="button"
                onClick={() => setActiveSandbox({ type: "user", participantId: participant.id })}
              >
                <div className="avatar">{formatParticipantName(participant).slice(0, 1).toUpperCase()}</div>
                <div>
                  <strong>{formatParticipantName(participant)}</strong>
                  <span>{participant.role}</span>
                  <AgentBadgeList agents={personalAgentsByUserId.get(participant.userId ?? "") ?? []} statuses={agentStatuses} />
                </div>
              </button>
            ))}
            {participants.length === 0 ? <p className="empty-state">No participants.</p> : null}
          </div>
        </aside>

        <section className="workspace-surface">
          <div className="room-stage-header">
            <div>
              <p className="eyebrow">Room Stage</p>
              <h2>{activeTaskItem?.task.title ?? "Shared output"}</h2>
            </div>
            <button type="button" onClick={armJeanActionMode}>
              Arm Jean
            </button>
          </div>
          <nav className="tabs-bar" aria-label="Workspace tabs">
            {displayedTaskItems.length === 0 ? (
              <button className="is-active" type="button">
                Workspace
              </button>
            ) : null}
            {displayedTaskItems.map((item) => (
              <button
                className={item.task.id === activeTaskItem?.task.id ? "is-active" : undefined}
                key={item.task.id}
                type="button"
                onClick={() => setActiveTaskId(item.task.id)}
                title={item.task.title}
              >
                {item.task.title}
              </button>
            ))}
          </nav>
          <div className="artifact-stage">
            {activeTaskItem ? (
              <ArtifactPreview
                agents={agents}
                isRetrying={retryingTaskId === activeTaskItem.task.id}
                localCodexStatus={localCodexStatus}
                participants={humanParticipants}
                roomId={roomId}
                taskItem={activeTaskItem}
                user={user}
                onCancelTask={cancelTask}
                onRetryTask={retryTask}
              />
            ) : (
              <div>
                <p className="eyebrow">Workspace</p>
                <h2>No shared output yet</h2>
                <p className="empty-state">Tasks, artifacts and promoted sandbox outputs will appear here.</p>
              </div>
            )}
          </div>
        </section>

        <aside className="room-sidebar jean-sidebar">
          <section>
            <div className="panel-heading">
              <h2>Jean</h2>
              <span>{formatJeanActionMode(displayedJeanActionMode)}</span>
            </div>
            <JeanActionPanel
              draft={jeanActionDraft}
              isConfirming={isConfirmingJeanAction}
              metrics={actionMetrics}
              mode={displayedJeanActionMode}
              speechEvents={jeanSpeechEvents}
              onArm={armJeanActionMode}
              onCancel={cancelJeanAction}
              onConfirm={confirmJeanAction}
              onDraftChange={setJeanActionDraft}
              onMarkEdited={markJeanActionEdited}
              onMarkSignal={markJeanSignal}
            />
          </section>

          <section>
            <div className="panel-heading">
              <h2>Sandbox</h2>
              <span>{formatSandboxSelection(activeSandbox, humanParticipants)}</span>
            </div>
            <ActiveSandboxPanel
              agentsByUserId={personalAgentsByUserId}
              agentStatuses={agentStatuses}
              roomAgents={roomAgents}
              selection={activeSandbox}
              taskItems={sandboxTaskItems}
              participants={humanParticipants}
              onPromoteTask={(taskId) => {
                setActiveTaskId(taskId);
                setActiveSandbox({ type: "room" });
              }}
            />
          </section>

          <section>
            <div className="panel-heading">
              <h2>Tasks</h2>
              <span>{filteredTaskItems.length}/{displayedTaskItems.length}</span>
            </div>
            <div className="task-filter-control" aria-label="Task filter">
              {taskFilters.map((filter) => (
                <button
                  className={filter === taskFilter ? "is-active" : undefined}
                  key={filter}
                  type="button"
                  onClick={() => setTaskFilter(filter)}
                >
                  {formatTaskFilter(filter)}
                </button>
              ))}
            </div>
            <div className="task-list">
              {displayedTaskItems.length === 0 ? <p className="empty-state">No tasks yet.</p> : null}
              {displayedTaskItems.length > 0 && filteredTaskItems.length === 0 ? <p className="empty-state">No tasks match this filter.</p> : null}
              {filteredTaskItems.map((item) => (
                <button
                  className={item.task.id === activeTaskItem?.task.id ? "task-row is-selected" : "task-row"}
                  key={item.task.id}
                  type="button"
                  onClick={() => setActiveTaskId(item.task.id)}
                >
                  <strong>{item.task.title}</strong>
                  <span>{formatTaskMeta(item)}</span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="panel-heading">
              <h2>Agents</h2>
              <span>{agents.length}</span>
            </div>
            <LocalCodexConnectPanel
              isCreating={isCreatingLocalCodexPairing}
              onConnect={createLocalCodexPairing}
              onCopyCommand={copyLocalCodexCommand}
              status={localCodexStatus}
            />
            <AgentGroupList
              agents={agents}
              participants={humanParticipants}
              personalAgentsByUserId={personalAgentsByUserId}
              roomAgents={roomAgents}
              statuses={agentStatuses}
            />
          </section>

          <section>
            <div className="panel-heading">
              <h2>Approvals</h2>
              <span>{pendingApprovals.length}/{approvals.length}</span>
            </div>
            <div className="approval-list">
              {approvals.length === 0 ? <p className="empty-state">No approvals yet.</p> : null}
              {approvals.map((approval) => (
                <ApprovalCard approval={approval} key={approval.id} onDecision={decideApproval} />
              ))}
            </div>
          </section>

          <PolicyPanel
            policy={roomPolicy}
            updatingRuleId={updatingPolicyRuleId}
            onUpdateRisk={updatePolicyRuleRisk}
          />

          <ToolCallAuditPanel
            agents={agents}
            filteredToolCalls={filteredToolCalls}
            isRefreshing={isRefreshingToolCalls}
            statusFilter={toolCallStatusFilter}
            toolCalls={toolCalls}
            onFilterChange={setToolCallStatusFilter}
            onRefresh={() => refreshToolCalls()}
          />

          <section className="timeline-panel">
            <div className="panel-heading">
              <h2>Timeline</h2>
              <span>{roomEventsConnectionState}</span>
            </div>
            {roomEventsError ? <p className="timeline-error">{roomEventsError}</p> : null}
            <div className="timeline-list">
              {roomEvents.length === 0 ? <p className="empty-state">No timeline events yet.</p> : null}
              {roomEvents.map((event, index) => (
                <article className="timeline-row" key={event.eventId ?? `${event.type}:${getEventTime(event)}:${index}`}>
                  <div>
                    <strong title={getEventTitle(event, speakerLabelsById)}>{getEventTitle(event, speakerLabelsById)}</strong>
                    <span>{getEventBadge(event)}</span>
                  </div>
                  <p>{getEventBody(event)}</p>
                  <time dateTime={getEventTime(event)}>{formatEventTime(getEventTime(event))}</time>
                </article>
              ))}
            </div>
            {roomEvents.length > 0 ? (
              <button className="secondary-button" type="button" onClick={clearEvents}>
                Clear
              </button>
            ) : null}
          </section>
        </aside>
      </section>
    </main>
  );
}

type AgentBadgeListProps = {
  agents: RoomAgent[];
  statuses: Map<string, AgentCompactStatus>;
};

function AgentBadgeList({ agents, statuses }: AgentBadgeListProps) {
  if (agents.length === 0) {
    return null;
  }

  const visibleAgents = agents.slice(0, 2);
  const hiddenCount = agents.length - visibleAgents.length;

  return (
    <div className="agent-badge-list">
      {visibleAgents.map((agent) => {
        const status = statuses.get(agent.id) ?? "idle";

        return (
          <span className={`agent-badge agent-badge-${status}`} key={agent.id} title={`${agent.name} / ${formatAgentStatus(status)}`}>
            {formatAgentInitials(agent)}
          </span>
        );
      })}
      {hiddenCount > 0 ? <span className="agent-badge agent-badge-more">+{hiddenCount}</span> : null}
    </div>
  );
}

type JeanActionPanelProps = {
  draft: string;
  isConfirming: boolean;
  metrics: ActionMetrics;
  mode: JeanActionMode;
  speechEvents: Array<Extract<RealtimeRoomEvent, { type: "agent.speech" }>>;
  onArm: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  onDraftChange: (draft: string) => void;
  onMarkEdited: () => void;
  onMarkSignal: (kind: "falsePositive" | "falseNegative") => void;
};

function JeanActionPanel({
  draft,
  isConfirming,
  metrics,
  mode,
  speechEvents,
  onArm,
  onCancel,
  onConfirm,
  onDraftChange,
  onMarkEdited,
  onMarkSignal
}: JeanActionPanelProps) {
  return (
    <div className="jean-action-panel">
      <div className={`jean-status jean-status-${mode}`}>
        <div className="jean-dot" />
        <p>{formatJeanActionMode(mode)}</p>
      </div>

      <article className="jean-action-card">
        <textarea
          aria-label="Jean action draft"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          rows={4}
        />
        <div className="action-card-actions">
          <button type="button" disabled={isConfirming} onClick={onConfirm}>
            Confirmer
          </button>
          <button className="secondary-button" type="button" onClick={onMarkEdited}>
            Modifier
          </button>
          <button className="secondary-button" type="button" onClick={onCancel}>
            Annuler
          </button>
        </div>
      </article>

      <div className="jean-trigger-row">
        <button className="secondary-button" type="button" onClick={onArm}>
          Jean
        </button>
        <button className="secondary-button" type="button" onClick={() => onMarkSignal("falsePositive")}>
          False +
        </button>
        <button className="secondary-button" type="button" onClick={() => onMarkSignal("falseNegative")}>
          False -
        </button>
      </div>

      <div className="action-metric-grid">
        <MetricCell label="Confirmed" value={metrics.confirmed} />
        <MetricCell label="Edited" value={metrics.edited} />
        <MetricCell label="Canceled" value={metrics.canceled} />
        <MetricCell label="False +" value={metrics.falsePositive} />
        <MetricCell label="False -" value={metrics.falseNegative} />
      </div>

      <div className="jean-speech-list">
        {speechEvents.length === 0 ? <p className="empty-state">No speech.</p> : null}
        {speechEvents.slice(0, 3).map((event, index) => (
          <p className="jean-speech-row" key={`${event.agentId}:${event.ts}:${index}`}>
            {event.text}
          </p>
        ))}
      </div>
    </div>
  );
}

function MetricCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric-cell">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

type ActiveSandboxPanelProps = {
  agentsByUserId: Map<string, RoomAgent[]>;
  agentStatuses: Map<string, AgentCompactStatus>;
  participants: RoomParticipant[];
  roomAgents: RoomAgent[];
  selection: SandboxSelection;
  taskItems: RoomTaskItem[];
  onPromoteTask: (taskId: string) => void;
};

function ActiveSandboxPanel({
  agentsByUserId,
  agentStatuses,
  participants,
  roomAgents,
  selection,
  taskItems,
  onPromoteTask
}: ActiveSandboxPanelProps) {
  if (selection.type === "room") {
    return (
      <div className="sandbox-panel">
        <div className="sandbox-heading">
          <p className="eyebrow">Room Sandbox</p>
          <strong>Jean</strong>
        </div>
        <AgentRows agents={roomAgents} statuses={agentStatuses} emptyLabel="No room agents." />
        <SandboxTaskList taskItems={taskItems} onPromoteTask={onPromoteTask} />
      </div>
    );
  }

  const participant = participants.find((candidate) => candidate.id === selection.participantId) ?? null;

  if (!participant) {
    return <p className="empty-state">No sandbox.</p>;
  }

  const agents = participant.userId ? agentsByUserId.get(participant.userId) ?? [] : [];

  return (
    <div className="sandbox-panel">
      <div className="sandbox-heading">
        <p className="eyebrow">User Sandbox</p>
        <strong>{formatParticipantName(participant)}</strong>
      </div>
      <AgentRows agents={agents} statuses={agentStatuses} emptyLabel="No personal agents for this user." />
      {agents.some(isCliFirstAgent) ? (
        <pre className="terminal-placeholder">jean-bridge local agent ready</pre>
      ) : null}
      <SandboxTaskList taskItems={taskItems} onPromoteTask={onPromoteTask} />
    </div>
  );
}

function SandboxTaskList({
  taskItems,
  onPromoteTask
}: {
  taskItems: RoomTaskItem[];
  onPromoteTask: (taskId: string) => void;
}) {
  return (
    <div className="sandbox-task-list">
      {taskItems.length === 0 ? <p className="empty-state">No tasks owned by this sandbox.</p> : null}
      {taskItems.slice(0, 4).map((item) => (
        <article className="sandbox-task-row" key={item.task.id}>
          <div>
            <strong>{item.task.title}</strong>
            <span>{formatTaskMeta(item)}</span>
          </div>
          <button className="secondary-button" type="button" onClick={() => onPromoteTask(item.task.id)}>
            Promote
          </button>
        </article>
      ))}
    </div>
  );
}

type AgentGroupListProps = {
  agents: RoomAgent[];
  participants: RoomParticipant[];
  personalAgentsByUserId: Map<string, RoomAgent[]>;
  roomAgents: RoomAgent[];
  statuses: Map<string, AgentCompactStatus>;
};

function AgentGroupList({
  agents,
  participants,
  personalAgentsByUserId,
  roomAgents,
  statuses
}: AgentGroupListProps) {
  if (agents.length === 0) {
    return <p className="empty-state">No agents.</p>;
  }

  const personalOwners = participants
    .map((participant) => ({
      participant,
      agents: participant.userId ? personalAgentsByUserId.get(participant.userId) ?? [] : []
    }))
    .filter((entry) => entry.agents.length > 0);

  return (
    <div className="agent-group-list">
      <div className="agent-group">
        <h3>Personal</h3>
        {personalOwners.length === 0 ? <p className="empty-state">No personal agents.</p> : null}
        {personalOwners.map((entry) => (
          <div className="agent-owner-group" key={entry.participant.id}>
            <span>{formatParticipantName(entry.participant)}</span>
            <AgentRows agents={entry.agents} statuses={statuses} emptyLabel="No personal agents." />
          </div>
        ))}
      </div>
      <div className="agent-group">
        <h3>Room</h3>
        <AgentRows agents={roomAgents} statuses={statuses} emptyLabel="No room agents." />
      </div>
    </div>
  );
}

type AgentRowsProps = AgentBadgeListProps & {
  emptyLabel?: string;
};

function AgentRows({ agents, statuses, emptyLabel = "No agents." }: AgentRowsProps) {
  if (agents.length === 0) {
    return <p className="empty-state">{emptyLabel}</p>;
  }

  return (
    <div className="agent-list">
      {agents.map((agent) => {
        const status = statuses.get(agent.id) ?? "idle";

        return (
          <article className={`agent-row agent-row-${status}`} key={agent.id}>
            <div>
              <strong>{agent.name}</strong>
              <span>{agent.provider} / {agent.transport} / {formatAgentStatus(status)}</span>
            </div>
            <small>{agent.capabilities.join(", ")}</small>
          </article>
        );
      })}
    </div>
  );
}

function ApprovalCard({
  approval,
  onDecision
}: {
  approval: ApprovalRequest;
  onDecision: (approvalId: string, status: "APPROVED" | "REJECTED") => void;
}) {
  const detailRows = getApprovalDetailRows(approval);

  return (
    <article className={`approval-row approval-row-${approval.status.toLowerCase()}`}>
      <div className="approval-card-header">
        <div>
          <strong>{approval.action}</strong>
          <span>{approval.status} / {approval.riskLevel}</span>
        </div>
        <time dateTime={approval.createdAt}>{formatEventTime(approval.createdAt)}</time>
      </div>
      <p>{approval.reason}</p>
      {detailRows.length > 0 ? (
        <dl className="approval-detail-list">
          {detailRows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {approval.status === "PENDING" ? (
        <div className="approval-actions">
          <button type="button" onClick={() => onDecision(approval.id, "APPROVED")}>
            Approve
          </button>
          <button className="secondary-button" type="button" onClick={() => onDecision(approval.id, "REJECTED")}>
            Reject
          </button>
        </div>
      ) : null}
    </article>
  );
}

type PolicyPanelProps = {
  policy: RoomPolicy | null;
  updatingRuleId: string | null;
  onUpdateRisk: (ruleId: string, riskLevel: RoomPolicyRule["riskLevel"]) => void;
};

function PolicyPanel({ policy, updatingRuleId, onUpdateRisk }: PolicyPanelProps) {
  const agentSessions = policy?.agentSessions ?? null;
  const approvalDecisions = policy?.approvalDecisions ?? null;
  const policyRules = policy?.policyRules ?? null;
  const sensitiveRules = policy?.rules.filter((rule) => rule.requiresApproval) ?? [];
  const canManageRules = policyRules?.canManage ?? false;

  return (
    <section className="policy-panel">
      <div className="panel-heading">
        <h2>Policy</h2>
        <span>{canManageRules ? "admin" : approvalDecisions?.canDecide ? "can approve" : "read only"}</span>
      </div>
      {!policy ? <p className="empty-state">Policy loading.</p> : null}
      {policyRules ? (
        <article className="policy-summary-row">
          <div>
            <strong>Policy rules</strong>
            <span>{policyRules.canManage ? "Editable" : "Read only"}</span>
          </div>
          <p>Org {formatPolicyRole(policyRules.organizationRole)}</p>
        </article>
      ) : null}
      {agentSessions ? (
        <article className="policy-summary-row">
          <div>
            <strong>Agent sessions</strong>
            <span>{agentSessions.canCreate ? "Allowed" : "Blocked"}</span>
          </div>
          <p>
            Org {formatPolicyRole(agentSessions.organizationRole)} / Room {formatPolicyRole(agentSessions.roomRole)}
          </p>
        </article>
      ) : null}
      {approvalDecisions ? (
        <article className="policy-summary-row">
          <div>
            <strong>Approval decisions</strong>
            <span>{approvalDecisions.canDecide ? "Allowed" : "Blocked"}</span>
          </div>
          <p>
            Org {formatPolicyRole(approvalDecisions.organizationRole)} / Room {formatPolicyRole(approvalDecisions.roomRole)}
          </p>
        </article>
      ) : null}
      <div className="policy-rule-list">
        {sensitiveRules.map((rule) => (
          <article className="policy-rule-row" key={rule.id}>
            <div>
              <strong>{rule.action}</strong>
              <span>{rule.riskLevel} / approval</span>
            </div>
            <p>{rule.description}</p>
            <label className="policy-rule-control">
              <span>Risk</span>
              <select
                aria-label={`Risk level for ${rule.action}`}
                disabled={!canManageRules || updatingRuleId === rule.id}
                value={rule.riskLevel}
                onChange={(event) => onUpdateRisk(rule.id, event.target.value as RoomPolicyRule["riskLevel"])}
              >
                {getPolicyRiskOptions(rule.baseRiskLevel).map((riskLevel) => (
                  <option key={riskLevel} value={riskLevel}>
                    {riskLevel}
                  </option>
                ))}
              </select>
            </label>
            {rule.isOverridden ? <small>Base {rule.baseRiskLevel}</small> : null}
            <small>{rule.appliesTo.join(", ")}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

type ToolCallAuditPanelProps = {
  agents: RoomAgent[];
  filteredToolCalls: RoomToolCall[];
  isRefreshing: boolean;
  statusFilter: ToolCallStatusFilter;
  toolCalls: RoomToolCall[];
  onFilterChange: (filter: ToolCallStatusFilter) => void;
  onRefresh: () => void;
};

function ToolCallAuditPanel({
  agents,
  filteredToolCalls,
  isRefreshing,
  statusFilter,
  toolCalls,
  onFilterChange,
  onRefresh
}: ToolCallAuditPanelProps) {
  const agentsById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);

  return (
    <section className="tool-call-panel">
      <div className="panel-heading">
        <h2>Tool calls</h2>
        <span>{filteredToolCalls.length}/{toolCalls.length}</span>
      </div>
      <div className="tool-call-actions">
        <div className="tool-call-filter-control" aria-label="Tool call status filter">
          {toolCallStatusFilters.map((filter) => (
            <button
              className={filter === statusFilter ? "is-active" : undefined}
              key={filter}
              type="button"
              onClick={() => onFilterChange(filter)}
            >
              {formatToolCallFilter(filter)}
            </button>
          ))}
        </div>
        <button className="secondary-button" disabled={isRefreshing} type="button" onClick={onRefresh}>
          {isRefreshing ? "Refreshing" : "Refresh"}
        </button>
      </div>
      <div className="tool-call-list">
        {toolCalls.length === 0 ? <p className="empty-state">No tool calls yet.</p> : null}
        {toolCalls.length > 0 && filteredToolCalls.length === 0 ? <p className="empty-state">No tool calls match this filter.</p> : null}
        {filteredToolCalls.map((toolCall) => (
          <article className={`tool-call-row tool-call-row-${toolCall.status.toLowerCase()}`} key={toolCall.id}>
            <div className="tool-call-row-header">
              <div>
                <strong title={toolCall.toolName}>{toolCall.toolName}</strong>
                <span>{formatToolCallAgent(toolCall, agentsById)}</span>
              </div>
              <time dateTime={toolCall.startedAt}>{formatEventTime(toolCall.startedAt)}</time>
            </div>
            <p>{getToolCallSummary(toolCall)}</p>
            <div className="tool-call-meta">
              <span>{formatToolCallFilter(toolCall.status)}</span>
              <span>{formatToolCallDuration(toolCall)}</span>
              {formatToolCallContext(toolCall).map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
            <details className="tool-call-detail">
              <summary>Inspect</summary>
              <pre>{JSON.stringify({ arguments: toolCall.arguments, result: toolCall.result }, null, 2)}</pre>
            </details>
          </article>
        ))}
      </div>
    </section>
  );
}

type LiveKitMediaPanelProps = {
  connection: LiveKitConnection | null;
  isLoading: boolean;
  onDisconnect: () => void;
  onError: (error: Error) => void;
};

function LiveKitMediaPanel({ connection, isLoading, onDisconnect, onError }: LiveKitMediaPanelProps) {
  if (!connection) {
    return (
      <div className="livekit-placeholder">
        <strong>{isLoading ? "Connecting media" : "Media unavailable"}</strong>
      </div>
    );
  }

  return (
    <LiveKitRoom
      audio={false}
      className="livekit-room-shell"
      connect={true}
      data-lk-theme="default"
      onDisconnected={onDisconnect}
      onError={onError}
      serverUrl={connection.serverUrl}
      token={connection.token}
      video={false}
    >
      <div className="livekit-status-row">
        <span>LiveKit</span>
        <ConnectionState />
      </div>
      <LiveKitParticipantTiles />
      <ControlBar
        className="livekit-controls"
        controls={liveKitControls}
        saveUserChoices={false}
        variation="minimal"
      />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

type LocalCodexConnectPanelProps = {
  status: LocalCodexStatus;
  isCreating: boolean;
  onConnect: () => void;
  onCopyCommand: (command: string) => void;
};

function LocalCodexConnectPanel({
  status,
  isCreating,
  onConnect,
  onCopyCommand
}: LocalCodexConnectPanelProps) {
  const command = status.pairing?.command ?? null;
  const canCreatePairing = status.status !== "connected" && (status.status !== "pairing_pending" || !command);
  const buttonLabel = status.status === "pairing_pending" && !command ? "Regenerer le code" : "Connecter Codex local";
  const nextStep = getLocalCodexNextStep(status);

  return (
    <article className={`local-codex-card local-codex-card-${status.status}`}>
      <div className="local-codex-card-header">
        <div>
          <strong>Codex Local</strong>
          <span>{formatLocalCodexStatus(status)}</span>
        </div>
        <button type="button" disabled={!canCreatePairing || isCreating} onClick={onConnect}>
          {isCreating ? "Creation" : buttonLabel}
        </button>
      </div>
      {command ? (
        <div className="local-codex-command">
          <code>{command}</code>
          <button className="secondary-button" type="button" onClick={() => onCopyCommand(command)}>
            Copy
          </button>
        </div>
      ) : null}
      {status.pairing?.errorMessage ? <p className="local-codex-error">{status.pairing.errorMessage}</p> : null}
      {nextStep ? <p className="local-codex-next-step">{nextStep}</p> : null}
      <p className="local-codex-note">Pairing Jean autorise cette room. Codex garde son auth locale.</p>
    </article>
  );
}

function LiveKitParticipantTiles() {
  const liveKitParticipants = useParticipants();
  const cameraTracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], {
    onlySubscribed: false
  });

  if (liveKitParticipants.length === 0) {
    return <p className="empty-state">No LiveKit participants.</p>;
  }

  const trackedParticipantIds = new Set(cameraTracks.map((trackRef) => trackRef.participant.identity));
  const participantsWithoutTiles = liveKitParticipants.filter(
    (participant) => !trackedParticipantIds.has(participant.identity)
  );

  return (
    <div className="livekit-grid">
      {cameraTracks.map((trackRef) => (
        <ParticipantTile key={getTrackRefKey(trackRef)} trackRef={trackRef} />
      ))}
      {participantsWithoutTiles.map((participant) => (
        <LiveKitParticipantFallbackTile key={participant.identity} participant={participant} />
      ))}
    </div>
  );
}

function LiveKitParticipantFallbackTile({ participant }: { participant: Participant }) {
  const label = participant.name || participant.identity;

  return (
    <div className="livekit-participant-card">
      <div className="livekit-participant-avatar">{label.slice(0, 1).toUpperCase()}</div>
      <strong>{label}</strong>
      <span>{participant.isLocal ? "Local" : "Remote"}</span>
    </div>
  );
}

type CodeArtifactFile = {
  id: string | null;
  path: string;
  content: string;
  language: string;
  latestVersion: string | null;
  producedByRunId: string | null;
  diffId: string | null;
  latestDiff: string | null;
};

type ArtifactPreviewProps = {
  agents: RoomAgent[];
  isRetrying: boolean;
  localCodexStatus: LocalCodexStatus;
  participants: RoomParticipant[];
  roomId: string;
  taskItem: RoomTaskItem;
  user: DevUser;
  onCancelTask: (taskId: string) => void;
  onRetryTask: (taskId: string, instruction: string) => void;
};

function ArtifactPreview({
  agents,
  isRetrying,
  localCodexStatus,
  participants,
  roomId,
  taskItem,
  user,
  onCancelTask,
  onRetryTask
}: ArtifactPreviewProps) {
  const artifact = taskItem.artifacts[0] ?? null;

  if (!artifact) {
    return (
      <div className="artifact-preview">
        <p className="eyebrow">{taskItem.task.status}</p>
        <h2>{taskItem.task.title}</h2>
        <p>Task created. Waiting for artifact.</p>
        <TaskLogPanel logs={taskItem.logs} />
      </div>
    );
  }

  const isCodexRun = isCodexRunTask(taskItem, artifact, agents);

  return (
    <div className="artifact-preview">
      <div className="artifact-preview-header">
        <p className="eyebrow">
          {taskItem.task.status} / {formatArtifactType(artifact.type)}
        </p>
        <h2>{artifact.title}</h2>
      </div>
      {isCodexRun ? (
        <CodexRunPanel
          agents={agents}
          artifact={artifact}
          isRetrying={isRetrying}
          localCodexStatus={localCodexStatus}
          participants={participants}
          roomId={roomId}
          taskItem={taskItem}
          user={user}
          onCancelTask={onCancelTask}
          onRetryTask={onRetryTask}
        />
      ) : null}
      <ArtifactRenderer artifact={artifact} roomId={roomId} user={user} />
      <TaskLogPanel logs={taskItem.logs} />
    </div>
  );
}

function ArtifactRenderer({ artifact, roomId, user }: { artifact: RealtimeArtifact; roomId: string; user: DevUser }) {
  if (artifact.type === "DOCUMENT") {
    return <DocumentArtifactRenderer artifact={artifact} />;
  }

  if (artifact.type === "RESEARCH") {
    return <ResearchArtifactRenderer artifact={artifact} />;
  }

  if (artifact.type === "CODE") {
    return <CodeArtifactRenderer artifact={artifact} roomId={roomId} user={user} />;
  }

  if (artifact.type === "PREVIEW") {
    return <PreviewArtifactRenderer artifact={artifact} roomId={roomId} user={user} />;
  }

  return <p>{formatArtifactContent(artifact)}</p>;
}

function DocumentArtifactRenderer({ artifact }: { artifact: RealtimeArtifact }) {
  const content = artifact.latestVersion?.content ?? {};
  const sections = getRecordArray(content.sections);

  return (
    <div className="artifact-document">
      <p>{formatArtifactContent(artifact)}</p>
      {sections.length > 0 ? (
        <div className="artifact-section-list">
          {sections.map((section, index) => (
            <section className="artifact-section" key={`${getRecordString(section, "title", "Section")}:${index}`}>
              <h3>{getRecordString(section, "title", `Section ${index + 1}`)}</h3>
              <p>{getRecordString(section, "text", "")}</p>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ResearchArtifactRenderer({ artifact }: { artifact: RealtimeArtifact }) {
  const content = artifact.latestVersion?.content ?? {};
  const summary = getContentText(content, "summary") ?? formatArtifactContent(artifact);
  const text = getContentText(content, "text");
  const body = text && text !== summary ? splitParagraphs(text) : [];
  const sources = getRecordArray(content.sources);

  return (
    <div className="artifact-research">
      <p>{summary}</p>
      {body.length > 0 ? (
        <div className="artifact-research-body">
          {body.map((paragraph, index) => (
            <p key={`${paragraph.slice(0, 24)}:${index}`}>{paragraph}</p>
          ))}
        </div>
      ) : null}
      {sources.length > 0 ? (
        <div className="source-list">
          {sources.map((source, index) => {
            const title = getRecordString(source, "title", getRecordString(source, "url", `Source ${index + 1}`));
            const url = getRecordString(source, "url", "");

            return url ? (
              <a className="source-link" href={url} key={`${url}:${index}`} rel="noreferrer" target="_blank">
                {title}
              </a>
            ) : (
              <span className="source-link" key={`${title}:${index}`}>
                {title}
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function CodeArtifactRenderer({ artifact, roomId, user }: { artifact: RealtimeArtifact; roomId: string; user: DevUser }) {
  const content = artifact.latestVersion?.content ?? {};
  const { error, files, isLoading, source } = useArtifactCodeFiles({ artifact, roomId, user });
  const [activeFilePath, setActiveFilePath] = useState(files[0]?.path ?? "");
  const [applyLocalMessage, setApplyLocalMessage] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isApplyingLocal, setIsApplyingLocal] = useState(false);
  const [isRunningChecks, setIsRunningChecks] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const activeFile = files.find((file) => file.path === activeFilePath) ?? files[0] ?? null;
  const htmlPreviewFile = files.find(isHtmlEntryPoint) ?? (activeFile && isHtmlFile(activeFile) ? activeFile : null);
  const previewUrl = getContentText(content, "previewUrl");
  const fileComments = useRoomComments({
    roomId,
    targetId: activeFile?.id ?? null,
    targetKey: "artifactFileId",
    user
  });

  useEffect(() => {
    if (files.length === 0) {
      setActiveFilePath("");
      return;
    }

    if (!files.some((file) => file.path === activeFilePath)) {
      setActiveFilePath(files[0]?.path ?? "");
    }
  }, [activeFilePath, files]);

  async function downloadFilesZip() {
    setDownloadError(null);
    setIsDownloading(true);

    try {
      const blob = await workroomApiBlob(`/rooms/${roomId}/artifacts/${artifact.id}/files.zip`, {
        user
      });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = objectUrl;
      link.download = `${slugifyFileName(artifact.title)}-files.zip`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (cause) {
      setDownloadError(cause instanceof Error ? cause.message : "Could not download files.");
    } finally {
      setIsDownloading(false);
    }
  }

  async function applyFilesLocally() {
    setApplyLocalMessage(null);
    setIsApplyingLocal(true);

    try {
      const response = await workroomApi<LocalApplyArtifactResponse>(
        `/rooms/${roomId}/artifacts/${artifact.id}/local-actions/apply`,
        {
          method: "POST",
          body: {},
          user
        }
      );

      setApplyLocalMessage(
        response.status === "approval_required"
          ? "Approval requested before local apply."
          : response.result.summary ?? "Artifact files applied locally."
      );
    } catch (cause) {
      setApplyLocalMessage(cause instanceof Error ? cause.message : "Could not apply files locally.");
    } finally {
      setIsApplyingLocal(false);
    }
  }

  async function runLocalChecks() {
    setApplyLocalMessage(null);
    setIsRunningChecks(true);

    try {
      const response = await workroomApi<LocalRunCheckArtifactResponse>(
        `/rooms/${roomId}/artifacts/${artifact.id}/local-actions/checks`,
        {
          method: "POST",
          body: {
            checkName: "test"
          },
          user
        }
      );

      setApplyLocalMessage(
        response.status === "approval_required"
          ? "Approval requested before local checks."
          : response.result.summary ?? "Local checks passed."
      );
    } catch (cause) {
      setApplyLocalMessage(cause instanceof Error ? cause.message : "Could not run local checks.");
    } finally {
      setIsRunningChecks(false);
    }
  }

  return (
    <div className="artifact-code">
      {files.length > 0 ? (
        <div className="code-layout">
          <div className="code-file-list">
            <FileSourceStatus error={error} isLoading={isLoading} source={source} />
            {files.map((file) => (
              <button
                className={file.path === activeFile?.path ? "is-active" : undefined}
                key={file.path}
                type="button"
                onClick={() => setActiveFilePath(file.path)}
              >
                <span>{file.path}</span>
                <small>{formatFileMeta(file)}</small>
              </button>
            ))}
          </div>
          <div className="code-viewer">
            <div className="code-viewer-header">
              <strong>{activeFile?.path ?? "File"}</strong>
              <div>
                <span>{activeFile?.language ?? "text"}</span>
                <button className="secondary-button" disabled={isApplyingLocal} type="button" onClick={applyFilesLocally}>
                  {isApplyingLocal ? "Applying..." : "Apply local"}
                </button>
                <button className="secondary-button" disabled={isRunningChecks} type="button" onClick={runLocalChecks}>
                  {isRunningChecks ? "Checking..." : "Run checks"}
                </button>
                <button className="secondary-button" disabled={isDownloading} type="button" onClick={downloadFilesZip}>
                  {isDownloading ? "Preparing..." : "Download zip"}
                </button>
              </div>
            </div>
            {applyLocalMessage ? <p className="code-action-message">{applyLocalMessage}</p> : null}
            {downloadError ? <p className="code-download-error">{downloadError}</p> : null}
            <pre className="code-block">
              <code>{activeFile?.content ?? ""}</code>
            </pre>
            {activeFile?.latestDiff ? (
              <details className="diff-viewer">
                <summary>Latest diff</summary>
                <pre>{activeFile.latestDiff}</pre>
              </details>
            ) : null}
            <FileCommentsPanel
              comments={fileComments.comments}
              error={fileComments.error}
              isCreating={fileComments.isCreating}
              isLoading={fileComments.isLoading}
              targetFile={activeFile}
              onCreate={fileComments.createComment}
            />
          </div>
        </div>
      ) : (
        <pre className="code-block">{formatArtifactContent(artifact)}</pre>
      )}
      {previewUrl ? (
        <PreviewFrame previewUrl={previewUrl} title={`${artifact.title} preview`} />
      ) : null}
      {htmlPreviewFile ? (
        <PreviewFrame html={htmlPreviewFile.content} title={`${htmlPreviewFile.path} preview`} />
      ) : null}
    </div>
  );
}

function PreviewArtifactRenderer({ artifact, roomId, user }: { artifact: RealtimeArtifact; roomId: string; user: DevUser }) {
  const content = artifact.latestVersion?.content ?? {};
  const { error, files, isLoading, source } = useArtifactCodeFiles({ artifact, roomId, user });
  const activeFile = files.find(isHtmlEntryPoint) ?? files[0] ?? null;
  const previewUrl = getContentText(content, "previewUrl");

  return (
    <div className="artifact-prototype">
      <p>{formatArtifactContent(artifact)}</p>
      <FileSourceStatus error={error} isLoading={isLoading} source={source} />
      {previewUrl ? <PreviewFrame previewUrl={previewUrl} title={`${artifact.title} preview`} /> : null}
      {!previewUrl && activeFile && isHtmlFile(activeFile) ? (
        <PreviewFrame html={activeFile.content} title={`${activeFile.path} preview`} />
      ) : null}
      {activeFile ? (
        <details className="prototype-source">
          <summary>{activeFile.path}</summary>
          <pre className="code-block">{activeFile.content}</pre>
        </details>
      ) : null}
    </div>
  );
}

function FileSourceStatus({
  error,
  isLoading,
  source
}: {
  error: string | null;
  isLoading: boolean;
  source: "artifact" | "empty" | "persisted";
}) {
  if (isLoading) {
    return <p className="code-file-state">Loading persisted files...</p>;
  }

  if (error) {
    return <p className="code-file-error">Persisted files unavailable. Showing artifact snapshot.</p>;
  }

  if (source === "persisted") {
    return <p className="code-file-state">Persisted files</p>;
  }

  if (source === "artifact") {
    return <p className="code-file-state">Artifact snapshot</p>;
  }

  return null;
}

function FileCommentsPanel({
  comments,
  error,
  isCreating,
  isLoading,
  targetFile,
  onCreate
}: {
  comments: RoomComment[];
  error: string | null;
  isCreating: boolean;
  isLoading: boolean;
  targetFile: CodeArtifactFile | null;
  onCreate: (input: { body: string; lineNumber: number | null }) => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [lineNumber, setLineNumber] = useState("");
  const canComment = Boolean(targetFile?.id);

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedBody = body.trim();

    if (!trimmedBody || !canComment) {
      return;
    }

    await onCreate({
      body: trimmedBody,
      lineNumber: lineNumber.trim() ? Number(lineNumber) : null
    });
    setBody("");
    setLineNumber("");
  }

  return (
    <section className="file-comments-panel">
      <div className="file-comments-heading">
        <strong>Comments</strong>
        <span>{isLoading ? "Loading" : `${comments.length}`}</span>
      </div>
      {!canComment ? <p className="empty-state">Comments require persisted files.</p> : null}
      {error ? <p className="code-download-error">{error}</p> : null}
      {canComment ? (
        <form className="file-comment-form" onSubmit={submitComment}>
          <input
            inputMode="numeric"
            min="1"
            placeholder="Line"
            type="number"
            value={lineNumber}
            onChange={(event) => setLineNumber(event.target.value)}
          />
          <input
            placeholder="Add a comment"
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          <button disabled={isCreating || !body.trim()} type="submit">
            Add
          </button>
        </form>
      ) : null}
      <div className="file-comment-list">
        {comments.map((comment) => (
          <article className="file-comment-row" key={comment.id}>
            <div>
              <strong>{comment.createdByUserName ?? comment.createdByUserEmail ?? "User"}</strong>
              <span>{comment.lineNumber ? `line ${comment.lineNumber}` : "file"}</span>
            </div>
            <p>{comment.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

type RoomCommentTargetKey = "artifactFileId" | "agentRunEventId";

function useRoomComments({
  roomId,
  targetId,
  targetKey,
  user
}: {
  roomId: string;
  targetId: string | null;
  targetKey: RoomCommentTargetKey;
  user: DevUser;
}): {
  comments: RoomComment[];
  createComment: (input: { body: string; lineNumber: number | null }) => Promise<void>;
  error: string | null;
  isCreating: boolean;
  isLoading: boolean;
} {
  const [comments, setComments] = useState<RoomComment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isStale = false;

    if (!targetId) {
      setComments([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    workroomApi<RoomCommentsResponse>(`/rooms/${roomId}/comments?${targetKey}=${encodeURIComponent(targetId)}`, {
      user
    })
      .then((response) => {
        if (isStale) {
          return;
        }

        setComments(response.comments);
        setIsLoading(false);
      })
      .catch((cause: unknown) => {
        if (isStale) {
          return;
        }

        setError(cause instanceof Error ? cause.message : "Could not load comments.");
        setIsLoading(false);
      });

    return () => {
      isStale = true;
    };
  }, [roomId, targetId, targetKey, user.email, user.name]);

  async function createComment(input: { body: string; lineNumber: number | null }) {
    if (!targetId) {
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const response = await workroomApi<CreateRoomCommentResponse>(`/rooms/${roomId}/comments`, {
        method: "POST",
        user,
        body: {
          [targetKey]: targetId,
          body: input.body,
          ...(input.lineNumber ? { lineNumber: input.lineNumber } : {})
        }
      });

      setComments((current) => [...current, response.comment]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create comment.");
    } finally {
      setIsCreating(false);
    }
  }

  return {
    comments,
    createComment,
    error,
    isCreating,
    isLoading
  };
}

function PreviewFrame({ html, previewUrl, title }: { html?: string; previewUrl?: string; title: string }) {
  const [mode, setMode] = useState<"desktop" | "mobile">("desktop");
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <div className={`preview-frame-shell preview-frame-${mode}`}>
      <div className="preview-toolbar">
        <div>
          <strong>Preview</strong>
          <span>{mode}</span>
        </div>
        <div className="preview-actions">
          <button
            className={mode === "desktop" ? "is-active secondary-button" : "secondary-button"}
            type="button"
            onClick={() => setMode("desktop")}
          >
            Desktop
          </button>
          <button
            className={mode === "mobile" ? "is-active secondary-button" : "secondary-button"}
            type="button"
            onClick={() => setMode("mobile")}
          >
            Mobile
          </button>
          <button className="secondary-button" type="button" onClick={() => setReloadKey((current) => current + 1)}>
            Refresh
          </button>
        </div>
      </div>
      <iframe
        key={`${previewUrl ?? "html"}:${reloadKey}`}
        sandbox="allow-scripts allow-forms"
        src={previewUrl}
        srcDoc={previewUrl ? undefined : html}
        title={title}
      />
      {previewUrl ? (
        <a href={previewUrl} rel="noreferrer" target="_blank">
          Open preview
        </a>
      ) : null}
    </div>
  );
}

type CodexRunPanelProps = {
  agents: RoomAgent[];
  artifact: RealtimeArtifact;
  isRetrying: boolean;
  localCodexStatus: LocalCodexStatus;
  participants: RoomParticipant[];
  roomId: string;
  taskItem: RoomTaskItem;
  user: DevUser;
  onCancelTask: (taskId: string) => void;
  onRetryTask: (taskId: string, instruction: string) => void;
};

function CodexRunPanel({
  agents,
  artifact,
  isRetrying,
  localCodexStatus,
  participants,
  roomId,
  taskItem,
  user,
  onCancelTask,
  onRetryTask
}: CodexRunPanelProps) {
  const owner = describeCodexOwner(taskItem, artifact, agents, participants);
  const health = describeCodexHealth(localCodexStatus);
  const runSteps = buildCodexRunSteps(taskItem, artifact);
  const hasBridgeDisconnected = runSteps.some((step) => step.kind === "bridge_disconnected");

  return (
    <section className="codex-run-panel">
      <div className="codex-run-header">
        <div>
          <p className="eyebrow">Codex Local cockpit</p>
          <h3>{owner}</h3>
          <span>{health}</span>
        </div>
        <div className="codex-run-actions">
          {isTaskInFlight(taskItem.task.status) ? (
            <button className="secondary-button" type="button" onClick={() => onCancelTask(taskItem.task.id)}>
              Cancel
            </button>
          ) : null}
          {hasBridgeDisconnected ? (
            <button
              className="secondary-button"
              type="button"
              disabled={isRetrying}
              onClick={() => onRetryTask(taskItem.task.id, "Retry from the current artifact after bridge_disconnected.")}
            >
              {isRetrying ? "Retrying" : "Retry"}
            </button>
          ) : null}
          {taskItem.task.status === "COMPLETED" ? (
            <button
              className="secondary-button"
              type="button"
              disabled={isRetrying}
              onClick={() => onRetryTask(taskItem.task.id, "Continue from the current artifact and improve the output.")}
            >
              {isRetrying ? "Starting" : "Continue"}
            </button>
          ) : null}
        </div>
      </div>
      <div className="codex-run-timeline">
        {runSteps.map((step, index) => (
          <article className={`codex-run-step codex-run-step-${step.kind}`} key={`${step.kind}:${step.time}:${index}`}>
            <div>
              <strong>{step.title}</strong>
              <time dateTime={step.time}>{formatEventTime(step.time)}</time>
            </div>
            <p>{step.detail}</p>
            {step.runEventId ? <RunStepComments roomId={roomId} runEventId={step.runEventId} user={user} /> : null}
          </article>
        ))}
      </div>
      <details className="raw-debug-drawer">
        <summary>Raw debug</summary>
        <pre>{JSON.stringify({ artifact: artifact.latestVersion?.content ?? {}, logs: taskItem.logs, runEvents: taskItem.runEvents }, null, 2)}</pre>
      </details>
    </section>
  );
}

function RunStepComments({ roomId, runEventId, user }: { roomId: string; runEventId: string; user: DevUser }) {
  const [body, setBody] = useState("");
  const comments = useRoomComments({
    roomId,
    targetId: runEventId,
    targetKey: "agentRunEventId",
    user
  });

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedBody = body.trim();

    if (!trimmedBody) {
      return;
    }

    await comments.createComment({
      body: trimmedBody,
      lineNumber: null
    });
    setBody("");
  }

  return (
    <div className="run-step-comments">
      <div className="run-step-comments-heading">
        <span>Comments</span>
        <small>{comments.isLoading ? "Loading" : comments.comments.length}</small>
      </div>
      {comments.error ? <p className="code-download-error">{comments.error}</p> : null}
      {comments.comments.length > 0 ? (
        <div className="run-step-comment-list">
          {comments.comments.map((comment) => (
            <p key={comment.id}>
              <strong>{comment.createdByUserName ?? comment.createdByUserEmail ?? "User"}</strong>
              <span>{comment.body}</span>
            </p>
          ))}
        </div>
      ) : null}
      <form className="run-step-comment-form" onSubmit={submitComment}>
        <input placeholder="Add a comment" value={body} onChange={(event) => setBody(event.target.value)} />
        <button disabled={comments.isCreating || !body.trim()} type="submit">
          Add
        </button>
      </form>
    </div>
  );
}

function TaskLogPanel({ logs }: { logs: RealtimeTaskLog[] }) {
  return (
    <section className="task-log-panel">
      <div className="panel-heading">
        <h3>Logs</h3>
        <span>{logs.length}</span>
      </div>
      <div className="task-log-list">
        {logs.length === 0 ? <p className="empty-state">No logs.</p> : null}
        {logs.map((log) => (
          <p className="task-log-row" key={log.id}>
            <time dateTime={log.createdAt}>{formatEventTime(log.createdAt)}</time>
            <span>{log.message}</span>
          </p>
        ))}
      </div>
    </section>
  );
}

function getTrackRefKey(trackRef: TrackReferenceOrPlaceholder): string {
  return `${trackRef.participant.identity}:${trackRef.source}`;
}

function mergeRoomTaskEvents(initialItems: RoomTaskItem[], events: RealtimeRoomEvent[]): RoomTaskItem[] {
  const itemsByTaskId = new Map<string, RoomTaskItem>();

  for (const item of initialItems) {
    itemsByTaskId.set(item.task.id, {
      task: item.task,
      artifacts: [...item.artifacts],
      logs: [...item.logs],
      runEvents: [...item.runEvents]
    });
  }

  for (const event of [...events].reverse()) {
    if (event.type === "task.created") {
      const existing = itemsByTaskId.get(event.task.id);

      itemsByTaskId.set(event.task.id, {
        task: event.task,
        artifacts: existing?.artifacts ?? [],
        logs: existing?.logs ?? [],
        runEvents: existing?.runEvents ?? []
      });
    }

    if (event.type === "task.status") {
      const existing = itemsByTaskId.get(event.task.id);

      itemsByTaskId.set(event.task.id, {
        task: event.task,
        artifacts: existing?.artifacts ?? [],
        logs: existing?.logs ?? [],
        runEvents: existing?.runEvents ?? []
      });
    }

    if (event.type === "task.log") {
      const existing = itemsByTaskId.get(event.taskId);

      if (existing) {
        itemsByTaskId.set(event.taskId, {
          task: existing.task,
          artifacts: existing.artifacts,
          logs: upsertTaskLog(existing.logs, event.log),
          runEvents: existing.runEvents
        });
      }
    }

    if (
      (event.type === "artifact.created" ||
        event.type === "artifact.updated" ||
        event.type === "artifact.patch" ||
        event.type === "artifact.preview_url") &&
      event.artifact.taskId
    ) {
      const existing = itemsByTaskId.get(event.artifact.taskId);

      if (existing) {
        itemsByTaskId.set(event.artifact.taskId, {
          task: existing.task,
          artifacts: upsertArtifact(existing.artifacts, event.artifact),
          logs: existing.logs,
          runEvents: existing.runEvents
        });
      }
    }
  }

  return [...itemsByTaskId.values()].sort(
    (left, right) => new Date(left.task.createdAt).getTime() - new Date(right.task.createdAt).getTime()
  );
}

function upsertTaskLog(logs: RealtimeTaskLog[], log: RealtimeTaskLog): RealtimeTaskLog[] {
  const nextLogs = logs.filter((candidate) => candidate.id !== log.id);

  return [...nextLogs, log].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  );
}

function upsertArtifact(artifacts: RealtimeArtifact[], artifact: RealtimeArtifact): RealtimeArtifact[] {
  const nextArtifacts = artifacts.filter((candidate) => candidate.id !== artifact.id);

  return [...nextArtifacts, artifact].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  );
}

function upsertRoomAgent(agents: RoomAgent[], agent: RoomAgent): RoomAgent[] {
  const nextAgents = agents.filter((candidate) => candidate.id !== agent.id);

  return [...nextAgents, agent].sort(
    (left, right) => new Date(left.registeredAt).getTime() - new Date(right.registeredAt).getTime()
  );
}

function upsertApproval(approvals: ApprovalRequest[], approval: ApprovalRequest): ApprovalRequest[] {
  const nextApprovals = approvals.filter((candidate) => candidate.id !== approval.id);

  return [...nextApprovals, approval].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
}

function isAgentSpeechEvent(
  event: RealtimeRoomEvent
): event is Extract<RealtimeRoomEvent, { type: "agent.speech" }> {
  return event.type === "agent.speech";
}

function isRoomAuditEvent(
  event: RealtimeRoomEvent
): event is Extract<RealtimeRoomEvent, { type: "room.event" }> {
  return event.type === "room.event";
}

function isTaskCreatedEvent(
  event: RealtimeRoomEvent
): event is Extract<RealtimeRoomEvent, { type: "task.created" }> {
  return event.type === "task.created";
}

function readRoomAgentFromEvent(event: RoomEvent): RoomAgent | null {
  const agent = event.payload.agent;

  if (!isRecord(agent) || typeof agent.id !== "string" || typeof agent.name !== "string") {
    return null;
  }

  return agent as RoomAgent;
}

function readApprovalFromEvent(event: RoomEvent): ApprovalRequest | null {
  const approval = event.payload.approval;

  if (!isRecord(approval) || typeof approval.id !== "string" || typeof approval.action !== "string") {
    return null;
  }

  return approval as ApprovalRequest;
}

function groupPersonalAgentsByUserId(agents: RoomAgent[]): Map<string, RoomAgent[]> {
  const agentsByUserId = new Map<string, RoomAgent[]>();

  for (const agent of agents) {
    const userId = getAgentOwnerUserId(agent);

    if (!userId) {
      continue;
    }

    agentsByUserId.set(userId, [...(agentsByUserId.get(userId) ?? []), agent]);
  }

  return agentsByUserId;
}

function getAgentOwnerUserId(agent: RoomAgent): string | null {
  return getMetadataStringValue(agent.metadata, "pairedByUserId") ?? getMetadataStringValue(agent.metadata, "ownerUserId");
}

function createAgentStatusMap(
  agents: RoomAgent[],
  taskItems: RoomTaskItem[],
  approvals: ApprovalRequest[],
  localCodexStatus: LocalCodexStatus
): Map<string, AgentCompactStatus> {
  const statuses = new Map<string, AgentCompactStatus>();

  for (const agent of agents) {
    statuses.set(agent.id, getAgentCompactStatus(agent, taskItems, approvals, localCodexStatus));
  }

  return statuses;
}

function getAgentCompactStatus(
  agent: RoomAgent,
  taskItems: RoomTaskItem[],
  approvals: ApprovalRequest[],
  localCodexStatus: LocalCodexStatus
): AgentCompactStatus {
  if (approvals.some((approval) => approval.requestedByAgentId === agent.id && approval.status === "PENDING")) {
    return "approval_needed";
  }

  if (taskItems.some((item) => item.task.assignedAgentId === agent.id && isTaskInFlight(item.task.status))) {
    return "working";
  }

  if (
    agent.provider === "CODEX" &&
    (localCodexStatus.status === "bridge_error" || localCodexStatus.status === "codex_auth_error")
  ) {
    return "blocked";
  }

  return "idle";
}

function getSandboxTaskItems(
  selection: SandboxSelection,
  participants: RoomParticipant[],
  personalAgentsByUserId: Map<string, RoomAgent[]>,
  taskItems: RoomTaskItem[]
): RoomTaskItem[] {
  if (selection.type === "room") {
    return taskItems;
  }

  const participant = participants.find((candidate) => candidate.id === selection.participantId);
  const userId = participant?.userId ?? null;
  const personalAgentIds = new Set((userId ? personalAgentsByUserId.get(userId) ?? [] : []).map((agent) => agent.id));

  return taskItems.filter((item) => {
    if (userId && item.task.createdByUserId === userId) {
      return true;
    }

    if (item.task.assignedAgentId && personalAgentIds.has(item.task.assignedAgentId)) {
      return true;
    }

    return item.artifacts.some((artifact) => artifact.createdByAgentId && personalAgentIds.has(artifact.createdByAgentId));
  });
}

function deriveJeanActionMode(
  mode: JeanActionMode,
  taskItems: RoomTaskItem[],
  pendingApprovals: ApprovalRequest[],
  speechEvents: Array<Extract<RealtimeRoomEvent, { type: "agent.speech" }>>
): JeanActionMode {
  if (mode === "proposing" || mode === "executing" || mode === "blocked") {
    return mode;
  }

  if (pendingApprovals.length > 0) {
    return "approval_needed";
  }

  if (taskItems.some((item) => isTaskInFlight(item.task.status))) {
    return "executing";
  }

  if (speechEvents.length > 0) {
    return "listening";
  }

  return "passive";
}

function isTaskInFlight(status: RoomTaskItem["task"]["status"]): boolean {
  return status === "PENDING" || status === "RUNNING" || status === "WAITING_FOR_APPROVAL";
}

function filterTaskItems(taskItems: RoomTaskItem[], filter: TaskFilter): RoomTaskItem[] {
  if (filter === "active") {
    return taskItems.filter((item) => isTaskInFlight(item.task.status));
  }

  if (filter === "done") {
    return taskItems.filter((item) => item.task.status === "COMPLETED");
  }

  if (filter === "blocked") {
    return taskItems.filter((item) => item.task.status === "FAILED" || item.task.status === "CANCELED");
  }

  return taskItems;
}

function filterToolCalls(toolCalls: RoomToolCall[], filter: ToolCallStatusFilter): RoomToolCall[] {
  if (filter === "all") {
    return toolCalls;
  }

  return toolCalls.filter((toolCall) => toolCall.status === filter);
}

function formatTaskFilter(filter: TaskFilter): string {
  const labels: Record<TaskFilter, string> = {
    active: "Active",
    all: "All",
    blocked: "Blocked",
    done: "Done"
  };

  return labels[filter];
}

function formatToolCallFilter(filter: ToolCallStatusFilter): string {
  const labels: Record<ToolCallStatusFilter, string> = {
    all: "All",
    BLOCKED: "Blocked",
    FAILED: "Failed",
    RUNNING: "Running",
    SUCCEEDED: "Succeeded"
  };

  return labels[filter];
}

function formatPolicyRole(role: string | null): string {
  return role ?? "none";
}

function getPolicyRiskOptions(baseRiskLevel: RoomPolicyRule["riskLevel"]): Array<RoomPolicyRule["riskLevel"]> {
  const riskLevels: Array<RoomPolicyRule["riskLevel"]> = ["LOW", "MEDIUM", "HIGH"];
  const baseIndex = riskLevels.indexOf(baseRiskLevel);

  return riskLevels.slice(baseIndex < 0 ? 0 : baseIndex);
}

function formatToolCallAgent(toolCall: RoomToolCall, agentsById: Map<string, RoomAgent>): string {
  const agent = agentsById.get(toolCall.agentId);

  if (!agent) {
    return toolCall.agentId;
  }

  return `${agent.name} / ${agent.provider}`;
}

function getToolCallSummary(toolCall: RoomToolCall): string {
  if (toolCall.errorMessage) {
    return truncateToolCallText(toolCall.errorMessage);
  }

  const keys = getToolCallResultKeys(toolCall.result);

  if (keys) {
    return `Result: ${keys}`;
  }

  if (toolCall.status === "RUNNING") {
    return "Running.";
  }

  return "No structured result.";
}

function getToolCallResultKeys(result: Record<string, unknown> | null): string | null {
  if (!result) {
    return null;
  }

  const keys = result.keys;

  if (!Array.isArray(keys)) {
    return null;
  }

  const formattedKeys = keys.filter((key): key is string => typeof key === "string").slice(0, 5);

  return formattedKeys.length > 0 ? formattedKeys.join(", ") : null;
}

function formatToolCallDuration(toolCall: RoomToolCall): string {
  if (typeof toolCall.durationMs === "number") {
    return `${toolCall.durationMs}ms`;
  }

  if (toolCall.status === "RUNNING") {
    return "running";
  }

  return "duration n/a";
}

function formatToolCallContext(toolCall: RoomToolCall): string[] {
  const items: string[] = [];

  if (toolCall.taskId) {
    items.push(`task ${shortId(toolCall.taskId)}`);
  }

  if (toolCall.artifactId) {
    items.push(`artifact ${shortId(toolCall.artifactId)}`);
  }

  if (toolCall.approvalId) {
    items.push(`approval ${shortId(toolCall.approvalId)}`);
  }

  if (typeof toolCall.errorCode === "number") {
    items.push(`error ${toolCall.errorCode}`);
  }

  return items;
}

function shortId(value: string): string {
  return value.length > 10 ? `${value.slice(0, 8)}...` : value;
}

function isCliFirstAgent(agent: RoomAgent): boolean {
  return agent.provider === "CODEX" || agent.provider === "CLAUDE_CODE" || agent.transport === "STDIO";
}

function getMetadataStringValue(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];

  return typeof value === "string" && value.trim() ? value : null;
}

function formatJeanActionMode(mode: JeanActionMode): string {
  const labels: Record<JeanActionMode, string> = {
    approval_needed: "approval needed",
    blocked: "blocked",
    executing: "execution",
    listening: "ecoute active",
    passive: "passif",
    proposing: "propose action"
  };

  return labels[mode];
}

function formatSandboxSelection(selection: SandboxSelection, participants: RoomParticipant[]): string {
  if (selection.type === "room") {
    return "Room";
  }

  const participant = participants.find((candidate) => candidate.id === selection.participantId);

  return participant ? formatParticipantName(participant) : "User";
}

function formatAgentStatus(status: AgentCompactStatus): string {
  const labels: Record<AgentCompactStatus, string> = {
    approval_needed: "approval needed",
    blocked: "blocked",
    idle: "idle",
    working: "working"
  };

  return labels[status];
}

function formatAgentInitials(agent: RoomAgent): string {
  return agent.name
    .split(/\s+/)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("")
    .slice(0, 2) || agent.provider.slice(0, 1);
}

function formatTaskMeta(item: RoomTaskItem): string {
  const artifact = item.artifacts[0];

  return artifact ? `${item.task.status} / ${formatArtifactType(artifact.type)}` : item.task.status;
}

function formatLocalCodexStatus(status: LocalCodexStatus): string {
  const labels: Record<LocalCodexStatus["status"], string> = {
    bridge_error: "erreur bridge",
    codex_auth_error: "erreur Codex auth",
    connected: "connecte",
    expired: "expire",
    not_connected: "non connecte",
    pairing_pending: "pairing en attente"
  };

  return labels[status.status];
}

function getLocalCodexNextStep(status: LocalCodexStatus): string | null {
  if (status.status === "not_connected") {
    return "Create a pairing code before delegating code tasks.";
  }

  if (status.status === "pairing_pending") {
    return status.pairing?.command ? "Run the pairing command on the local machine." : "Regenerate the pairing code.";
  }

  if (status.status === "expired") {
    return "Regenerate the pairing code.";
  }

  if (status.status === "codex_auth_error") {
    return "Sign in to Codex locally, then restart jean-bridge.";
  }

  if (status.status === "bridge_error") {
    return "Restart jean-bridge and refresh the room status.";
  }

  if (status.connection?.busyTaskId) {
    return `Working on ${status.connection.busyTaskId}.`;
  }

  return "Ready for delegated code tasks.";
}

function formatArtifactType(type: RealtimeArtifact["type"]): string {
  const labels: Record<RealtimeArtifact["type"], string> = {
    CODE: "Code",
    DIAGRAM: "Diagram",
    DOCUMENT: "Document",
    LOG: "Log",
    PREVIEW: "Preview",
    RESEARCH: "Research"
  };

  return labels[type];
}

function formatArtifactContent(artifact: RealtimeArtifact): string {
  const content = artifact.latestVersion?.content;

  return getContentText(content, "text") ?? getContentText(content, "value") ?? `${formatArtifactType(artifact.type)} draft created.`;
}

function getContentText(content: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = content?.[key];

  return typeof value === "string" && value.trim() ? value : null;
}

function useArtifactCodeFiles({
  artifact,
  roomId,
  user
}: {
  artifact: RealtimeArtifact;
  roomId: string;
  user: DevUser;
}): {
  error: string | null;
  files: CodeArtifactFile[];
  isLoading: boolean;
  source: "artifact" | "empty" | "persisted";
} {
  const fallbackFiles = useMemo(() => getCodeFiles(artifact.latestVersion?.content?.files), [artifact.latestVersion?.content?.files]);
  const [persistedFiles, setPersistedFiles] = useState<CodeArtifactFile[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isStale = false;

    setIsLoading(true);
    setError(null);

    workroomApi<ArtifactFilesResponse>(`/rooms/${roomId}/artifacts/${artifact.id}/files`, {
      user
    })
      .then((response) => {
        if (isStale) {
          return;
        }

        setPersistedFiles(response.files.map(artifactFileToCodeFile));
        setIsLoading(false);
      })
      .catch((cause: unknown) => {
        if (isStale) {
          return;
        }

        setPersistedFiles(null);
        setError(cause instanceof Error ? cause.message : "Could not load persisted files.");
        setIsLoading(false);
      });

    return () => {
      isStale = true;
    };
  }, [artifact.id, artifact.updatedAt, roomId, user.email, user.name]);

  const files = persistedFiles && persistedFiles.length > 0 ? persistedFiles : fallbackFiles;
  const source = persistedFiles && persistedFiles.length > 0 ? "persisted" : fallbackFiles.length > 0 ? "artifact" : "empty";

  return {
    error,
    files,
    isLoading,
    source
  };
}

function artifactFileToCodeFile(file: ArtifactFileItem): CodeArtifactFile {
  return {
    id: file.id,
    path: file.path,
    content: file.latestVersion?.content ?? "",
    language: file.language ?? detectCodeLanguage(file.path),
    latestVersion: file.latestVersion ? String(file.latestVersion.version) : null,
    producedByRunId: file.latestVersion?.runId ?? null,
    diffId: file.latestDiff?.id ?? null,
    latestDiff: file.latestDiff?.unifiedDiff ?? null
  };
}

function getRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord);
}

function getRecordString(record: Record<string, unknown>, key: string, fallback: string): string {
  const value = record[key];

  return typeof value === "string" && value.trim() ? value : fallback;
}

function getCodeFiles(value: unknown): CodeArtifactFile[] {
  return getRecordArray(value)
    .map((file, index) => ({
      id: getOptionalRecordString(file, "id"),
      path: getRecordString(file, "path", `file-${index + 1}.txt`),
      content: getRecordString(file, "content", ""),
      language: getOptionalRecordString(file, "language") ?? detectCodeLanguage(getRecordString(file, "path", "")),
      latestVersion: getOptionalRecordString(file, "latestVersion") ?? getOptionalRecordString(file, "version"),
      producedByRunId: getOptionalRecordString(file, "producedByRunId") ?? getOptionalRecordString(file, "runId"),
      diffId: getOptionalRecordString(file, "diffId"),
      latestDiff: getOptionalRecordString(file, "latestDiff") ?? getOptionalRecordString(file, "diff")
    }))
    .filter((file) => file.content || file.path);
}

function getOptionalRecordString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];

  if (typeof value === "string" && value.trim()) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function detectCodeLanguage(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase();
  const languages: Record<string, string> = {
    css: "css",
    html: "html",
    js: "javascript",
    json: "json",
    jsx: "jsx",
    md: "markdown",
    mjs: "javascript",
    ts: "typescript",
    tsx: "tsx"
  };

  return extension ? languages[extension] ?? extension : "text";
}

function formatFileMeta(file: CodeArtifactFile): string {
  const parts = [file.language, file.latestVersion ? `v${file.latestVersion.replace(/^v/i, "")}` : null].filter(isPresent);

  return parts.join(" / ");
}

function slugifyFileName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "artifact";
}

function isHtmlEntryPoint(file: CodeArtifactFile): boolean {
  return file.path.toLowerCase().endsWith("/index.html") || file.path.toLowerCase() === "index.html";
}

function isHtmlFile(file: CodeArtifactFile): boolean {
  return file.language === "html" || file.path.toLowerCase().endsWith(".html");
}

type CodexRunStep = {
  kind: "created" | "delegated" | "claimed" | "log" | "files" | "completed" | "failed" | "canceled" | "bridge_disconnected";
  title: string;
  detail: string;
  runEventId?: string;
  time: string;
};

function buildCodexRunSteps(taskItem: RoomTaskItem, artifact: RealtimeArtifact): CodexRunStep[] {
  const steps: CodexRunStep[] = [
    {
      kind: "created",
      title: "Task created",
      detail: taskItem.task.title,
      time: taskItem.task.createdAt
    }
  ];

  if (taskItem.runEvents.length > 0) {
    for (const runEvent of taskItem.runEvents) {
      steps.push(buildCodexRunEventStep(runEvent));
    }
  } else {
    for (const log of taskItem.logs) {
      const parsedStep = parseCodexLogStep(log);

      steps.push(parsedStep);
    }
  }

  const files = getCodeFiles(artifact.latestVersion?.content?.files);

  if (files.length > 0) {
    steps.push({
      kind: "files",
      title: "Files published",
      detail: `${files.length} file${files.length > 1 ? "s" : ""}: ${files.map((file) => file.path).join(", ")}`,
      time: artifact.updatedAt
    });
  }

  if (taskItem.task.status === "COMPLETED" && !steps.some((step) => step.kind === "completed")) {
    steps.push({
      kind: "completed",
      title: "Completed",
      detail: artifact.status === "READY" ? "Artifact ready in the room." : `Artifact is ${artifact.status}.`,
      time: taskItem.task.completedAt ?? taskItem.task.updatedAt
    });
  }

  if (
    taskItem.task.status === "FAILED" &&
    !steps.some((step) => step.kind === "bridge_disconnected" || step.kind === "failed")
  ) {
    steps.push({
      kind: "failed",
      title: "Failed",
      detail: "The run failed before completion.",
      time: taskItem.task.completedAt ?? taskItem.task.updatedAt
    });
  }

  if (taskItem.task.status === "CANCELED" && !steps.some((step) => step.kind === "canceled")) {
    steps.push({
      kind: "canceled",
      title: "Canceled",
      detail: "The run was canceled by the room.",
      time: taskItem.task.completedAt ?? taskItem.task.updatedAt
    });
  }

  return steps.sort((left, right) => new Date(left.time).getTime() - new Date(right.time).getTime());
}

function buildCodexRunEventStep(event: RoomAgentRunEvent): CodexRunStep {
  const payload = event.payload ?? {};
  const detail =
    getContentText(payload, "summary") ??
    getContentText(payload, "message") ??
    getContentText(payload, "step") ??
    event.type;

  if (/bridge_disconnected/i.test(`${event.type} ${detail}`)) {
    return {
      kind: "bridge_disconnected",
      title: "Bridge disconnected",
      detail: detail.replace(/^bridge_disconnected:\s*/i, ""),
      runEventId: event.id,
      time: event.createdAt
    };
  }

  if (event.type === "agent.run.started") {
    return {
      kind: "claimed",
      title: "Run started",
      detail,
      runEventId: event.id,
      time: event.createdAt
    };
  }

  if (event.type === "agent.run.completed") {
    return {
      kind: "completed",
      title: "Completed",
      detail,
      runEventId: event.id,
      time: event.createdAt
    };
  }

  if (event.type === "agent.run.failed") {
    return {
      kind: "failed",
      title: "Failed",
      detail,
      runEventId: event.id,
      time: event.createdAt
    };
  }

  if (event.type === "agent.run.canceled") {
    return {
      kind: "canceled",
      title: "Canceled",
      detail,
      runEventId: event.id,
      time: event.createdAt
    };
  }

  return {
    kind: "log",
    title: "Run event",
    detail,
    runEventId: event.id,
    time: event.createdAt
  };
}

function parseCodexLogStep(log: RealtimeTaskLog): CodexRunStep {
  if (/bridge_disconnected/i.test(log.message)) {
    return {
      kind: "bridge_disconnected",
      title: "Bridge disconnected",
      detail: log.message.replace(/^bridge_disconnected:\s*/i, ""),
      time: log.createdAt
    };
  }

  if (/delegated to codex local/i.test(log.message)) {
    return {
      kind: "delegated",
      title: "Delegated to Codex Local",
      detail: log.message,
      time: log.createdAt
    };
  }

  if (/claimed the task|a pris la tâche|a pris la tache/i.test(log.message)) {
    return {
      kind: "claimed",
      title: "Codex Local claimed the task",
      detail: log.message,
      time: log.createdAt
    };
  }

  return {
    kind: "log",
    title: "Run log",
    detail: log.message,
    time: log.createdAt
  };
}

function isCodexRunTask(taskItem: RoomTaskItem, artifact: RealtimeArtifact, agents: RoomAgent[]): boolean {
  const taskAgent = agents.find((agent) => agent.id === taskItem.task.assignedAgentId);
  const artifactAgent = agents.find((agent) => agent.id === artifact.createdByAgentId);
  const content = artifact.latestVersion?.content ?? {};

  return (
    taskAgent?.provider === "CODEX" ||
    artifactAgent?.provider === "CODEX" ||
    isRecord(content.codex) ||
    taskItem.logs.some((log) => /codex|jean-bridge|bridge_disconnected/i.test(log.message))
  );
}

function describeCodexOwner(
  taskItem: RoomTaskItem,
  artifact: RealtimeArtifact,
  agents: RoomAgent[],
  participants: RoomParticipant[]
): string {
  const agent =
    agents.find((candidate) => candidate.id === taskItem.task.assignedAgentId) ??
    agents.find((candidate) => candidate.id === artifact.createdByAgentId) ??
    agents.find((candidate) => candidate.provider === "CODEX");

  const ownerUserId = agent ? getAgentOwnerUserId(agent) ?? getRunOwnerUserId(taskItem) : getRunOwnerUserId(taskItem);
  const owner = ownerUserId ? participants.find((participant) => participant.userId === ownerUserId) : null;
  const agentName = agent?.name ?? "Codex Local";

  return owner ? `${agentName} de ${formatParticipantName(owner)}` : agentName;
}

function getRunOwnerUserId(taskItem: RoomTaskItem): string | null {
  return taskItem.runEvents.find((event) => event.ownerUserId)?.ownerUserId ?? null;
}

function describeCodexHealth(status: LocalCodexStatus): string {
  if (status.status !== "connected" || !status.connection) {
    return formatLocalCodexStatus(status);
  }

  if (status.connection.busyTaskId) {
    return `busy on ${status.connection.busyTaskId}`;
  }

  const heartbeatAgeMs = Date.now() - new Date(status.connection.lastHeartbeatAt).getTime();

  if (Number.isFinite(heartbeatAgeMs) && heartbeatAgeMs <= 45_000) {
    return "registered / heartbeat ok";
  }

  return "registered / heartbeat stale";
}

function splitParagraphs(value: string): string[] {
  return value
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function createSpeakerLabels(participants: RoomParticipant[]): Map<string, string> {
  const labels = new Map<string, string>();

  for (const participant of participants) {
    const participantId = participant.userId ?? participant.agentId;

    if (participantId) {
      labels.set(participantId, formatParticipantName(participant));
    }
  }

  return labels;
}

function formatParticipantName(participant: RoomParticipant): string {
  return participant.userName ?? participant.agentName ?? participant.userEmail ?? participant.userId ?? participant.agentId ?? "Participant";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Request failed.";
}

function formatEventTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function getApprovalDetailRows(approval: ApprovalRequest): Array<[string, string]> {
  const rows: Array<[string, string]> = [];

  if (approval.taskId) {
    rows.push(["Task", approval.taskId]);
  }

  if (approval.artifactId) {
    rows.push(["Artifact", approval.artifactId]);
  }

  if (approval.requestedByAgentId) {
    rows.push(["Agent", approval.requestedByAgentId]);
  }

  if (approval.decidedAt) {
    rows.push(["Decided", formatEventTime(approval.decidedAt)]);
  }

  for (const [key, value] of Object.entries(approval.payload).slice(0, 6)) {
    const formattedValue = formatApprovalPayloadValue(value);

    if (formattedValue) {
      rows.push([formatApprovalPayloadKey(key), formattedValue]);
    }
  }

  return rows;
}

function formatApprovalPayloadKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatApprovalPayloadValue(value: unknown): string | null {
  if (typeof value === "string") {
    return truncateApprovalText(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    const compactValues = value
      .map((item) => {
        if (isRecord(item) && typeof item.path === "string") {
          return item.path;
        }

        if (typeof item === "string") {
          return item;
        }

        return null;
      })
      .filter(isPresent);

    return compactValues.length > 0 ? truncateApprovalText(compactValues.join(", ")) : truncateApprovalText(JSON.stringify(value));
  }

  if (isRecord(value)) {
    return truncateApprovalText(JSON.stringify(value));
  }

  return null;
}

function truncateApprovalText(value: string): string {
  const trimmed = value.trim();

  if (trimmed.length <= 180) {
    return trimmed;
  }

  return `${trimmed.slice(0, 177)}...`;
}

function truncateToolCallText(value: string): string {
  const trimmed = value.trim();

  if (trimmed.length <= 140) {
    return trimmed;
  }

  return `${trimmed.slice(0, 137)}...`;
}

function getEventTitle(event: RealtimeRoomEvent, speakerLabelsById: Map<string, string>): string {
  if (event.type === "room.event") {
    return formatRoomEventType(event.event.type);
  }

  if (event.type === "transcript.partial" || event.type === "transcript.final") {
    return speakerLabelsById.get(event.speakerId) ?? event.speakerId;
  }

  if (event.type === "agent.speech") {
    return "Jean";
  }

  if (event.type === "task.created" || event.type === "task.status" || event.type === "task.log") {
    return "Task";
  }

  return "Artifact";
}

function getEventBadge(event: RealtimeRoomEvent): string {
  if (event.type === "room.event") {
    return "Room";
  }

  if (event.type === "transcript.partial") {
    return "Partial";
  }

  if (event.type === "transcript.final") {
    return "Final";
  }

  if (event.type === "task.created") {
    return "Created";
  }

  if (event.type === "task.status") {
    return event.task.status;
  }

  if (event.type === "task.log") {
    return "Log";
  }

  if (event.type === "artifact.created") {
    return formatArtifactType(event.artifact.type);
  }

  if (event.type === "artifact.updated") {
    return "Updated";
  }

  if (event.type === "artifact.patch") {
    return "Patch";
  }

  if (event.type === "artifact.preview_url") {
    return "Preview";
  }

  return "Speech";
}

function getEventBody(event: RealtimeRoomEvent): string {
  if (event.type === "room.event") {
    const approval = readApprovalFromEvent(event.event);
    const agent = readRoomAgentFromEvent(event.event);

    return approval?.reason ?? agent?.name ?? formatRoomEventType(event.event.type);
  }

  if (event.type === "transcript.partial" || event.type === "transcript.final" || event.type === "agent.speech") {
    return event.text;
  }

  if (event.type === "task.created") {
    return event.task.title;
  }

  if (event.type === "task.status") {
    return `${event.task.title} is ${event.task.status}`;
  }

  if (event.type === "task.log") {
    return event.log.message;
  }

  return event.artifact.title;
}

function getEventTime(event: RealtimeRoomEvent): string {
  return event.ts;
}

function formatRoomEventType(type: RoomEvent["type"]): string {
  return type
    .toLowerCase()
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}
