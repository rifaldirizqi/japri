import { input, password, search, select } from "@inquirer/prompts";
import { configExists, loadConfig, newConfig, saveConfig, type LLMConfig } from "../config.js";
import { PROVIDERS, testToolCalling } from "../llm/index.js";
import { ANTHROPIC_MODELS } from "../llm/anthropic.js";
import { listModels } from "../llm/openai-compatible.js";
import { isValidTimezone } from "../time.js";

export const TIMEZONES = [
  { value: "Asia/Jakarta", name: "WIB — Asia/Jakarta" },
  { value: "Asia/Makassar", name: "WITA — Asia/Makassar" },
  { value: "Asia/Jayapura", name: "WIT — Asia/Jayapura" },
  { value: "__other", name: "Lainnya…" },
];

const BACK = Symbol("back");
type Back = typeof BACK;
const BACK_CHOICE = { value: "__back", name: "← Kembali" };

/** Satu pertanyaan. Esc (atau pilih "← Kembali") = balik ke langkah sebelumnya, hasilnya BACK. */
async function ask<T>(prompt: (ctx: { signal: AbortSignal }) => Promise<T>): Promise<T | Back> {
  const ac = new AbortController();
  const onKey = (_: unknown, key?: { name?: string }) => {
    if (key?.name === "escape") ac.abort();
  };
  process.stdin.on("keypress", onKey);
  try {
    const answer = await prompt({ signal: ac.signal });
    return (answer as unknown) === BACK_CHOICE.value ? BACK : answer;
  } catch (e) {
    if (ac.signal.aborted) return BACK;
    throw e;
  } finally {
    process.stdin.off("keypress", onKey);
  }
}

async function chooseModel(llm: Omit<LLMConfig, "model">): Promise<string | Back> {
  if (llm.provider === "anthropic") {
    for (;;) {
      const choice = await ask((ctx) =>
        select(
          {
            message: "Pilih model:",
            choices: [
              ...ANTHROPIC_MODELS.map((m) => ({ value: m.id, name: m.label })),
              { value: "__other", name: "Lainnya (ketik manual)" },
              BACK_CHOICE,
            ],
            default: ANTHROPIC_MODELS[0].id,
          },
          ctx,
        ),
      );
      if (choice !== "__other") return choice;
      const typed = await ask((ctx) => input({ message: "Nama model:", required: true }, ctx));
      if (typed !== BACK) return typed;
    }
  }

  let models: string[] = [];
  try {
    models = await listModels(llm);
  } catch (e) {
    console.log(`  (Gak bisa ambil daftar model: ${e instanceof Error ? e.message : e})`);
  }
  if (models.length === 0) {
    const hint = llm.provider === "ollama" ? " (cek pakai `ollama list`)" : "";
    return ask((ctx) => input({ message: `Nama model${hint}:`, required: true }, ctx));
  }
  if (llm.provider === "openrouter") {
    console.log("  Tips: ketik \":free\" buat model gratis. Rekomendasi ada di README bagian \"Rekomendasi model\".");
  }
  return ask((ctx) =>
    search(
      {
        message: `Pilih model (${models.length} tersedia, ketik buat nyari, Esc buat balik):`,
        source: (term) =>
          models.filter((m) => !term || m.toLowerCase().includes(term.toLowerCase())).slice(0, 30).map((m) => ({ value: m, name: m })),
      },
      ctx,
    ),
  );
}

/** Provider yang alamat servernya ditanyain ke user. */
export const needsBaseUrl = (provider: string) => provider === "custom" || provider === "ollama" || provider === "lmstudio";

/** Provider yang API key-nya ditanyain (custom: boleh kosong). */
export const asksApiKey = (provider: string) => provider === "custom" || !!PROVIDERS.find((p) => p.id === provider)?.needsKey;

type LLMStep = "provider" | "baseUrl" | "apiKey" | "model";

function llmSteps(provider: string): LLMStep[] {
  const steps: LLMStep[] = ["provider"];
  if (needsBaseUrl(provider)) steps.push("baseUrl");
  if (asksApiKey(provider)) steps.push("apiKey");
  steps.push("model");
  return steps;
}

