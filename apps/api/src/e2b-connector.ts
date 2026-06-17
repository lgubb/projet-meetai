import type { AgentConnector, AgentTaskInput, AgentTaskStep } from "./jean-task-runner.js";

type SandboxCommand = {
  kill?: () => Promise<void>;
};

type SandboxInstance = {
  commands: {
    run: (
      command: string,
      options?: {
        background?: boolean;
        onStderr?: (data: string) => void;
        onStdout?: (data: string) => void;
      }
    ) => Promise<SandboxCommand>;
  };
  files: {
    write: (files: Array<{ path: string; data: string }>) => Promise<void>;
  };
  getHost: (port: number) => string;
  getInfo?: () => Promise<{
    sandboxId?: string;
    endAt?: string | Date;
  }>;
  kill: () => Promise<void>;
};

type SandboxConstructor = {
  create: (options?: { timeoutMs?: number }) => Promise<SandboxInstance>;
};

type PrototypeFile = {
  path: string;
  content: string;
};

export type SandboxPrototypeInput = {
  objective: string;
  title: string;
};

export interface SandboxProvider {
  runPrototype(input: SandboxPrototypeInput): AsyncIterable<AgentTaskStep>;
}

type E2BConnectorOptions = {
  provider?: SandboxProvider;
};

const defaultPreviewPort = 3000;
const defaultSandboxTimeoutMs = 10 * 60 * 1000;
const previewWorkdir = "/tmp/workroom-preview";

export function createE2BConnector(options: E2BConnectorOptions = {}): AgentConnector | null {
  const provider = options.provider ?? (process.env.E2B_API_KEY ? createE2BSandboxProvider() : null);

  if (!provider) {
    return null;
  }

  return {
    id: "e2b",
    canHandle(input) {
      return input.intent.taskType === "prototype";
    },
    async *run(input) {
      yield {
        type: "log",
        message: "Préparation de la preview E2B."
      };

      yield* provider.runPrototype({
        objective: getPrototypeObjective(input),
        title: input.task.title
      });
    }
  };
}

function createE2BSandboxProvider(): SandboxProvider {
  return {
    async *runPrototype(input) {
      const files = buildPrototypeFiles(input);
      let sandbox: SandboxInstance | null = null;

      try {
        yield {
          type: "log",
          message: "Création du sandbox E2B."
        };

        const Sandbox = await loadSandboxConstructor();

        sandbox = await Sandbox.create({
          timeoutMs: defaultSandboxTimeoutMs
        });

        const info = await readSandboxInfo(sandbox);

        if (info.sandboxId) {
          yield {
            type: "log",
            message: `Sandbox E2B prêt: ${info.sandboxId}.`
          };
        }

        await sandbox.commands.run(`mkdir -p ${previewWorkdir}`);
        await sandbox.files.write(
          files.map((file) => ({
            path: `${previewWorkdir}/${file.path}`,
            data: file.content
          }))
        );

        yield {
          type: "log",
          message: "Fichier prototype écrit dans le sandbox."
        };
        yield {
          type: "artifact.patch",
          patch: {
            provider: "e2b",
            sandboxId: info.sandboxId,
            sandboxExpiresAt: info.expiresAt,
            previewPort: defaultPreviewPort,
            text: `Preview E2B générée pour: ${input.objective}.`,
            files
          }
        };

        const output = createCommandOutputCollector();

        await sandbox.commands.run(`python3 -m http.server ${defaultPreviewPort} --directory ${previewWorkdir}`, {
          background: true,
          onStderr: output.onStderr,
          onStdout: output.onStdout
        });

        for (const message of output.flush()) {
          yield {
            type: "log",
            message
          };
        }

        const previewUrl = `https://${sandbox.getHost(defaultPreviewPort)}`;

        yield {
          type: "log",
          message: "Serveur de preview E2B lancé."
        };
        yield {
          type: "artifact.preview_url",
          previewUrl
        };
      } catch (error) {
        if (sandbox) {
          await sandbox.kill().catch(() => undefined);
        }

        throw error;
      }
    }
  };
}

