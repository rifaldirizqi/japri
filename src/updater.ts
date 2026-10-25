// Cek rilis baru di GitHub Releases dan kabarin owner. Cuma baca halaman rilis publik, gak ngirim data apa pun.
import fs from "node:fs";
import { loadConfig, updateConfig } from "./config.js";
import { isDesktop } from "./desktop.js";

type Pkg = { version: string; repository?: { url?: string } | string };
const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")) as Pkg;

export const currentVersion = pkg.version;

/** "owner/repo" dari field repository di package.json (biar fork otomatis ngecek repo-nya sendiri). */
function repoSlug(): string | null {
  const url = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;
  return url?.match(/github\.com[/:]([^/]+\/[^/.]+)/)?.[1] ?? null;
}

// ---------- Versi ----------

type Version = { nums: number[]; pre: string | null };

function parseVersion(v: string): Version | null {
  const m = v.trim().replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/);
  return m ? { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ?? null } : null;
}

/** >0 kalau a lebih baru dari b. Versi pre-release (mis. 1.0.0-beta) dianggap lebih lama dari versi finalnya. */
export function compareVersions(a: string, b: string): number {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (!va || !vb) return 0;
  for (let i = 0; i < 3; i++) if (va.nums[i] !== vb.nums[i]) return va.nums[i] - vb.nums[i];
  if (va.pre === vb.pre) return 0;
  if (va.pre === null) return 1;
  if (vb.pre === null) return -1;
  return va.pre.localeCompare(vb.pre, "en", { numeric: true });
}

// ---------- GitHub Releases ----------

export type Release = {
  version: string;
  url: string;
  notes: string;
  installerUrl: string | null;
  /** Buat update sekali klik: ukuran & checksum installer dari GitHub */
  installer: { url: string; size: number; sha256: string | null } | null;
};

type GitHubRelease = {
  tag_name: string;
  html_url: string;
  body: string | null;
  draft: boolean;
  assets: { name: string; browser_download_url: string; size?: number; digest?: string | null }[];
};

/** Rilis dengan versi tertinggi (pre-release ikut dihitung, draft enggak). */
export async function fetchLatestRelease(): Promise<Release | null> {
  const slug = repoSlug();
  if (!slug) return null;
  const res = await fetch(`https://api.github.com/repos/${slug}/releases?per_page=20`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": `japri/${currentVersion}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`GitHub ngebales ${res.status}`);
  const releases = ((await res.json()) as GitHubRelease[]).filter((r) => !r.draft && parseVersion(r.tag_name));
  if (releases.length === 0) return null;
  const latest = releases.reduce((a, b) => (compareVersions(b.tag_name, a.tag_name) > 0 ? b : a));
  const asset = latest.assets.find((a) => /^JapriSetup-.*\.exe$/i.test(a.name));
  return {
    version: latest.tag_name.replace(/^v/, ""),
    url: latest.html_url,
    notes: latest.body ?? "",
    installerUrl: asset?.browser_download_url ?? null,
    installer: asset
      ? { url: asset.browser_download_url, size: asset.size ?? 0, sha256: asset.digest?.match(/^sha256:([0-9a-f]{64})$/i)?.[1].toLowerCase() ?? null }
      : null,
  };
}

// ---------- Pesan ----------

/** Ubah catatan rilis (Markdown) jadi daftar poin buat WhatsApp. */
export function summarizeNotes(markdown: string, maxItems = 8): string {
  const items = markdown
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[-*] /.test(l))
    .map((l) =>
      l
        .replace(/^[-*] /, "• ")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [teks](link) → teks
        .replace(/\*\*([^*]+)\*\*/g, "*$1*") // **tebal** → *tebal* (format WA)
        .replace(/`([^`]+)`/g, "$1"),
    );
  if (items.length === 0) return "";
  const extra = items.length > maxItems ? `\n• …dan ${items.length - maxItems} perubahan lain` : "";
  return items.slice(0, maxItems).join("\n") + extra;
}

/** Installer Windows bisa update dirinya sendiri (bales "update"). */
export const canSelfUpdate = () => isDesktop && process.platform === "win32";

function howToUpdate(r: Release): string {
  if (canSelfUpdate() && r.installer?.sha256) {
    return `Bales *update* buat update sekarang. Japri bakal mati bentar (±1 menit), terus nyala lagi sendiri. Data lo tetap aman.\n_(Atau download manual: ${r.installer.url})_`;
  }
  if (isDesktop) {
    return r.installerUrl
      ? `Download installer-nya, terus jalanin (Japri yang lagi jalan otomatis dimatiin, data lo tetap aman):\n${r.installerUrl}`
      : `Download installer terbaru di: ${r.url}`;
  }
  if (process.env.RUNNING_IN_DOCKER) return "Jalanin di folder Japri:\n```docker compose pull && docker compose up -d```\n(Kalau build sendiri dari kode: ```git pull && docker compose up -d --build```)";
  return "Jalanin di folder Japri:\n```git pull && npm install```\nterus restart Japri.";
}

export function updateMessage(r: Release): string {
  const notes = summarizeNotes(r.notes);
  return (
    `🆕 *Japri v${r.version} udah rilis* (lo masih pakai v${currentVersion})\n\n` +
    (notes ? `*Yang baru:*\n${notes}\n\n` : "") +
    `*Cara update:*\n${howToUpdate(r)}\n\n` +
    `Detail: ${r.url}\n` +
    `_Gak mau dikabarin soal update? Bilang aja "matiin cek update"._`
  );
}

// ---------- Cek ----------

export type UpdateStatus =
  | { kind: "available"; release: Release }
  | { kind: "up-to-date"; latest: string | null }
  | { kind: "error"; message: string };

export async function checkForUpdate(): Promise<UpdateStatus> {
  try {
    const release = await fetchLatestRelease();
    if (release && compareVersions(release.version, currentVersion) > 0) return { kind: "available", release };
    return { kind: "up-to-date", latest: release?.version ?? null };
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

/** Cek berkala: kabarin owner sekali per versi baru. */
export async function notifyIfUpdateAvailable(send: (text: string) => Promise<void>) {
  if (!loadConfig().checkUpdates) return;
  const status = await checkForUpdate();
  if (status.kind !== "available") return;
  const { version } = status.release;
  console.log(`🆕 Japri v${version} udah rilis (sekarang v${currentVersion}). Detail: ${status.release.url}`);
  if (loadConfig().notifiedVersion === version) return;
  await send(updateMessage(status.release));
  updateConfig({ notifiedVersion: version });
}
