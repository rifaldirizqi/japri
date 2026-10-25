import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { LLMConfig } from "../config.js";
import type { LLM, RunOptions } from "./types.js";

// Model yang mendukung server-side fallback mode "default"
const FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);
// Model generasi 5 menerima output_config.effort
const supportsEffort = (model: string) => /^claude-(opus|sonnet|haiku|fable)-5/.test(model);

export function createAnthropic(cfg: LLMConfig): LLM {
  const client = new Anthropic({ apiKey: cfg.apiKey });

  return {
    async run({ system, history, tools, maxIterations = 10 }: RunOptions) {
      const useFallback = FALLBACK_MODELS.has(cfg.model);
      const params = {
        model: cfg.model,
        max_tokens: 16000,
        ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        ...(supportsEffort(cfg.model) ? { output_config: { effort: "medium" as const } } : {}),
        cache_control: { type: "ephemeral" as const },
        system,
        messages: history.map((t) => ({
          role: t.role,
          content: t.images?.length
            ? [
                ...t.images.map((img) => ({
                  type: "image" as const,
                  source: { type: "base64" as const, media_type: img.mediaType as "image/jpeg", data: img.data },
                })),
                { type: "text" as const, text: t.text },
              ]
            : t.text,
        })),
      };
      const final =
        tools.length === 0
          ? await client.beta.messages.create(params)
          : await client.beta.messages.toolRunner({
              ...params,
              tools: tools.map((t) => betaZodTool({ name: t.name, description: t.description, inputSchema: t.input, run: t.run })),
              max_iterations: maxIterations,
            });

      if (final.stop_reason === "refusal") return "Maaf, permintaan ini gak bisa gue proses.";
      return final.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
    },
  };
}

export const ANTHROPIC_MODELS = [
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 — disarankan: murah & cukup buat Japri ($0.10/$0.50 per 1 juta token)" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 — lebih pinter ($2/$10)" },
  { id: "claude-opus-5-5", label: "Claude Opus 5.5 — paling pinter ($4/$20)" },
];
