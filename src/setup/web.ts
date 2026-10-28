// Wizard setup versi jendela (Windows): halaman wizard.html, ditampilin Japri.exe di jendela WebView2.
// Isinya sama kayak wizard terminal, ditambah scan QR WhatsApp & klaim owner.
import fs from "node:fs";
import { configExists, loadConfig, newConfig, saveConfig } from "../config.js";
import { sendToSetupWizard, type Status } from "../desktop.js";
import { ANTHROPIC_MODELS } from "../llm/anthropic.js";
import { isValidTimezone } from "../time.js";
import { providerList, startLocalServer, str, toLLM } from "./local-server.js";
import { TIMEZONES } from "./wizard.js";

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

export async function startSetupServer(opts: SetupServerOptions) {
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

  const server = await startLocalServer(PAGE, (route, body) => {
    switch (route) {
      case "GET /api/init": {
        const cfg = configExists() ? loadConfig() : undefined;
        return {
          body: {
            pairOnly: opts.pairOnly,
            providers: providerList(),
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
          },
        };
      }
      case "POST /api/save": {
        const llm = toLLM(body);
        if (!llm.model) return { status: 400, body: { error: "Model belum dipilih" } };
        const botName = str(body.botName) || "Japri";
        const timezone = str(body.timezone);
        if (!isValidTimezone(timezone)) return { status: 400, body: { error: "Zona waktu gak dikenal" } };
        const existing = configExists() ? loadConfig() : undefined;
        saveConfig(existing ? { ...existing, llm, botName, timezone } : newConfig(llm, { botName, timezone }));
        markSaved();
        return { body: { ok: true } };
      }
      case "GET /api/wa": {
        const p = opts.pairing();
        return {
          body: {
            status: wa.status,
            qr: wa.status === "qr" ? wa.qr : null,
            ...p,
            waLink: p.bot ? `https://wa.me/${p.bot}?text=${p.setupCode}` : null,
          },
        };
      }
      case "POST /api/finish":
        return { body: { ok: true }, after: opts.onFinish };
      case "POST /api/cancel":
        return { body: { ok: true }, after: opts.onCancel };
    }
    return undefined;
  });

  return {
    url: server.url,
    /** Selesai pas pengaturan AI disimpan (langsung selesai kalau pairOnly). */
    saved,
    close: server.close,
  };
}
