import OpenAI from "openai";
import { z } from "zod";
import type { LLMConfig } from "../config.js";
import type { LLM, RunOptions, Tool } from "./types.js";

/** Satu adapter untuk OpenAI, Gemini, OpenRouter, Ollama, LM Studio, dan server OpenAI-compatible lain. */
export function createOpenAICompatible(cfg: LLMConfig): LLM {
  const client = new OpenAI({ apiKey: cfg.apiKey || "not-needed", baseURL: cfg.baseUrl });

  return {
    async run({ system, history, tools, maxIterations = 10 }: RunOptions) {
      const byName = new Map(tools.map((t) => [t.name, t]));
      const messages: OpenAI.ChatCompletionMessageParam[] = [
        { role: "system", content: system },
        ...history.map((t): OpenAI.ChatCompletionMessageParam =>
          t.role === "user" && t.images?.length
            ? {
                role: "user",
                content: [
                  ...t.images.map((img) => ({ type: "image_url" as const, image_url: { url: `data:${img.mediaType};base64,${img.data}` } })),
                  { type: "text" as const, text: t.text },
                ],
              }
            : { role: t.role, content: t.text },
        ),
      ];
      const toolDefs = tools.map(toFunctionTool);

      for (let i = 0; i < maxIterations; i++) {
        const res = await client.chat.completions.create({
          model: cfg.model,
          messages,
          ...(toolDefs.length ? { tools: toolDefs } : {}),
        });
        const msg = res.choices[0]?.message;
        if (!msg) return "";
        const calls = (msg.tool_calls ?? []).filter((c) => c.type === "function");
        messages.push({ role: "assistant", content: msg.content ?? "", ...(calls.length ? { tool_calls: calls } : {}) });
        if (calls.length === 0) return (msg.content ?? "").trim();

        // Semua tool call di satu giliran dijalankan, hasilnya dikirim balik bareng
        for (const call of calls) {
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: await runTool(byName.get(call.function.name), call.function.arguments),
          });
        }
      }
      return "Maaf, prosesnya kepanjangan. Coba perintah yang lebih spesifik ya.";
    },
  };
}

function toFunctionTool(t: Tool): OpenAI.ChatCompletionFunctionTool {
  const { $schema: _ignored, ...parameters } = z.toJSONSchema(t.input) as Record<string, unknown>;
  return { type: "function", function: { name: t.name, description: t.description, parameters } };
}

async function runTool(tool: Tool | undefined, rawArgs: string): Promise<string> {
  if (!tool) return "Error: tool tidak dikenal.";
  let args: unknown;
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    return "Error: argumen bukan JSON yang valid.";
  }
  const parsed = tool.input.safeParse(args);
  if (!parsed.success) return `Error: argumen tidak valid — ${parsed.error.message}`;
  try {
    return await tool.run(parsed.data);
  } catch (e) {
    return `Error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/** Daftar model dari endpoint /models (dipakai wizard). */
export async function listModels(cfg: Pick<LLMConfig, "apiKey" | "baseUrl">): Promise<string[]> {
  const client = new OpenAI({ apiKey: cfg.apiKey || "not-needed", baseURL: cfg.baseUrl });
  const ids: string[] = [];
  for await (const m of client.models.list()) ids.push(m.id.replace(/^models\//, ""));
  return ids.sort();
}
