// Jendela Pengaturan (Windows): halaman settings.html yang disajiin proses bot yang lagi jalan, jadi
// perubahan langsung kepakai tanpa restart. Ditampilin Japri.exe di jendela WebView2.
import fs from "node:fs";
import { wantsMemberReplies } from "../agent/member.js";
import { loadConfig, updateConfig, type Config, type LLMConfig } from "../config.js";
import * as store from "../db.js";
import { DAY_NAMES } from "../digest.js";
import { ANTHROPIC_MODELS } from "../llm/anthropic.js";
import * as settings from "../settings.js";
import { localDate, nowTs } from "../time.js";
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

// API key gak pernah dikirim ke halaman, cuma "ada / gak ada"
const publicLLM = (llm: LLMConfig) => ({ provider: llm.provider, model: llm.model, baseUrl: llm.baseUrl, hasKey: !!llm.apiKey });

function state(opts: SettingsServerOptions) {
  const c = loadConfig();
  const m = c.memberReplies;
  const usage = new Map(store.memberUsageSince(localDate(nowTs() - 6 * 86400, c.timezone)).map((u) => [u.chat_jid, u.count]));
  return {
    version: currentVersion,
    bot: opts.botNumber() || null,
    providers: providerList(),
    anthropicModels: ANTHROPIC_MODELS,
    timezones: TIMEZONES.filter((t) => t.value !== "__other"),
    days: DAY_NAMES,
    config: {
      llm: publicLLM(c.llm),
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
      members: { llm: m.llm && publicLLM(m.llm), enabled: m.enabled, perPersonDaily: m.perPersonDaily, perGroupDaily: m.perGroupDaily },
    },
    groups: store.listGroups().map((g) => ({
      jid: g.jid,
      name: g.name,
      notify: g.notify_mode,
      readImages: g.read_images,
      members: g.member_replies,
      membersOn: wantsMemberReplies(g),
      memberUsage: usage.get(g.jid) ?? 0,
    })),
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
      case "POST /api/member-ai": {
        const rejected = await settings.setMemberLLM(toLLM({ ...body, for: "members" }), body.skipTest === true);
        return rejected ? { status: 400, body: { error: rejected } } : { body: state(opts) };
      }
      case "POST /api/members": {
        const limit = (v: unknown) => (v === null || v === "" ? null : Number(v));
        let rejected: string | null = null;
        if ("perPersonDaily" in body || "perGroupDaily" in body) {
          const m = loadConfig().memberReplies;
          rejected = settings.setMemberLimits(
            "perPersonDaily" in body ? limit(body.perPersonDaily) : m.perPersonDaily,
            "perGroupDaily" in body ? limit(body.perGroupDaily) : m.perGroupDaily,
          );
        }
        if (!rejected && body.enabled !== undefined) rejected = settings.setMemberReplies(body.enabled === true);
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
        if (body.members !== undefined) {
          const rejected = settings.setMemberReplies(body.members === null ? null : body.members === true, g.jid);
          if (rejected) return { status: 400, body: { error: rejected } };
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
