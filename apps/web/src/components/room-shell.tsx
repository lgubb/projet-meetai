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
  type DevUser,
  type JoinRoomResponse,
  type LiveKitConnection,
  type LiveKitTokenResponse,
  type Room,
  type RoomAgentsResponse,
  type RoomApprovalsResponse,
  type RoomParticipant,
  type RoomResponse,
  type RoomTaskItem,
  type RoomTasksResponse,
  workroomApi
} from "@/lib/workroom-api";
import { defaultDevUser, readSavedDevUser, saveDevUser } from "@/lib/dev-user";
import { useRoomEvents } from "@/lib/use-room-events";

type RoomShellProps = {
  roomId: string;
};

const liveKitControls: ControlBarControls = {
  camera: true,
  chat: false,
  leave: true,
  microphone: true,
  screenShare: false,
  settings: false
};

export function RoomShell({ roomId }: RoomShellProps) {
  const [user, setUser] = useState<DevUser>(defaultDevUser);
  const [draftUser, setDraftUser] = useState<DevUser>(defaultDevUser);
  const [hasLoadedUser, setHasLoadedUser] = useState(false);
  const [room, setRoom] = useState<Room | null>(null);
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [taskItems, setTaskItems] = useState<RoomTaskItem[]>([]);
  const [agents, setAgents] = useState<RoomAgent[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
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

  async function joinAndLoadRoom(activeUser: DevUser) {
    setIsJoining(true);
    setLiveKitConnection(null);
    setTaskItems([]);
    setAgents([]);
    setApprovals([]);
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

      const approvalsData = await workroomApi<RoomApprovalsResponse>(`/rooms/${roomId}/approvals`, {
        user: activeUser
      });

      setApprovals(approvalsData.approvals);

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
      setApprovals([]);
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
    } catch (error) {
      setNotice(getErrorMessage(error));
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
            <span>{participants.length}</span>
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

            {participants.map((participant) => (
              <div className="participant-tile" key={participant.id}>
                <div className="avatar">{participant.role.slice(0, 1)}</div>
                <div>
                  <strong>{formatParticipantName(participant)}</strong>
                  <span>{participant.role}</span>
                </div>
              </div>
            ))}
            {participants.length === 0 ? <p className="empty-state">No participants.</p> : null}
          </div>
        </aside>

        <section className="workspace-surface">
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
              <ArtifactPreview taskItem={activeTaskItem} />
            ) : (
              <div>
                <p className="eyebrow">Workspace</p>
                <h2>Waiting for artifacts</h2>
              </div>
            )}
          </div>
        </section>

        <aside className="room-sidebar jean-sidebar">
          <section>
            <div className="panel-heading">
              <h2>Jean</h2>
              <span>{jeanSpeechEvents.length > 0 ? "Active" : "Idle"}</span>
            </div>
            <div className="jean-status">
              <div className="jean-dot" />
              <p>Ready</p>
            </div>
            <div className="jean-speech-list">
              {jeanSpeechEvents.length === 0 ? <p className="empty-state">No speech.</p> : null}
              {jeanSpeechEvents.map((event, index) => (
                <p className="jean-speech-row" key={`${event.agentId}:${event.ts}:${index}`}>
                  {event.text}
                </p>
              ))}
            </div>
          </section>

          <section>
            <div className="panel-heading">
              <h2>Tasks</h2>
              <span>{displayedTaskItems.length}</span>
            </div>
            <div className="task-list">
              {displayedTaskItems.length === 0 ? <p className="empty-state">No tasks.</p> : null}
              {displayedTaskItems.map((item) => (
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
            <div className="agent-list">
              {agents.length === 0 ? <p className="empty-state">No agents.</p> : null}
              {agents.map((agent) => (
                <article className="agent-row" key={agent.id}>
                  <div>
                    <strong>{agent.name}</strong>
                    <span>{agent.provider} / {agent.transport}</span>
                  </div>
                  <small>{agent.capabilities.join(", ")}</small>
                </article>
              ))}
            </div>
          </section>

          <section>
            <div className="panel-heading">
              <h2>Approvals</h2>
              <span>{pendingApprovals.length}/{approvals.length}</span>
            </div>
            <div className="approval-list">
              {approvals.length === 0 ? <p className="empty-state">No approvals.</p> : null}
              {approvals.map((approval) => (
                <article className="approval-row" key={approval.id}>
                  <div>
                    <strong>{approval.action}</strong>
                    <span>{approval.status} / {approval.riskLevel}</span>
                  </div>
                  <p>{approval.reason}</p>
                  {approval.status === "PENDING" ? (
                    <div className="approval-actions">
                      <button type="button" onClick={() => decideApproval(approval.id, "APPROVED")}>
                        Approve
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => decideApproval(approval.id, "REJECTED")}
                      >
                        Reject
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>

          <section className="event-debug-panel">
            <div className="panel-heading">
              <h2>Events</h2>
              <span>{roomEventsConnectionState}</span>
            </div>
            {roomEventsError ? <p className="event-debug-error">{roomEventsError}</p> : null}
            <div className="event-debug-list">
              {roomEvents.length === 0 ? <p className="empty-state">No events.</p> : null}
              {roomEvents.map((event, index) => (
                <article className="event-debug-row" key={event.eventId ?? `${event.type}:${getEventTime(event)}:${index}`}>
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

function ArtifactPreview({ taskItem }: { taskItem: RoomTaskItem }) {
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

  return (
    <div className="artifact-preview">
      <div className="artifact-preview-header">
        <p className="eyebrow">
          {taskItem.task.status} / {formatArtifactType(artifact.type)}
        </p>
        <h2>{artifact.title}</h2>
      </div>
      <ArtifactRenderer artifact={artifact} />
      <TaskLogPanel logs={taskItem.logs} />
    </div>
  );
}

function ArtifactRenderer({ artifact }: { artifact: RealtimeArtifact }) {
  if (artifact.type === "DOCUMENT") {
    return <DocumentArtifactRenderer artifact={artifact} />;
  }

  if (artifact.type === "RESEARCH") {
    return <ResearchArtifactRenderer artifact={artifact} />;
  }

  if (artifact.type === "CODE") {
    return <CodeArtifactRenderer artifact={artifact} />;
  }

  if (artifact.type === "PREVIEW") {
    return <PreviewArtifactRenderer artifact={artifact} />;
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

function CodeArtifactRenderer({ artifact }: { artifact: RealtimeArtifact }) {
  const content = artifact.latestVersion?.content ?? {};
  const files = getCodeFiles(content.files);
  const activeFile = files[0] ?? null;
  const previewUrl = getContentText(content, "previewUrl");

  return (
    <div className="artifact-code">
      {files.length > 0 ? (
        <div className="code-layout">
          <div className="code-file-list">
            {files.map((file) => (
              <span key={file.path}>{file.path}</span>
            ))}
          </div>
          <pre className="code-block">{activeFile?.content ?? ""}</pre>
        </div>
      ) : (
        <pre className="code-block">{formatArtifactContent(artifact)}</pre>
      )}
      {previewUrl ? (
        <PreviewFrame previewUrl={previewUrl} title={`${artifact.title} preview`} />
      ) : null}
    </div>
  );
}

function PreviewArtifactRenderer({ artifact }: { artifact: RealtimeArtifact }) {
  const content = artifact.latestVersion?.content ?? {};
  const files = getCodeFiles(content.files);
  const activeFile = files[0] ?? null;
  const previewUrl = getContentText(content, "previewUrl");

  return (
    <div className="artifact-prototype">
      <p>{formatArtifactContent(artifact)}</p>
      {previewUrl ? <PreviewFrame previewUrl={previewUrl} title={`${artifact.title} preview`} /> : null}
      {activeFile ? (
        <details className="prototype-source">
          <summary>{activeFile.path}</summary>
          <pre className="code-block">{activeFile.content}</pre>
        </details>
      ) : null}
    </div>
  );
}

function PreviewFrame({ previewUrl, title }: { previewUrl: string; title: string }) {
  return (
    <div className="preview-frame-shell">
      <iframe sandbox="allow-scripts allow-forms allow-popups" src={previewUrl} title={title} />
      <a href={previewUrl} rel="noreferrer" target="_blank">
        Open preview
      </a>
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
      logs: [...item.logs]
    });
  }

  for (const event of [...events].reverse()) {
    if (event.type === "task.created") {
      const existing = itemsByTaskId.get(event.task.id);

      itemsByTaskId.set(event.task.id, {
        task: event.task,
        artifacts: existing?.artifacts ?? [],
        logs: existing?.logs ?? []
      });
    }

    if (event.type === "task.status") {
      const existing = itemsByTaskId.get(event.task.id);

      itemsByTaskId.set(event.task.id, {
        task: event.task,
        artifacts: existing?.artifacts ?? [],
        logs: existing?.logs ?? []
      });
    }

    if (event.type === "task.log") {
      const existing = itemsByTaskId.get(event.taskId);

      if (existing) {
        itemsByTaskId.set(event.taskId, {
          task: existing.task,
          artifacts: existing.artifacts,
          logs: upsertTaskLog(existing.logs, event.log)
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
          logs: existing.logs
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

function formatTaskMeta(item: RoomTaskItem): string {
  const artifact = item.artifacts[0];

  return artifact ? `${item.task.status} / ${formatArtifactType(artifact.type)}` : item.task.status;
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

function getCodeFiles(value: unknown): Array<{ path: string; content: string }> {
  return getRecordArray(value)
    .map((file, index) => ({
      path: getRecordString(file, "path", `file-${index + 1}.txt`),
      content: getRecordString(file, "content", "")
    }))
    .filter((file) => file.content || file.path);
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
