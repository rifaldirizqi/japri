import { z } from "zod";
import type { LLMConfig, ProviderId } from "../config.js";
import { createAnthropic } from "./anthropic.js";
import { createOpenAICompatible } from "./openai-compatible.js";
import { defineTool, type LLM } from "./types.js";

export * from "./types.js";

// Kalau jalan di Docker, "localhost" adalah container-nya sendiri, bukan PC owner
const LOCAL_HOST = process.env.RUNNING_IN_DOCKER ? "host.docker.internal" : "localhost";

export type ProviderPreset = {
  id: ProviderId;
  label: string;
  baseUrl?: string;
  needsKey: boolean;
  keyHelp?: string;
};

export const PROVIDERS: ProviderPreset[] = [
  { id: "anthropic", label: "Anthropic (Claude)", needsKey: true, keyHelp: "https://platform.claude.com/settings/keys" },
  { id: "openai", label: "OpenAI", needsKey: true, keyHelp: "https://platform.openai.com/api-keys" },
  {
    id: "gemini",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    needsKey: true,
    keyHelp: "https://aistudio.google.com/apikey",
  },
  {
    id: "openrouter",
    label: "OpenRouter (ratusan model, satu API key)",
    baseUrl: "https://openrouter.ai/api/v1",
    needsKey: true,
    keyHelp: "https://openrouter.ai/keys",
  },
  { id: "ollama", label: "Ollama (model lokal)", baseUrl: `http://${LOCAL_HOST}:11434/v1`, needsKey: false },
  { id: "lmstudio", label: "LM Studio (model lokal)", baseUrl: `http://${LOCAL_HOST}:1234/v1`, needsKey: false },
  { id: "custom", label: "Server OpenAI-compatible lain", needsKey: false },
];

export function createLLM(cfg: LLMConfig): LLM {
  return cfg.provider === "anthropic" ? createAnthropic(cfg) : createOpenAICompatible(cfg);
}

/** Cek model bisa dihubungi DAN bisa tool calling (syarat minimal bot ini). */
export async function testToolCalling(cfg: LLMConfig): Promise<{ ok: boolean; detail: string }> {
  let called = false;
  const secret = "semangka-" + Math.floor(Math.random() * 1000);
  const tool = defineTool({
    name: "get_secret_word",
    description: "Mengembalikan kata rahasia.",
    input: z.object({}),
    run: async () => {
      called = true;
      return secret;
    },
  });
  try {
    const reply = await createLLM(cfg).run({
      system: "Panggil tool get_secret_word, lalu balas HANYA dengan kata rahasia yang dikembalikan.",
      history: [{ role: "user", text: "Apa kata rahasianya?" }],
      tools: [tool],
      maxIterations: 3,
    });
    if (!called) return { ok: false, detail: `Model bisa dihubungi tapi gak manggil tool. Jawabannya: "${reply.slice(0, 120)}"` };
    if (!reply.includes(secret)) return { ok: false, detail: `Tool dipanggil tapi jawabannya gak sesuai: "${reply.slice(0, 120)}"` };
    return { ok: true, detail: "Koneksi & tool calling oke" };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}
