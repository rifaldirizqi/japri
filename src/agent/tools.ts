import { z } from "zod";
import { loadConfig, updateConfig } from "../config.js";
import * as store from "../db.js";
import { defineTool, testToolCalling } from "../llm/index.js";
import { formatHM, formatTs, isValidTimezone, nowTs } from "../time.js";
import { checkForUpdate, currentVersion, updateMessage } from "../updater.js";

function resolveGroup(query: string, current?: store.Chat): store.Chat | string {
  if (query === "current") return current ?? "Perintah ini gak dikirim dari grup. Tanyakan grup yang mana.";
  const groups = store.listGroups();
  const q = query.toLowerCase();
  const exact = groups.find((g) => g.name?.toLowerCase() === q);
  if (exact) return exact;
  const matches = groups.filter((g) => g.name?.toLowerCase().includes(q));
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) return `Gak ada grup yang cocok dengan "${query}". Panggil list_groups untuk lihat daftar.`;
  return `Ambigu, ada beberapa grup: ${matches.map((g) => g.name).join(", ")}. Tanyakan ke owner yang mana.`;
}

const transcript = (messages: store.StoredMessage[], tz: string) =>
  messages.map((m) => `[${formatHM(m.ts, tz)}] ${m.from_owner ? "OWNER" : (m.sender_name ?? "?")}: ${m.text}`).join("\n");