/** fromModel: mulai dari pilih model (balik dari langkah sesudahnya), bukan dari pilih provider. */
async function chooseLLM(previous?: LLMConfig, fromModel = false): Promise<LLMConfig> {
  let provider = previous?.provider ?? PROVIDERS[0].id;
  let baseUrl = previous?.baseUrl;
  let apiKey = previous?.apiKey;
  let step = fromModel && previous ? llmSteps(provider).length - 1 : 0;

  for (;;) {
    const preset = PROVIDERS.find((p) => p.id === provider)!;
    switch (llmSteps(provider)[step]) {
      case "provider": {
        const chosen = await ask((ctx) =>
          select({ message: "Mau pakai AI dari mana?", choices: PROVIDERS.map((p) => ({ value: p.id, name: p.label })), default: provider }, ctx),
        );
        if (chosen === BACK) continue; // langkah pertama, gak ada yang sebelumnya
        if (chosen !== provider) {
          // Ganti provider: alamat & key lama cuma dipakai lagi kalau provider-nya sama kayak config lama
          provider = chosen;
          const old = previous?.provider === chosen ? previous : undefined;
          baseUrl = old?.baseUrl ?? PROVIDERS.find((p) => p.id === chosen)!.baseUrl;
          apiKey = old?.apiKey;
        }
        step++;
        break;
      }
      case "baseUrl": {
        const url = await ask((ctx) => input({ message: "Alamat server (base URL):", default: baseUrl, required: true }, ctx));
        if (url === BACK) {
          step--;
          continue;
        }
        baseUrl = url;
        step++;
        break;
      }
      case "apiKey": {
        if (preset.keyHelp) console.log(`  Bikin API key di: ${preset.keyHelp}`);
        const keep = apiKey ? " (Enter = pakai yang lama)" : "";
        const key = await ask((ctx) =>
          password(
            {
              message: preset.needsKey ? `Tempel API key${keep}:` : `API key (kosongin kalau gak perlu)${keep}:`,
              mask: "•",
              validate: (v) => !preset.needsKey || (!!apiKey && !v.trim()) || v.trim().length > 10 || "API key kependekan",
            },
            ctx,
          ),
        );
        if (key === BACK) {
          step--;
          continue;
        }
        apiKey = key.trim() || apiKey;
        step++;
        break;
      }
      case "model": {
        const model = await chooseModel({ provider, apiKey, baseUrl });
        if (model === BACK) {
          step--;
          continue;
        }
        const llm: LLMConfig = { provider, model, apiKey, baseUrl };
        console.log("  ⏳ Ngetes koneksi & kemampuan tool calling...");
        const test = await testToolCalling(llm);
        if (test.ok) {
          console.log(`  ✅ ${test.detail}\n`);
          return llm;
        }
        console.log(`  ❌ ${test.detail}\n`);
        const next = await ask((ctx) =>
          select(
            {
              message: "Gimana?",
              choices: [
                { value: "model", name: "Coba model lain" },
                { value: "provider", name: "Ganti provider / API key" },
                { value: "save", name: "Simpan aja (bot mungkin gak jalan bener)" },
              ],
            },
            ctx,
          ),
        );
        if (next === "save") return llm;
        if (next === "provider") step = 0;
        // "Coba model lain" atau Esc: pilih model lagi
        break;
      }
    }
  }
}

async function chooseTimezone(current: string): Promise<string | Back> {
  const known = TIMEZONES.some((t) => t.value === current);
  for (;;) {
    const choice = await ask((ctx) =>
      select({ message: "Zona waktu:", choices: [...TIMEZONES, BACK_CHOICE], default: known ? current : "__other" }, ctx),
    );
    if (choice !== "__other") return choice;
    const typed = await ask((ctx) =>
      input(
        {
          message: "Zona waktu (format IANA, mis. Asia/Singapore):",
          default: known ? undefined : current,
          validate: (v) => isValidTimezone(v) || "Zona waktu gak dikenal",
        },
        ctx,
      ),
    );
    if (typed !== BACK) return typed;
  }
}

/** Wizard interaktif di terminal. Return setelah config tersimpan. */
export async function runWizard() {
  const existing = configExists() ? loadConfig() : undefined;
  console.log(`
╭──────────────────────────────────────────╮
│   🤖  Japri — setup                       │
╰──────────────────────────────────────────╯
${existing ? "Config lama ketemu, nilai lama jadi default.\n" : ""}Butuh: API key dari salah satu provider AI (atau model lokal),
dan HP dengan nomor WhatsApp KHUSUS buat bot (bukan nomor pribadi lo).
Salah pilih? Tekan Esc buat balik ke langkah sebelumnya.
`);

  let llm = existing?.llm;
  let botName = existing?.botName ?? "Japri";
  let timezone = existing?.timezone ?? "Asia/Jakarta";
  let back = false; // true = baru balik dari langkah sesudahnya
  for (let step = 0; step < 3; ) {
    if (step === 0) {
      llm = await chooseLLM(llm, back);
      step++;
    } else if (step === 1) {
      const name = await ask((ctx) => input({ message: "Nama bot:", default: botName }, ctx));
      if (name === BACK) {
        step--;
        back = true;
        continue;
      }
      botName = name;
      step++;
    } else {
      const tz = await chooseTimezone(timezone);
      if (tz === BACK) {
        step--;
        back = true;
        continue;
      }
      timezone = tz;
      step++;
    }
    back = false;
  }

  saveConfig(existing ? { ...existing, llm: llm!, botName, timezone } : newConfig(llm!, { botName, timezone }));
  console.log("💾 Pengaturan disimpan di folder data/.\n");
}
