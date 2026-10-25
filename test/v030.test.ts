// Tes fitur v0.3.0 yang gak butuh WhatsApp. Jalankan: npm test
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "japri-test-"));
import { test } from "node:test";
import assert from "node:assert";
const { saveConfig, newConfig } = await import("../src/config.js");
saveConfig(newConfig({ provider: "openai", model: "m" }));
const tasks = await import("../src/tasks.js");
const vision = await import("../src/vision.js");
const { updateConfig } = await import("../src/config.js");

const TZ = "Asia/Jakarta";
const at = (iso: string) => Date.parse(iso) / 1000;

test("tugas: besok jam 9 pagi", () => {
  assert.equal(tasks.tomorrowMorning(at("2026-10-24T21:00:00+07:00"), TZ), at("2026-10-25T09:00:00+07:00"));
  assert.equal(tasks.tomorrowMorning(at("2026-10-24T07:00:00+07:00"), TZ), at("2026-10-25T09:00:00+07:00"));
  assert.equal(tasks.tomorrowMorning(at("2026-10-24T00:30:00+07:00"), TZ), at("2026-10-25T09:00:00+07:00"));
});

test("tugas: parsing jawaban AI", () => {
  const now = at("2026-10-24T12:00:00+07:00");
  assert.deepEqual(tasks.parseTaskReply('{"task": "Kirim laporan", "due": "2026-10-30T09:00:00+07:00"}', now, TZ), { task: "Kirim laporan", dueTs: at("2026-10-30T09:00:00+07:00") });
  assert.deepEqual(tasks.parseTaskReply('```json\n{"task":"Bayar iuran","due":null}\n```', now, TZ), { task: "Bayar iuran", dueTs: at("2026-10-25T09:00:00+07:00") });
  assert.equal(tasks.parseTaskReply('{"task": null}', now, TZ), null);
  assert.equal(tasks.parseTaskReply("gak ada tugas", now, TZ), null);
  assert.equal(tasks.parseTaskReply('{"task": "x", "due": "2026-10-24T11:00:00+07:00"}', now, TZ), null); // udah lewat
  assert.equal(tasks.parseTaskReply('{"task": "Cek", "due": "besok"}', now, TZ)!.dueTs, at("2026-10-25T09:00:00+07:00")); // format aneh → besok pagi
});

test("baca gambar: jatah 100 gambar per hari (reset besoknya), teks catatan", () => {
  const day1 = at("2026-10-24T23:00:00+07:00");
  for (let i = 0; i < vision.MAX_IMAGES_PER_DAY; i++) assert.ok(vision.takeImageQuota(day1));
  assert.ok(!vision.takeImageQuota(day1));
  assert.ok(vision.takeImageQuota(at("2026-10-25T00:30:00+07:00"))); // udah ganti hari (WIB)
  assert.equal(vision.withDescription("[gambar]", "struk transfer Rp 50.000"), "[gambar: struk transfer Rp 50.000]");
  assert.equal(vision.withDescription("bukti ya", "struk"), "bukti ya\n[gambar: struk]");
  updateConfig({ readImages: true });
  assert.ok(vision.readsImages({ read_images: null } as any)); assert.ok(!vision.readsImages({ read_images: 0 } as any));
});
