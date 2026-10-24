import { input, password, search, select } from "@inquirer/prompts";
import { configExists, loadConfig, newConfig, saveConfig, type LLMConfig } from "../config.js";
import { PROVIDERS, testToolCalling } from "../llm/index.js";
import { ANTHROPIC_MODELS } from "../llm/anthropic.js";
import { listModels } from "../llm/openai-compatible.js";
import { isValidTimezone } from "../time.js";

const TIMEZONES = [
  { value: "Asia/Jakarta", name: "WIB — Asia/Jakarta" },
  { value: "Asia/Makassar", name: "WITA — Asia/Makassar" },
  { value: "Asia/Jayapura", name: "WIT — Asia/Jayapura" },
  { value: "__other", name: "Lainnya…" },
];

async function chooseModel(llm: Omit<LLMConfig, "model">): Promise<string> {
  if (llm.provider === "anthropic") {
    const choice = await select({
      message: "Pilih model:",
      choices: [...ANTHROPIC_MODELS.map((m) => ({ value: m.id, name: m.label })), { value: "__other", name: "Lainnya (ketik manual)" }],
      default: ANTHROPIC_MODELS[0].id,
    });
    return choice === "__other" ? input({ message: "Nama model:", required: true }) : choice;
  }

  let models: string[] = [];
  try {
    models = await listModels(llm);
  } catch (e) {
    console.log(`  (Gak bisa ambil daftar model: ${e instanceof Error ? e.message : e})`);
  }
  if (models.length === 0) {
    const hint = llm.provider === "ollama" ? " (cek pakai `ollama list`)" : "";
    return input({ message: `Nama model${hint}:`, required: true });
  }
  if (llm.provider === "openrouter") {
    console.log("  Tips: ketik \":free\" buat model gratis. Rekomendasi ada di README bagian \"Rekomendasi model\".");
  }
  return search({
    message: `Pilih model (${models.length} tersedia, ketik buat nyari):`,
    source: (term) =>
      models.filter((m) => !term || m.toLowerCase().includes(term.toLowerCase())).slice(0, 30).map((m) => ({ value: m, name: m })),
  });
}

async function chooseLLM(previous?: LLMConfig): Promise<LLMConfig> {
  for (;;) {
    const provider = await select({
      message: "Mau pakai AI dari mana?",
      choices: PROVIDERS.map((p) => ({ value: p.id, name: p.label })),
      default: previous?.provider,
    });
    const preset = PROVIDERS.find((p) => p.id === provider)!;

    let baseUrl = preset.baseUrl;
    if (provider === "custom" || provider === "ollama" || provider === "lmstudio") {
      baseUrl = await input({ message: "Alamat server (base URL):", default: baseUrl, required: true });
    }

    let apiKey: string | undefined;
    if (preset.needsKey) {
      if (preset.keyHelp) console.log(`  Bikin API key di: ${preset.keyHelp}`);
      apiKey = await password({ message: "Tempel API key:", mask: "•", validate: (v) => v.trim().length > 10 || "API key kependekan" });
      apiKey = apiKey.trim();
    } else if (provider === "custom") {
      apiKey = (await password({ message: "API key (kosongin kalau gak perlu):", mask: "•" })).trim() || undefined;
    }

    for (;;) {
      const model = await chooseModel({ provider, apiKey, baseUrl });
      const llm: LLMConfig = { provider, model, apiKey, baseUrl };
      console.log("  ⏳ Ngetes koneksi & kemampuan tool calling...");
      const test = await testToolCalling(llm);
      if (test.ok) {
        console.log(`  ✅ ${test.detail}\n`);
        return llm;
      }
      console.log(`  ❌ ${test.detail}\n`);
      const next = await select({
        message: "Gimana?",
        choices: [
          { value: "model", name: "Coba model lain" },
          { value: "provider", name: "Ganti provider / API key" },
          { value: "save", name: "Simpan aja (bot mungkin gak jalan bener)" },
        ],
      });
      if (next === "save") return llm;
      if (next === "provider") break;
    }
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
`);

  const llm = await chooseLLM(existing?.llm);
  const botName = await input({ message: "Nama bot:", default: existing?.botName ?? "Japri" });

  let timezone = await select({ message: "Zona waktu:", choices: TIMEZONES, default: existing?.timezone ?? "Asia/Jakarta" });
  if (timezone === "__other") {
    timezone = await input({
      message: "Zona waktu (format IANA, mis. Asia/Singapore):",
      validate: (v) => isValidTimezone(v) || "Zona waktu gak dikenal",
    });
  }

  saveConfig(existing ? { ...existing, llm, botName, timezone } : newConfig(llm, { botName, timezone }));
  console.log("💾 Pengaturan disimpan di folder data/.\n");
}