/** @param current grup tempat owner sedang ngobrol (kalau perintah datang dari grup) */
export function buildTools(current?: store.Chat) {
  const tz = loadConfig().timezone;

  return [
    defineTool({
      name: "list_groups",
      description: "Daftar grup WhatsApp tempat bot menjadi anggota.",
      input: z.object({}),
      run: async () => {
        const groups = store.listGroups();
        if (groups.length === 0) return "Bot belum masuk grup mana pun. Owner perlu invite nomor bot ke grup.";
        return groups.map((g) => `- ${g.name ?? "(tanpa nama)"}`).join("\n");
      },
    }),

    defineTool({
      name: "read_group_messages",
      description: "Ambil transkrip pesan satu grup dalam rentang waktu tertentu. Pakai untuk merangkum atau menjawab pertanyaan soal isi grup.",
      input: z.object({
        group: z.string().describe("Nama grup (boleh sebagian), atau 'current' untuk grup tempat owner sedang bertanya"),
        hours_back: z.number().min(0.1).max(24 * 30).describe("Berapa jam ke belakang, mis. 3, 24, 168"),
      }),
      run: async ({ group, hours_back }) => {
        const g = resolveGroup(group, current);
        if (typeof g === "string") return g;
        const msgs = store.getMessages(g.jid, nowTs() - Math.round(hours_back * 3600));
        if (msgs.length === 0) return `Gak ada pesan di "${g.name}" dalam ${hours_back} jam terakhir.`;
        return `Grup: ${g.name}\nJumlah pesan: ${msgs.length}\n\n${transcript(msgs, tz)}`;
      },
    }),

    defineTool({
      name: "set_reminder",
      description: "Buat reminder. Default dikirim ke DM owner; bisa juga dikirim ke grup.",
      input: z.object({
        text: z.string().describe("Isi reminder yang akan dikirim"),
        due_at: z.string().describe("Waktu ISO 8601 dengan offset, mis. 2026-10-25T09:00:00+07:00"),
        target: z.string().default("me").describe("'me' untuk DM owner, 'current' untuk grup ini, atau nama grup"),
        recurrence: z.enum(["none", "daily", "weekly"]).default("none"),
      }),
      run: async ({ text, due_at, target, recurrence }) => {
        const due = Date.parse(due_at);
        if (Number.isNaN(due)) return `Format waktu gak valid: ${due_at}`;
        const dueTs = Math.floor(due / 1000);
        if (dueTs < nowTs() - 60) return `Waktu ${due_at} sudah lewat.`;
        let targetJid = "owner";
        let targetName = "DM owner";
        if (target !== "me") {
          const g = resolveGroup(target, current);
          if (typeof g === "string") return g;
          targetJid = g.jid;
          targetName = g.name ?? "grup";
        }
        const id = store.addReminder({ text, due_ts: dueTs, target_jid: targetJid, recurrence: recurrence === "none" ? null : recurrence });
        return `Reminder #${id} dibuat: "${text}" → ${targetName}, ${formatTs(dueTs, tz)}${recurrence !== "none" ? ` (${recurrence})` : ""}`;
      },
    }),

    defineTool({
      name: "list_reminders",
      description: "Daftar reminder yang masih aktif.",
      input: z.object({}),
      run: async () => {
        const rows = store.pendingReminders();
        if (rows.length === 0) return "Gak ada reminder aktif.";
        return rows
          .map((r) => {
            const target = r.target_jid === "owner" ? "DM" : (store.getGroup(r.target_jid)?.name ?? "grup");
            return `#${r.id} ${formatTs(r.due_ts, tz)} → ${target}${r.recurrence ? ` (${r.recurrence})` : ""}: ${r.text}`;
          })
          .join("\n");
      },
    }),

    defineTool({
      name: "cancel_reminder",
      description: "Batalkan reminder berdasarkan ID.",
      input: z.object({ id: z.number().int() }),
      run: async ({ id }) => (store.cancelReminder(id) ? `Reminder #${id} dibatalkan.` : `Reminder #${id} gak ditemukan.`),
    }),

    defineTool({
      name: "get_settings",
      description: "Lihat pengaturan bot saat ini.",
      input: z.object({}),
      run: async () => {
        const c = loadConfig();
        return [
          `Nama bot: ${c.botName}`,
          `Nama panggilan owner (buat notif): ${c.nicknames.join(", ") || "(belum diatur)"}`,
          `Zona waktu: ${c.timezone}`,
          `Simpan pesan grup: ${c.retentionDays} hari`,
          `AI: ${c.llm.provider} / ${c.llm.model}`,
          `Versi Japri: v${currentVersion}`,
          `Cek update otomatis: ${c.checkUpdates ? "nyala" : "mati"}`,
        ].join("\n");
      },
    }),

    defineTool({
      name: "update_settings",
      description: "Ubah pengaturan bot. Isi hanya field yang mau diubah.",
      input: z.object({
        nicknames: z.array(z.string().max(30)).max(10).optional().describe("Nama panggilan owner; kalau disebut di grup, owner dapat notif. Mengganti seluruh daftar."),
        timezone: z.string().optional().describe("Zona waktu IANA, mis. Asia/Jakarta (WIB), Asia/Makassar (WITA), Asia/Jayapura (WIT)"),
        bot_name: z.string().max(30).optional(),
        retention_days: z.number().int().min(1).max(365).optional(),
        model: z.string().optional().describe("Nama model lain dari provider yang sama"),
        check_updates: z.boolean().optional().describe("Nyalain/matiin kabar otomatis kalau ada versi Japri baru"),
      }),
      run: async (input) => {
        const c = loadConfig();
        const changes: string[] = [];
        if (input.nicknames) {
          updateConfig({ nicknames: input.nicknames.map((n) => n.trim().toLowerCase()).filter(Boolean) });
          changes.push("nama panggilan");
        }
        if (input.timezone) {
          if (!isValidTimezone(input.timezone)) return `Zona waktu "${input.timezone}" gak dikenal.`;
          updateConfig({ timezone: input.timezone });
          changes.push("zona waktu");
        }
        if (input.bot_name) {
          updateConfig({ botName: input.bot_name });
          changes.push("nama bot");
        }
        if (input.retention_days) {
          updateConfig({ retentionDays: input.retention_days });
          changes.push("lama simpan pesan");
        }
        if (input.check_updates !== undefined) {
          updateConfig({ checkUpdates: input.check_updates });
          changes.push(`cek update otomatis (${input.check_updates ? "nyala" : "mati"})`);
        }
        if (input.model && input.model !== c.llm.model) {
          const candidate = { ...c.llm, model: input.model };
          const test = await testToolCalling(candidate);
          if (!test.ok) return `Model "${input.model}" gak bisa dipakai: ${test.detail}. Pengaturan lain ${changes.length ? "tetap disimpan" : "gak berubah"}.`;
          updateConfig({ llm: candidate });
          changes.push(`model (sekarang ${input.model})`);
        }
        return changes.length ? `Disimpan: ${changes.join(", ")}.` : "Gak ada yang diubah.";
      },
    }),

    defineTool({
      name: "check_update",
      description: "Cek apakah ada versi Japri yang lebih baru. Kalau ada, sampaikan pesan update yang dikembalikan apa adanya.",
      input: z.object({}),
      run: async () => {
        const status = await checkForUpdate();
        if (status.kind === "available") return updateMessage(status.release);
        if (status.kind === "error") return `Gagal cek update: ${status.message}`;
        return `Japri udah versi terbaru (v${currentVersion}).`;
      },
    }),
  ];
}
