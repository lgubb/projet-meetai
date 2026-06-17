import { z } from "zod";

import type { AgentConnector } from "./jean-task-runner.js";

type PerplexityConnectorOptions = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetchFn?: typeof fetch;
};

const perplexityChatResponseSchema = z
  .object({
    choices: z
      .array(
        z
          .object({
            message: z
              .object({
                content: z.string().min(1)
              })
              .passthrough()
          })
          .passthrough()
      )
      .min(1),
    citations: z.array(z.string().url()).optional(),
    search_results: z
      .array(
        z
          .object({
            title: z.string().min(1).optional(),
            url: z.string().url(),
            snippet: z.string().optional()
          })
          .passthrough()
      )
      .optional()
  })
  .passthrough();

export function createPerplexityConnector(options: PerplexityConnectorOptions = {}): AgentConnector | null {
  const apiKey = options.apiKey ?? process.env.PERPLEXITY_API_KEY;

  if (!apiKey) {
    return null;
  }

  const baseUrl = options.baseUrl ?? process.env.PERPLEXITY_API_BASE_URL ?? "https://api.perplexity.ai";
  const model = options.model ?? process.env.PERPLEXITY_MODEL ?? "sonar-pro";
  const fetchFn = options.fetchFn ?? fetch;

  return {
    id: "perplexity",
    canHandle(input) {
      return input.intent.taskType === "research";
    },
    async *run(input) {
      yield {
        type: "log",
        message: "Recherche Perplexity en cours."
      };

      const report = await runPerplexityResearch({
        apiKey,
        baseUrl,
        fetchFn,
        model,
        query: input.intent.commandText ?? input.intent.description ?? input.task.title
      });

      yield {
        type: "log",
        message: "Synthèse Perplexity reçue."
      };
      yield {
        type: "artifact.patch",
        patch: report
      };
    }
  };
}

async function runPerplexityResearch(input: {
  apiKey: string;
  baseUrl: string;
  fetchFn: typeof fetch;
  model: string;
  query: string;
}): Promise<Record<string, unknown>> {
  const response = await input.fetchFn(`${input.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: input.model,
      messages: [
        {
          role: "system",
          content:
            "Tu es Jean, un assistant de recherche. Réponds en français avec une synthèse structurée et des faits sourcés."
        },
        {
          role: "user",
          content: `Fais une recherche concise sur: ${input.query}`
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Perplexity API rejected research request with ${response.status}.`);
  }

  const payload = perplexityChatResponseSchema.parse(await response.json());
  const text = payload.choices[0]?.message.content.trim() ?? "";
  const sources = normalizeSources(payload);

  if (!text) {
    throw new Error("Perplexity API returned an empty research report.");
  }

  return {
    provider: "perplexity",
    model: input.model,
    summary: summarizeText(text),
    text,
    sources
  };
}

function normalizeSources(payload: z.infer<typeof perplexityChatResponseSchema>): Array<{ title: string; url: string }> {
  if (payload.search_results?.length) {
    return payload.search_results.map((source) => ({
      title: source.title ?? source.url,
      url: source.url
    }));
  }

  return (payload.citations ?? []).map((url) => ({
    title: url,
    url
  }));
}

function summarizeText(text: string): string {
  const firstParagraph = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .find(Boolean);

  if (!firstParagraph) {
    return text;
  }

  return firstParagraph.length > 280 ? `${firstParagraph.slice(0, 277)}...` : firstParagraph;
}
