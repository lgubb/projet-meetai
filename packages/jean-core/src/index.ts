import type { ArtifactType, HealthStatus } from "@jean/shared";

export type JeanCoreHealthStatus = HealthStatus;

export const jeanCorePackageName = "jean-core";

export const agentTaskTypes = ["research", "doc", "code", "prototype", "diagram", "workflow"] as const;
export type AgentTaskType = (typeof agentTaskTypes)[number];

export type JeanCommandDetection = {
  isAddressedToJean: boolean;
  commandText: string | null;
};

export type AgentIntent = {
  shouldAct: boolean;
  confidence: number;
  taskType: AgentTaskType | null;
  artifactType: ArtifactType | null;
  title: string | null;
  description: string | null;
  responseText: string | null;
  commandText: string | null;
  language: "fr" | "en" | "unknown";
};

const jeanAddressPattern = /^(?:(?:hey|hi|hello|bonjour|salut|ok|okay)\s+)?jean(?:[\s,;:!-]+)(.+)$/i;

export function detectJeanCommand(text: string): JeanCommandDetection {
  const match = text.trim().match(jeanAddressPattern);

  if (!match?.[1]?.trim()) {
    return {
      isAddressedToJean: false,
      commandText: null
    };
  }

  return {
    isAddressedToJean: true,
    commandText: match[1].trim()
  };
}

export function parseJeanIntent(text: string): AgentIntent {
  const detection = detectJeanCommand(text);

  if (!detection.isAddressedToJean || !detection.commandText) {
    return noActionIntent(null, null, "unknown", 0);
  }

  return parseIntentCommand(detection.commandText);
}

export function parseIntentCommand(commandText: string): AgentIntent {
  const normalized = normalize(commandText);
  const language = detectLanguage(normalized);
  const taskType = detectTaskType(normalized);

  if (!taskType) {
    return noActionIntent(commandText, null, language, 0.2);
  }

  const title = buildTitle(taskType, commandText, normalized);

  return {
    shouldAct: true,
    confidence: 0.9,
    taskType,
    artifactType: artifactTypeForTask(taskType),
    title,
    description: commandText,
    responseText: buildResponseText(taskType, title, language, normalized),
    commandText,
    language
  };
}

function noActionIntent(
  commandText: string | null,
  taskType: AgentTaskType | null,
  language: AgentIntent["language"],
  confidence: number
): AgentIntent {
  return {
    shouldAct: false,
    confidence,
    taskType,
    artifactType: taskType ? artifactTypeForTask(taskType) : null,
    title: null,
    description: null,
    responseText: null,
    commandText,
    language
  };
}

function detectTaskType(normalized: string): AgentTaskType | null {
  if (containsAny(normalized, ["recherche", "chercher", "research", "search"])) {
    return "research";
  }

  if (containsAny(normalized, ["prototype", "preview", "maquette", "demo", "proof of concept", "poc"])) {
    return "prototype";
  }

  if (containsAny(normalized, ["diagramme", "diagram", "schema", "flowchart"])) {
    return "diagram";
  }

  if (containsAny(normalized, ["workflow", "process", "automatisation", "automation"])) {
    return "workflow";
  }

  if (containsAny(normalized, ["code", "coder", "implemente", "implement", "build", "developpe", "develop"])) {
    return "code";
  }

  if (containsAny(normalized, ["spec", "document", "doc", "brief", "prd", "redige", "write", "draft", "cree"])) {
    return "doc";
  }

  return null;
}

function artifactTypeForTask(taskType: AgentTaskType): ArtifactType {
  const artifactTypes: Record<AgentTaskType, ArtifactType> = {
    code: "CODE",
    diagram: "DIAGRAM",
    doc: "DOCUMENT",
    prototype: "PREVIEW",
    research: "RESEARCH",
    workflow: "DIAGRAM"
  };

  return artifactTypes[taskType];
}

function buildTitle(taskType: AgentTaskType, commandText: string, normalized: string): string {
  if (taskType === "doc" && normalized.includes("spec")) {
    return "Spec";
  }

  if (taskType === "research") {
    const topic = extractTopic(commandText);

    return topic ? `Research: ${topic}` : "Research";
  }

  const titles: Record<AgentTaskType, string> = {
    code: "Code task",
    diagram: "Diagram",
    doc: "Document",
    prototype: "Prototype",
    research: "Research",
    workflow: "Workflow"
  };

  return titles[taskType];
}

function buildResponseText(
  taskType: AgentTaskType,
  title: string,
  language: AgentIntent["language"],
  normalized: string
): string {
  if (language === "fr") {
    if (taskType === "doc" && normalized.includes("spec")) {
      return "Oui, je crée une spec.";
    }

    return `Oui, je crée ${title.toLowerCase()}.`;
  }

  if (taskType === "doc" && normalized.includes("spec")) {
    return "Yes, I will create a spec.";
  }

  return `Yes, I will create ${title.toLowerCase()}.`;
}

function extractTopic(commandText: string): string | null {
  const match = commandText.match(/\b(?:sur|about|on)\s+(.+)$/i);
  const topic = match?.[1]?.trim().replace(/[.!?]$/, "");

  return topic || null;
}

function detectLanguage(normalized: string): AgentIntent["language"] {
  if (containsAny(normalized, ["cree", "creer", "fais", "faire", "recherche", "redige", "sur"])) {
    return "fr";
  }

  if (containsAny(normalized, ["create", "make", "research", "write", "about", "on"])) {
    return "en";
  }

  return "unknown";
}

function containsAny(value: string, candidates: string[]): boolean {
  return candidates.some((candidate) => value.includes(candidate));
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
