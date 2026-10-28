import { input, password, search, select } from "@inquirer/prompts";
import { configExists, loadConfig, newConfig, saveConfig, type LLMConfig, type MemberReplies } from "../config.js";
import { PROVIDERS, testReply, testToolCalling } from "../llm/index.js";
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

type ModelTest = { run: (llm: LLMConfig) => Promise<{ ok: boolean; detail: string }>; label: string };
const TOOL_TEST: ModelTest = { run: testToolCalling, label: "Ngetes koneksi & kemampuan tool calling..." };
const REPLY_TEST: ModelTest = { run: testReply, label: "Ngetes koneksi..." };

/** fromModel: mulai dari pilih model (balik dari langkah sesudahnya), bukan dari pilih provider. */
async function chooseLLM(previous?: LLMConfig, fromModel = false, test = TOOL_TEST): Promise<LLMConfig> {
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
        console.log(`  ⏳ ${test.label}`);
        const result = await test.run(llm);
        if (result.ok) {
          console.log(`  ✅ ${result.detail}\n`);
          return llm;
        }
        console.log(`  ❌ ${result.detail}\n`);
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

/**
 * Langkah opsional: AI buat anggota grup (v0.4.0). Docker & Node gak punya jendela Pengaturan, jadi
 * penyedia/API key lain buat anggota diatur di sini. Return undefined = gak diubah, null = dihapus.
 */
async function chooseMemberLLM(owner: LLMConfig, current: LLMConfig | null): Promise<LLMConfig | null | undefined | Back> {
  const ownerLabel = PROVIDERS.find((p) => p.id === owner.provider)!.label.replace(/ \(.*\)$/, "");
  console.log(`
  Opsional: AI buat anggota grup. Kalau nanti lo nyalain, anggota grup bisa nanya apa aja ke bot
  (tag bot / bales pesannya / awali dengan /ai). AI ini terpisah dari AI lo dan gak bisa baca catatan grup.
  Nyalainnya lewat chat ke bot, mis. "jawab semua orang di grup kantor".
`);
  for (;;) {
    const choice = await ask((ctx) =>
      select(
        {
          message: "AI buat anggota grup:",
          choices: [
            { value: "skip", name: current ? `Biarin (sekarang: ${current.provider} / ${current.model})` : "Lewati, atur nanti" },
            { value: "same", name: `Pakai ${ownerLabel} juga (API key yang sama), pilih modelnya` },
            { value: "other", name: "Pakai penyedia AI / API key lain" },
            ...(current ? [{ value: "off", name: "Hapus AI buat anggota" }] : []),
            BACK_CHOICE,
          ],
        },
        ctx,
      ),
    );
    if (choice === BACK) return BACK;
    if (choice === "skip") return undefined;
    if (choice === "off") return null;
    // AI anggota yang selama ini numpang key owner gak dijadiin default (biar key owner gak kesimpen dobel)
    if (choice === "other") return chooseLLM(current?.apiKey ? current : undefined, false, REPLY_TEST);

    const model = await chooseModel(owner);
    if (model === BACK) continue;
    console.log(`  ⏳ ${REPLY_TEST.label}`);
    const result = await testReply({ ...owner, model });
    console.log(result.ok ? `  ✅ ${result.detail}\n` : `  ❌ ${result.detail}\n`);
    // API key gak disimpan dobel: kosong = pakai key owner (ikut berubah kalau key owner diganti)
    if (result.ok) return { provider: owner.provider, baseUrl: owner.baseUrl, model };
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
  let members: LLMConfig | null | undefined;
  let back = false; // true = baru balik dari langkah sesudahnya
  for (let step = 0; step < 4; ) {
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
    } else if (step === 2) {
      const tz = await chooseTimezone(timezone);
      if (tz === BACK) {
        step--;
        back = true;
        continue;
      }
      timezone = tz;
      step++;
    } else {
      const chosen = await chooseMemberLLM(llm!, existing?.memberReplies.llm ?? null);
      if (chosen === BACK) {
        step--;
        back = true;
        continue;
      }
      members = chosen;
      step++;
    }
    back = false;
  }

  const base = existing ?? newConfig(llm!);
  const memberReplies: MemberReplies = members === undefined ? base.memberReplies : { ...base.memberReplies, llm: members };
  saveConfig({ ...base, llm: llm!, botName, timezone, memberReplies });
  console.log("💾 Pengaturan disimpan di folder data/.\n");
}
