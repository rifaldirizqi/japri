import fs from "node:fs";
import path from "node:path";

export const DATA_DIR = path.resolve(process.env.DATA_DIR ?? "./data");
export const AUTH_DIR = path.join(DATA_DIR, "auth");
export const DB_PATH = path.join(DATA_DIR, "agent.db");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");

export type ProviderId = "anthropic" | "openai" | "gemini" | "openrouter" | "ollama" | "lmstudio" | "custom";

export type LLMConfig = {
  provider: ProviderId;
  model: string;
  apiKey?: string;
  /** Untuk provider OpenAI-compatible */
  baseUrl?: string;
};

export type Config = {
  llm: LLMConfig;
  botName: string;
  timezone: string;
  retentionDays: number;
  /** Diisi setelah owner klaim pakai kode setup */
  owner?: { ids: string[]; name: string | null };
  /** Nama panggilan owner; kalau disebut di grup, owner dapat notif */
  nicknames: string[];
  /** Cek rilis baru di GitHub sekali sehari dan kabarin owner */
  checkUpdates: boolean;
  /** Versi terakhir yang udah dikabarin ke owner (biar gak dikabarin berulang) */
  notifiedVersion?: string;
  /** Digest harian; null/undefined = mati */
  digest?: { time: string } | null;
  /** Jadwal digest terakhir yang udah diurus (dikirim atau dilewati), biar gak dobel */
  digestHandledTs?: number;
  /** Jam tenang ("HH:MM"), boleh lewat tengah malam; null/undefined = mati */
  quietHours?: { start: string; end: string } | null;
};

const DEFAULTS: Omit<Config, "llm"> = {
  botName: "Japri",
  timezone: "Asia/Jakarta",
  retentionDays: 30,
  nicknames: [],
  checkUpdates: true,
};

let current: Config | null = null;

export function configExists() {
  return fs.existsSync(CONFIG_PATH);
}

export function loadConfig(): Config {
  if (!current) {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    current = { ...DEFAULTS, ...raw } as Config;
  }
  return current;
}

export function saveConfig(next: Config) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  // Ada API key di dalamnya: cuma boleh dibaca pemilik file
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), { mode: 0o600 });
  current = next;
}

export function updateConfig(patch: Partial<Config>) {
  saveConfig({ ...loadConfig(), ...patch });
}

export const newConfig = (llm: LLMConfig, extra: Partial<Config> = {}): Config => ({ ...DEFAULTS, ...extra, llm });
