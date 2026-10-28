// Jendela Pengaturan (Windows): halaman settings.html yang disajiin proses bot yang lagi jalan, jadi
// perubahan langsung kepakai tanpa restart. Ditampilin Japri.exe di jendela WebView2.
import fs from "node:fs";
import { loadConfig, updateConfig, type Config } from "../config.js";
import * as store from "../db.js";
import { DAY_NAMES } from "../digest.js";
import { ANTHROPIC_MODELS } from "../llm/anthropic.js";
import * as settings from "../settings.js";
import { currentVersion } from "../updater.js";
import { providerList, startLocalServer, str, toLLM, type Body } from "./local-server.js";
import { TIMEZONES } from "./wizard.js";

const PAGE = fs.readFileSync(new URL("./settings.html", import.meta.url), "utf8");
const NOTIFY_MODES: store.NotifyMode[] = ["all", "mentions", "off"];

export interface SettingsServerOptions {
  /** Nomor bot (kosong kalau WhatsApp belum nyambung). */
  botNumber: () => string;
  /** User minta setup ulang (sambungin ulang WhatsApp dari awal). */
  onResetup: () => void;
}

function state(opts: SettingsServerOptions) {
  const c = loadConfig();
  return {
    version: currentVersion,
    bot: opts.botNumber() || null,
    providers: providerList(),
    anthropicModels: ANTHROPIC_MODELS,
    timezones: TIMEZONES.filter((t) => t.value !== "__other"),
    days: DAY_NAMES,
    config: {
      // API key gak pernah dikirim ke halaman, cuma "ada / gak ada"
      llm: { provider: c.llm.provider, model: c.llm.model, baseUrl: c.llm.baseUrl, hasKey: !!c.llm.apiKey },
      botName: c.botName,
      nicknames: c.nicknames,
      timezone: c.timezone,
      retentionDays: c.retentionDays,
      quietHours: c.quietHours ?? null,
      digest: c.digest ?? null,
      weeklyDigest: c.weeklyDigest ?? null,
      taskOffers: c.taskOffers,
      readImages: c.readImages,
      checkUpdates: c.checkUpdates,
    },
    groups: store.listGroups().map((g) => ({ jid: g.jid, name: g.name, notify: g.notify_mode, readImages: g.read_images })),
  };
}

const isObj = (v: unknown): v is Body => typeof v === "object" && v !== null;

/** Simpan beberapa pengaturan sekaligus. Return pesan penolakan pertama (sisanya gak diproses). */
function applySettings(body: Body): string | null {
  const has = (k: keyof Config) => Object.prototype.hasOwnProperty.call(body, k);
  const steps: (() => string | null)[] = [];
  if (has("botName")) steps.push(() => settings.setBotName(str(body.botName)));
  if (has("nicknames")) {
    const raw = body.nicknames;
    const list = Array.isArray(raw) ? raw.map(String) : str(raw).split(",");
    steps.push(() => settings.setNicknames(list));
  }
  if (has("timezone")) steps.push(() => settings.setTimezone(str(body.timezone)));
  if (has("retentionDays")) steps.push(() => settings.setRetentionDays(Number(body.retentionDays)));
  if (has("quietHours")) {
    const q = body.quietHours;
    steps.push(() => (isObj(q) ? settings.setQuietHours(str(q.start), str(q.end)) : settings.setQuietHours(null, null)));
  }
  if (has("digest")) {
    const d = body.digest;
    steps.push(() => (isObj(d) ? settings.setDigest(str(d.time), d.weekdaysOnly === true) : settings.setDigest(null, false)));
  }
  if (has("weeklyDigest")) {
    const w = body.weeklyDigest;
    steps.push(() => (isObj(w) ? settings.setWeeklyDigest(Number(w.day), str(w.time)) : settings.setWeeklyDigest(null, "")));
  }
  for (const k of ["taskOffers", "checkUpdates"] as const) {
    if (!has(k)) continue;
    steps.push(() => {
      if (typeof body[k] !== "boolean") return "Nilai gak valid.";
      updateConfig({ [k]: body[k] });
      return null;
    });
  }
  for (const step of steps) {
    const rejected = step();
    if (rejected) return rejected;
  }
  return null;
}

export async function startSettingsServer(opts: SettingsServerOptions) {
  return startLocalServer(PAGE, async (route, body) => {
    switch (route) {
      case "GET /api/state":
        return { body: state(opts) };
      case "POST /api/settings": {
        const rejected = applySettings(body);
        return rejected ? { status: 400, body: { error: rejected } } : { body: state(opts) };
      }
      case "POST /api/ai": {
        const rejected = await settings.setLLM(toLLM(body), body.skipTest === true);
        return rejected ? { status: 400, body: { error: rejected } } : { body: state(opts) };
      }
      case "POST /api/images": {
        const rejected = await settings.setImageReading(body.enabled === true);
        return rejected ? { status: 400, body: { error: rejected } } : { body: state(opts) };
      }
      case "POST /api/group": {
        const g = store.listGroups().find((x) => x.jid === str(body.jid));
        if (!g) return { status: 400, body: { error: "Grup gak ketemu." } };
        if (body.notify !== undefined) {
          if (!NOTIFY_MODES.includes(body.notify as store.NotifyMode)) return { status: 400, body: { error: "Mode notif gak valid." } };
          store.setNotifyMode(g.jid, body.notify as store.NotifyMode);
        }
        if (body.readImages !== undefined) {
          if (body.readImages === null) store.setReadImages(g.jid, null);
          else {
            const rejected = await settings.setImageReading(body.readImages === true, g.jid);
            if (rejected) return { status: 400, body: { error: rejected } };
          }
        }
        return { body: state(opts) };
      }
      case "POST /api/resetup":
        return { body: { ok: true }, after: opts.onResetup };
    }
    return undefined;
  });
}