async function loadSandboxConstructor(): Promise<SandboxConstructor> {
  const packageName = "e2b";
  const module = (await import(packageName)) as { Sandbox?: SandboxConstructor };

  if (!module.Sandbox) {
    throw new Error("E2B SDK did not expose Sandbox.");
  }

  return module.Sandbox;
}

async function readSandboxInfo(sandbox: SandboxInstance): Promise<{ sandboxId?: string; expiresAt?: string }> {
  if (!sandbox.getInfo) {
    return {};
  }

  const info = await sandbox.getInfo();
  const expiresAt = info.endAt instanceof Date ? info.endAt.toISOString() : info.endAt;

  return {
    sandboxId: info.sandboxId,
    expiresAt
  };
}

function createCommandOutputCollector(): {
  flush: () => string[];
  onStderr: (data: string) => void;
  onStdout: (data: string) => void;
} {
  const messages: string[] = [];
  const collect = (prefix: string, data: string) => {
    for (const line of data.split(/\r?\n/)) {
      const trimmed = line.trim();

      if (trimmed) {
        messages.push(`${prefix}: ${trimmed}`);
      }
    }
  };

  return {
    flush() {
      return messages.splice(0);
    },
    onStderr(data) {
      collect("stderr", data);
    },
    onStdout(data) {
      collect("stdout", data);
    }
  };
}

function buildPrototypeFiles(input: SandboxPrototypeInput): PrototypeFile[] {
  return [
    {
      path: "index.html",
      content: buildPrototypeHtml(input)
    }
  ];
}

function buildPrototypeHtml(input: SandboxPrototypeInput): string {
  const title = input.title || "Prototype";
  const objective = input.objective || "Prototype";

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color: #1b2430;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      body {
        background: #f5f7fb;
        margin: 0;
      }

      .shell {
        display: grid;
        gap: 20px;
        margin: 0 auto;
        max-width: 980px;
        padding: 40px 24px;
      }

      .hero,
      .panel {
        background: #ffffff;
        border: 1px solid #dce4ea;
        border-radius: 8px;
        box-shadow: 0 18px 42px rgba(27, 36, 48, 0.08);
      }

      .hero {
        display: grid;
        gap: 18px;
        padding: 28px;
      }

      h1,
      h2,
      p {
        margin: 0;
      }

      h1 {
        font-size: clamp(2rem, 6vw, 4.4rem);
        line-height: 0.98;
      }

      p {
        color: #55616f;
        font-size: 1rem;
        line-height: 1.6;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      button {
        background: #1f7a5a;
        border: 0;
        border-radius: 8px;
        color: #ffffff;
        cursor: pointer;
        font: inherit;
        font-weight: 800;
        min-height: 42px;
        padding: 0 16px;
      }

      button.secondary {
        background: #1b2430;
      }

      .grid {
        display: grid;
        gap: 14px;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      }

      .panel {
        display: grid;
        gap: 8px;
        padding: 18px;
      }

      .panel strong {
        font-size: 1.6rem;
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script>
      const objective = ${scriptString(objective)};
      const title = ${scriptString(title)};
      const cards = [
        ["01", "Intent", "Clarifier le besoin avant de produire."],
        ["02", "Prototype", "Afficher une premiere version exploitable."],
        ["03", "Next", "Iterer a partir des retours dans la room."]
      ];

      function App() {
        return React.createElement(
          "main",
          { className: "shell" },
          React.createElement(
            "section",
            { className: "hero" },
            React.createElement("p", null, "Preview E2B"),
            React.createElement("h1", null, title),
            React.createElement("p", null, objective),
            React.createElement(
              "div",
              { className: "actions" },
              React.createElement("button", null, "Primary action"),
              React.createElement("button", { className: "secondary" }, "Secondary action")
            )
          ),
          React.createElement(
            "section",
            { className: "grid" },
            cards.map(([number, label, text]) =>
              React.createElement(
                "article",
                { className: "panel", key: number },
                React.createElement("strong", null, number),
                React.createElement("h2", null, label),
                React.createElement("p", null, text)
              )
            )
          )
        );
      }

      ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));
    </script>
  </body>
</html>`;
}

function getPrototypeObjective(input: AgentTaskInput): string {
  return input.intent.description ?? input.intent.commandText ?? input.task.description ?? input.task.title;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function scriptString(value: string): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
