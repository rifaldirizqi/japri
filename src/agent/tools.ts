import { z } from "zod";
import { loadConfig, updateConfig } from "../config.js";
import * as store from "../db.js";
import { defineTool, testToolCalling } from "../llm/index.js";
import { catchupPrompt, collectCatchup, commitCatchup, transcript } from "../catchup.js";
import { formatMinutes, formatTs, isValidTimezone, lastOccurrence, nowTs, parseHM } from "../time.js";
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

const NOTIFY_LABEL: Record<store.NotifyMode, string> = {
  all: "semua (tag, reply, nama panggilan)",
  mentions: "cuma tag & reply",
  off: "mati",
};

const hmInput = (what: string) => z.string().describe(`${what}, format 24 jam HH:MM, mis. 21:00`);

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
      name: "catch_up",
      description:
        "Rangkuman semua grup sejak terakhir kali owner ngikutin (catch-up). Pakai kalau owner nanya \"gue ketinggalan apa?\", \"ada apa aja di grup?\", \"rangkum semua\", atau sejenisnya tanpa nyebut grup tertentu.",
      input: z.object({}),
      run: async () => {
        const now = nowTs();
        const batches = collectCatchup(now);
        if (batches.length === 0) return 'Gak ada obrolan baru di grup mana pun. Jawab owner singkat: "Aman, gak ada yang baru."';
        commitCatchup(batches, now);
        return catchupPrompt(batches);
      },
    }),

    defineTool({
      name: "search_messages",
      description:
        "Cari pesan lama pakai kata kunci di semua grup (atau satu grup). Boleh panggil berkali-kali dengan kata kunci lain kalau belum ketemu. Hasilnya cuma pesan teks yang dicatat sejak Japri masuk grup, dalam masa simpan pesan.",
      input: z.object({
        keywords: z.array(z.string().min(2)).min(1).max(8).describe("Kata kunci; pesan yang mengandung salah satunya ikut ketemu. Termasuk sinonim/variasi, mis. ['rekening','norek','rek']"),
        group: z.string().optional().describe("Nama grup kalau owner nyebut grup tertentu"),
        days_back: z.number().min(1).max(365).optional().describe("Batas berapa hari ke belakang; default seluruh masa simpan"),
      }),
      run: async ({ keywords, group, days_back }) => {
        let chatJid: string | undefined;
        if (group) {
          const g = resolveGroup(group, current);
          if (typeof g === "string") return g;
          chatJid = g.jid;
        }
        const { retentionDays } = loadConfig();
        const days = Math.min(days_back ?? retentionDays, retentionDays);
        const rows = store.searchMessages(keywords, { chatJid, sinceTs: nowTs() - days * 86400, limit: 40 });
        if (rows.length === 0) return `Gak ketemu pesan dengan kata kunci ${keywords.join(", ")} dalam ${days} hari terakhir.`;
        return (
          `${rows.length} pesan ketemu (terbaru duluan${rows.length === 40 ? ", dibatasi 40" : ""}). Sebut sumbernya (grup, pengirim, waktu) waktu jawab:\n` +
          rows
            .map((m) => `[${m.chat_name ?? "grup"} · ${formatTs(m.ts, tz)}] ${m.from_owner ? "OWNER" : (m.sender_name ?? "?")}: ${m.text}`)
            .join("\n")
        );
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
          `Digest harian: ${c.digest ? `tiap jam ${c.digest.time}` : "mati"}`,
          `Jam tenang: ${c.quietHours ? `${c.quietHours.start}–${c.quietHours.end}` : "mati"}`,
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
  
    defineTool({
      name: "set_digest",
      description: "Nyalain, ubah jam, atau matiin digest harian (rangkuman semua grup yang dikirim otomatis tiap hari ke DM owner).",
      input: z.object({
        time: hmInput("Jam kirim").nullable().describe("Jam kirim format 24 jam HH:MM (mis. 21:00), atau null buat matiin"),
      }),
      run: async ({ time }) => {
        if (time === null) {
          updateConfig({ digest: null });
          return "Digest harian dimatiin.";
        }
        const minutes = parseHM(time);
        if (minutes === null) return `Jam "${time}" gak valid. Pakai format HH:MM.`;
        // Jadwal yang udah lewat hari ini gak dikirim mendadak; mulai dari jadwal berikutnya
        updateConfig({ digest: { time: formatMinutes(minutes) }, digestHandledTs: lastOccurrence(minutes, nowTs(), tz) });
        return `Digest harian nyala: tiap jam ${formatMinutes(minutes)}. Kalau gak ada obrolan baru, gak dikirim.`;
      },
    }),

    defineTool({
      name: "set_group_notifications",
      description:
        "Atur mode notif satu grup. 'all' = tag, reply, dan nama panggilan; 'mentions' = cuma tag & reply; 'off' = gak ada notif. Grup tetap dicatat dan tetap masuk rangkuman.",
      input: z.object({
        group: z.string().describe("Nama grup, atau 'current' untuk grup tempat owner sedang bertanya"),
        mode: z.enum(["all", "mentions", "off"]),
      }),
      run: async ({ group, mode }) => {
        const g = resolveGroup(group, current);
        if (typeof g === "string") return g;
        store.setNotifyMode(g.jid, mode);
        return `Notif grup "${g.name}": ${NOTIFY_LABEL[mode]}. Grup ini tetap dicatat dan tetap masuk rangkuman.`;
      },
    }),

    defineTool({
      name: "set_quiet_hours",
      description:
        "Atur jam tenang: selama jam ini notif mention ditahan, terus dikirim jadi satu pesan pas jam tenang selesai. Reminder tetap dikirim. Isi start & end null buat matiin.",
      input: z.object({
        start: hmInput("Mulai").nullable(),
        end: hmInput("Selesai").nullable(),
      }),
      run: async ({ start, end }) => {
        if (start === null || end === null) {
          updateConfig({ quietHours: null });
          return "Jam tenang dimatiin. Notif yang lagi ditahan bakal dikirim bentar lagi.";
        }
        const s = parseHM(start);
        const e = parseHM(end);
        if (s === null || e === null || s === e) return "Jam mulai/selesai gak valid. Pakai format HH:MM dan jangan sama.";
        updateConfig({ quietHours: { start: formatMinutes(s), end: formatMinutes(e) } });
        return `Jam tenang: ${formatMinutes(s)}–${formatMinutes(e)}. Notif ditahan dan dikirim jadi satu pesan pas selesai; reminder tetap dikirim.`;
      },
    }),

    defineTool({
      name: "get_notification_settings",
      description: "Lihat pengaturan notif: mode notif tiap grup, nama panggilan, jam tenang, dan digest harian.",
      input: z.object({}),
      run: async () => {
        const c = loadConfig();
        const groups = store.listGroups();
        return [
          `Nama panggilan (buat notif): ${c.nicknames.join(", ") || "(belum diatur)"}`,
          `Jam tenang: ${c.quietHours ? `${c.quietHours.start}–${c.quietHours.end}` : "mati"}`,
          `Digest harian: ${c.digest ? `tiap jam ${c.digest.time}` : "mati"}`,
          `Mode notif per grup:`,
          ...(groups.length ? groups.map((g) => `- ${g.name ?? "(tanpa nama)"}: ${NOTIFY_LABEL[g.notify_mode]}`) : ["- (belum ada grup)"]),
        ].join("\n");
      },
    }),
  ];
}
