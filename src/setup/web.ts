// Wizard setup versi jendela (Windows): halaman wizard.html + API kecil di 127.0.0.1, ditampilin Japri.exe
// di jendela WebView2. Isinya sama kayak wizard terminal, ditambah scan QR WhatsApp & klaim owner.
// Semua request wajib bawa token acak dari URL, biar halaman web lain gak bisa nembak API ini.
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { configExists, loadConfig, newConfig, saveConfig, type LLMConfig } from "../config.js";
import { openInBrowser, sendToSetupWizard, type Status } from "../desktop.js";
import { ANTHROPIC_MODELS } from "../llm/anthropic.js";
import { PROVIDERS, testToolCalling } from "../llm/index.js";
import { listModels } from "../llm/openai-compatible.js";
import { isValidTimezone } from "../time.js";
import { TIMEZONES, asksApiKey, needsBaseUrl } from "./wizard.js";

const PAGE = fs.readFileSync(new URL("./wizard.html", import.meta.url), "utf8");

export interface Pairing {
  bot?: string;
  ownerClaimed: boolean;
  setupCode: string;
}

export interface SetupServerOptions {
  /** Setup udah ada, tinggal sambungin WhatsApp + klaim owner. */
  pairOnly: boolean;
  pairing: () => Pairing;
  onFinish: () => void;
  onCancel: () => void;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      raw += chunk;
      if (raw.length > 64 * 1024) req.destroy(new Error("Request kegedean"));
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Pengaturan AI dari form. API key kosong = pakai key lama, kalau provider-nya sama. */
function toLLM(body: Record<string, unknown>): LLMConfig {
  const preset = PROVIDERS.find((p) => p.id === str(body.provider));
  if (!preset) throw new Error("Provider gak dikenal");
  const provider = preset.id;
  const old = configExists() ? loadConfig().llm : undefined;
  const apiKey = asksApiKey(provider) ? str(body.apiKey) || (old?.provider === provider ? old.apiKey : undefined) : undefined;
  return {
    provider,
    model: str(body.model),
    apiKey,
    baseUrl: needsBaseUrl(provider) ? str(body.baseUrl) || preset.baseUrl : preset.baseUrl,
  };
}

export async function startSetupServer(opts: SetupServerOptions) {
  const token = crypto.randomBytes(16).toString("hex");
  const wa: { status: Status; qr: string | null } = { status: "connecting", qr: null };
  sendToSetupWizard({
    status: (s) => {
      wa.status = s;
      if (s !== "qr") wa.qr = null;
    },
    qr: (dataUrl) => {
      wa.status = "qr";
      wa.qr = dataUrl;
    },
  });

  let markSaved!: () => void;
  const saved = new Promise<void>((r) => (markSaved = r));
  if (opts.pairOnly) markSaved();

  const server = http.createServer(async (req, res) => {
    const send = (code: number, body: unknown, type = "application/json; charset=utf-8") => {
      res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    };
    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    if (req.method === "GET" && url.pathname === "/") {
      if (url.searchParams.get("t") !== token) return send(403, "Forbidden", "text/plain");
      return send(200, PAGE, "text/html; charset=utf-8");
    }
    if (req.headers["x-japri-token"] !== token) return send(403, { error: "Forbidden" });

    try {
      const body = req.method === "POST" ? await readJson(req) : {};
      switch (`${req.method} ${url.pathname}`) {
        case "GET /api/init": {
          const cfg = configExists() ? loadConfig() : undefined;
          return send(200, {
            pairOnly: opts.pairOnly,
            providers: PROVIDERS.map((p) => ({
              id: p.id,
              label: p.label,
              keyHelp: p.keyHelp,
              baseUrl: p.baseUrl,
              needsKey: !!p.needsKey,
              asksApiKey: asksApiKey(p.id),
              needsBaseUrl: needsBaseUrl(p.id),
            })),
            anthropicModels: ANTHROPIC_MODELS,
            timezones: TIMEZONES.filter((t) => t.value !== "__other"),
            // API key gak pernah dikirim balik ke halaman, cuma "ada / gak ada"
            current: cfg
              ? {
                  provider: cfg.llm.provider,
                  model: cfg.llm.model,
                  baseUrl: cfg.llm.baseUrl,
                  hasKey: !!cfg.llm.apiKey,
                  botName: cfg.botName,
                  timezone: cfg.timezone,
                }
              : null,
          });
        }
        case "POST /api/models": {
          const llm = toLLM(body);
          if (llm.provider === "anthropic") return send(200, { models: ANTHROPIC_MODELS.map((m) => m.id) });
          try {
            return send(200, { models: await listModels(llm) });
          } catch (e) {
            return send(200, { models: [], error: errorText(e) });
          }
        }
        case "POST /api/test": {
          const llm = toLLM(body);
          if (!llm.model) return send(400, { error: "Model belum dipilih" });
          return send(200, await testToolCalling(llm));
        }
        case "POST /api/save": {
          const llm = toLLM(body);
          if (!llm.model) return send(400, { error: "Model belum dipilih" });
          const botName = str(body.botName) || "Japri";
          const timezone = str(body.timezone);
          if (!isValidTimezone(timezone)) return send(400, { error: "Zona waktu gak dikenal" });
          const existing = configExists() ? loadConfig() : undefined;
          saveConfig(existing ? { ...existing, llm, botName, timezone } : newConfig(llm, { botName, timezone }));
          markSaved();
          return send(200, { ok: true });
        }
        case "GET /api/wa": {
          const p = opts.pairing();
          return send(200, {
            status: wa.status,
            qr: wa.status === "qr" ? wa.qr : null,
            ...p,
            waLink: p.bot ? `https://wa.me/${p.bot}?text=${p.setupCode}` : null,
          });
        }
        case "POST /api/open": {
          const link = str(body.url);
          if (!/^https:\/\/[^\s"]+$/.test(link)) return send(400, { error: "Link gak valid" });
          openInBrowser(link);
          return send(200, { ok: true });
        }
        case "POST /api/finish":
          send(200, { ok: true });
          return setTimeout(opts.onFinish, 100);
        case "POST /api/cancel":
          send(200, { ok: true });
          return setTimeout(opts.onCancel, 100);
        default:
          return send(404, { error: "Not found" });
      }
    } catch (e) {
      return send(400, { error: errorText(e) });
    }
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/?t=${token}`,
    /** Selesai pas pengaturan AI disimpan (langsung selesai kalau pairOnly). */
    saved,
    close: () => server.close(),
  };
}
