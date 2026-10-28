# Japri 🤖

🌐 **[japri.rifaldirizqi.web.id](https://japri.rifaldirizqi.web.id)**

**Japri** (_jalur pribadi_) adalah asisten pribadi buat grup WhatsApp yang bisa lo jalanin sendiri, di VPS atau di PC lo. Dia nongkrong di grup, terus japri lo kalau ada yang nyariin.

Japri pakai **nomor WhatsApp kedua** yang lo invite ke grup-grup lo. Dia nyatet obrolan, bikin rangkuman, dan ngingetin hal-hal penting. Bisa pakai AI dari mana aja: Claude, OpenAI, Gemini, OpenRouter, atau model lokal.

## Bisa apa aja?

| | Contoh |
|---|---|
| 🔔 **Notif mention** | Ada yang tag lo, bales pesan lo, atau nyebut nama panggilan lo di grup → bot langsung DM lo. |
| 📌 **Tugas → reminder** | Notif yang isinya tugas (_"Ndi, kirim laporan Jumat ya"_) ditambahin _"Mau gue ingetin Jum 09:00?"_. Bales *ya*, atau sebut jam lain. |
| 📬 **"Gue ketinggalan apa?"** | Satu pesan berisi rangkuman **semua grup** sejak terakhir kali lo nimbrung, plus bagian _"Perlu perhatian lo"_. Gak perlu nyebut grup atau jam. |
| 🗞️ **Digest harian & mingguan** | _"kirim rangkuman tiap jam 9 malam"_ · _"tiap hari kerja aja"_ · _"rangkuman mingguan tiap Minggu jam 7 malam"_. Kalau gak ada obrolan baru, gak dikirim. |
| 📝 **Rangkuman grup** | DM bot: _"rangkum grup kantor 3 jam terakhir"_. Atau di grup: _"@Japri rangkum 2 jam terakhir"_ |
| 🔎 **Cari pesan lama** | _"siapa yang ngirim nomor rekening kemarin?"_ · _"kapan deadline proposal?"_ → dijawab lengkap sama grup, pengirim, dan jamnya |
| 🖼️ **Baca gambar** | _"baca gambar di semua grup"_ → poster, jadwal, dan struk dibaca AI, terus ikut masuk rangkuman & pencarian. Default mati. Kirim gambar langsung ke bot juga bisa: _"ingetin gue acara ini"_ |
| 🔕 **Atur notif** | _"matiin notif grup alumni"_ · _"grup kantor cuma kalau di-tag"_ · _"jangan ganggu jam 10 malam sampai 6 pagi"_ (notif ditahan, dikirim jadi satu pesan pas pagi) |
| ⏰ **Reminder** | _"ingetin gue besok jam 9 kirim laporan"_ · _"tiap senin jam 8 ingetin grup tim soal standup"_ |
| ⚙️ **Atur lewat chat** | _"panggil gue andi atau ndi"_ · _"zona waktu gue WITA"_ · _"ganti nama lo jadi Jarvis"_ |
| 💬 **Jawab anggota grup** (opsional) | _"jawab semua orang di grup kantor"_ → anggota grup bisa nanya apa aja ke bot (tag bot, bales pesannya, atau awali dengan `/ai`). Pakai AI terpisah yang gak bisa baca catatan grup, dan provider/API key-nya bisa beda dari punya lo. Default mati. |
| 🆕 **Kabar update** | Ada versi Japri baru → lo di-DM, lengkap sama isi perubahan. Di Windows, bales *update* dan Japri update sendiri. Bisa juga nanya _"ada update gak?"_ |

Cuma lo yang bisa merintah bot. Orang lain yang nge-DM bot dicuekin. Tag dari anggota grup juga dicuekin, kecuali lo nyalain **jawab anggota grup** buat grup itu. Itu pun mereka cuma dapet AI umum buat tanya jawab: gak bisa baca catatan grup, ngerangkum, bikin reminder, atau ngubah pengaturan.

### Jawab anggota grup

1. **Atur AI-nya dulu.** Windows: **Pengaturan** → **AI buat anggota** (pilih penyedia, API key, dan model, terus **Tes & simpan**). Docker/Node: bilang ke bot _"AI anggota pakai model X"_ (pakai penyedia & API key lo), atau jalanin setup lagi kalau mau penyedia/API key lain. API key jangan pernah diketik di chat.
2. **Nyalain:** _"jawab semua orang di grup kantor"_ atau _"jawab semua orang di semua grup"_. Grup yang baru nyala dapet pengumuman sekali.
3. **Pantau:** _"AI anggota kepake berapa minggu ini?"_. Kalau perlu, kasih jatah: _"batasi AI anggota 20 pertanyaan per orang sehari"_. Default tanpa batas.

AI anggota gak pakai tool, jadi model murah, gratis (OpenRouter `:free`), atau lokal (Ollama) juga bisa. Biayanya ditanggung API key yang lo pasang. Biar nomor bot gak dianggap spam, Japri ngasih jeda beberapa detik antar balasan di grup yang sama, tapi tetap hati-hati nyalain ini di grup yang rame banget.

## Yang perlu disiapin

1. **Nomor WhatsApp khusus buat bot**, plus HP buat scan QR sekali. Jangan pakai nomor pribadi: kalau WhatsApp nge-ban nomor bot, nomor lo tetap aman.
2. **API key AI** dari salah satu provider di bawah, atau model lokal (gratis tapi butuh PC kuat).
3. **Komputer yang nyala terus**, entah VPS atau PC. Bot cuma jalan selama komputernya nyala.

## Install

### Cara A — Windows, tinggal klik (paling gampang)

1. Download **[JapriSetup.exe](https://github.com/rifaldirizqi/japri/releases/latest/download/JapriSetup.exe)** (atau dari [japri.rifaldirizqi.web.id](https://japri.rifaldirizqi.web.id)).
2. Dobel-klik file itu. Kalau muncul layar biru _"Windows protected your PC"_, klik **More info** → **Run anyway**. Ini muncul karena installer-nya belum punya sertifikat tanda tangan digital, bukan karena virus.
3. Klik **Next** sampai **Finish**. Gak perlu hak admin, dan gak perlu install apa-apa lagi.
4. Jendela setup Japri kebuka otomatis. Ikutin langkahnya:
   - Pilih provider AI, tempel API key (tekan Ctrl+V buat paste), pilih model.
   - Browser kebuka nampilin **QR**. Scan pakai **HP nomor bot**: WhatsApp → Perangkat tertaut → Tautkan perangkat.
   - Muncul **kode setup** 6 digit. Kirim kode itu dari **WhatsApp pribadi lo** ke nomor bot.
5. Beres. Jendela setup ketutup sendiri, terus **jendela Japri** kebuka: isinya status, nomor bot, model AI, tombol-tombol, dan log.

**Jendela Japri boleh ditutup kapan aja.** Tombol X atau minimize cuma nyembunyiin jendelanya ke **system tray** (ikon Japri di pojok kanan bawah, deket jam; kalau gak kelihatan, klik panah **^** di situ). Bot-nya tetap jalan. Buat buka lagi, klik ikon itu atau buka Japri dari Desktop / Start Menu. Japri cuma berhenti kalau lo klik **Keluar**, dan itu pun ditanya dulu biar gak kepencet.

Kalau tadi opsi _"Jalankan otomatis"_ dicentang, Japri nyala sendiri tiap Windows nyala, langsung ke tray tanpa buka jendela.

**Status Japri** (di jendela dan ikon tray):

| Ikon | Artinya |
|---|---|
| Hijau | Jalan normal |
| Abu-abu | Lagi nyambung ke WhatsApp |
| Ada tanda **!** merah | Butuh perhatian: perlu scan QR ulang, atau error terus. Muncul juga notifikasi Windows, dan tombol buat beresinnya di jendela Japri. |

Kalau bot-nya crash, Japri nyalain ulang sendiri. Klik kanan ikon tray buat menu cepat: **Buka Japri**, **Pengaturan**, **Buka folder data**, **Keluar**.

**Pengaturan** (tombol di jendela Japri, menu tray, atau Start Menu → Japri - Pengaturan): ganti AI & API key, AI buat anggota grup, nama bot, nama panggilan, zona waktu, jam tenang, rangkuman otomatis, notif & baca gambar per grup, dan lainnya. Perubahan langsung kepakai tanpa restart. Mau sambungin ulang dari awal (mis. ganti nomor bot)? Pengaturan → Tentang → **Setup ulang**.

### Cara B — Docker

Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/Mac) atau Docker Engine (Linux), terus:

```bash
mkdir japri && cd japri
curl -fsSLO https://raw.githubusercontent.com/rifaldirizqi/japri/main/docker-compose.yml
docker compose run --rm japri setup
```

Image-nya udah jadi (`ghcr.io/rifaldirizqi/japri`), jadi gak perlu build sendiri. Jalan di PC/VPS biasa maupun Raspberry Pi / VPS ARM.

Wizard bakal nuntun lo:
1. Pilih provider AI, tempel API key, pilih model. Wizard ngetes koneksinya dulu.
2. Kasih nama bot dan pilih zona waktu.
3. Scan QR pakai **HP nomor bot**: WhatsApp → Perangkat tertaut → Tautkan perangkat.
4. Muncul **kode setup** 6 digit. Kirim kode itu dari **WhatsApp pribadi lo** ke nomor bot. Ada link yang tinggal diklik.

Kalau udah muncul "Setup selesai", jalanin bot di background:

```bash
docker compose up -d
```

### Cara C — Node.js langsung

Install [Node.js 22.13+](https://nodejs.org), terus:

```bash
git clone <url-repo-ini> japri
cd japri
npm install
npm start
```

Wizard yang sama bakal muncul pas pertama kali jalan. Setelah setup, bot langsung jalan di terminal itu, jadi jangan ditutup. Biar jalan di background dan nyala otomatis, pakai [pm2](https://pm2.keymetrics.io/): `npm i -g pm2 && pm2 start "npm start" --name japri`.

## Mulai pakai

1. **Invite nomor bot ke grup** yang mau dipantau. Bot bakal ngenalin diri dan bilang dia mencatat.
2. **Kasih tau nama panggilan lo** ke bot lewat DM, biar dia bisa ngabarin walaupun lo gak di-tag.
3. Kirim `/help` ke bot kapan aja buat lihat contoh perintah.

## Pilih AI

| Provider | Kelebihan | Catatan |
|---|---|---|
| **Anthropic (Claude)** | Bagus buat bahasa Indonesia & rangkuman | Haiku 5.5 paling murah, Opus 5.5 paling pinter |
| **OpenAI** | Populer | |
| **Google Gemini** | Biasanya ada tier gratis | Cek batas & syarat pemakaian data di tier gratis |
| **OpenRouter** | Satu API key buat ratusan model | Pilih model yang mendukung *tool calling* |
| **Ollama / LM Studio** | Gratis, data gak keluar dari PC lo | Butuh PC kuat. Model kecil (< 8B) sering gagal tool calling dan kurang lancar bahasa Indonesia |

Wizard selalu ngetes apakah model yang lo pilih bisa *tool calling* (manggil fungsi). Bot ini butuh kemampuan itu buat baca grup dan bikin reminder.

### Rekomendasi model

| Kebutuhan | Model | Pilih di wizard | Catatan |
|---|---|---|---|
| **Hemat & andal** (disarankan) | Claude Haiku 5.5 | Anthropic → Claude Haiku 5.5 | $0.10 / $0.50 per 1 juta token. Bahasa Indonesia & tool calling bagus |
| **Lebih pinter** | Claude Sonnet 5.5 | Anthropic → Claude Sonnet 5.5 | 20× harga Haiku. Buat grup yang obrolannya ruwet |
| **Paling pinter** | Claude Opus 5.5 | Anthropic → Claude Opus 5.5 | 40× harga Haiku. Biasanya gak perlu buat Japri |
| **Murah, alternatif** | GPT mini/Luna, DeepSeek Flash, Gemini Flash-Lite | OpenAI / Gemini / OpenRouter | Kisaran harganya mirip Haiku. Cek harga resmi providernya |
| **Gratis** | Model `:free` di OpenRouter, mis. Gemma 4 31B, Nemotron 3 Super | OpenRouter → ketik `:free` di kolom cari | Ada batas request harian. Daftar model gratis sering berubah |
| **Offline / data gak keluar PC** | Model lokal yang bisa tool calling, ukuran ≥ 14B | Ollama / LM Studio | Butuh PC dengan GPU/RAM gede |

Daftar di atas per Oktober 2026. Model baru muncul terus, jadi kalau ragu, coba aja: wizard bakal nolak model yang gak bisa dipakai.

⚠️ **Model gratis:** provider-nya kadang nyimpen isi prompt, dan isi prompt Japri itu obrolan grup lo. Cek kebijakan data di halaman model, atau di Settings → Privacy di OpenRouter.

**Kira-kira biaya:** notif mention, atur notif, dan jam tenang gratis, karena gak pakai AI. Saran reminder dari tugas (_bisa dimatiin: "matiin saran reminder"_) ngecek tiap pesan yang bikin notif ke lo, kira-kira Rp 1 per pesan. Rangkuman 1 grup rame (~300 pesan) sekitar 10–20 ribu token. Pakai Claude Haiku 5.5 itu kira-kira Rp 30–50 per rangkuman. _"Gue ketinggalan apa?"_ dan digest harian dikirim ke AI sekali jalan buat semua grup (tiap grup maksimal 300 pesan terakhir): kalau ada 5 grup rame, kira-kira Rp 150–250 sekali rangkum. Digest tiap hari + 5 rangkuman sehari totalnya sekitar Rp 10–15 ribu sebulan. Cari pesan lama juga murah, karena yang dikirim ke AI cuma pesan yang cocok sama kata kuncinya. Digest mingguan sekitar Rp 150–300 sekali kirim. Baca gambar sekitar Rp 3–5 per gambar, maksimal 100 gambar sehari.

Mau ganti model? Bilang aja ke bot: _"ganti model ke claude-sonnet-5-5"_. Kalau mau ganti provider atau API key, jalanin setup lagi (lihat di bawah).

## Privasi

- Semua data (pesan grup, reminder, pengaturan, session WhatsApp) disimpan di folder `data/` **di komputer lo sendiri**. Di versi installer Windows, letaknya di `%LOCALAPPDATA%\Japri\data`.
- Isi grup cuma dikirim ke provider AI pas lo minta rangkuman, nyari pesan, atau digest lo nyala. Selain itu, pesan yang ditujuin ke lo (tag, reply, nama panggilan) dikirim satu-satu buat dicek isinya tugas atau bukan; bisa dimatiin pakai _"matiin saran reminder"_.
- **Gambar** cuma dikirim ke AI kalau lo nyalain fitur baca gambar. File gambarnya gak disimpan, cuma catatan teksnya.
- **Jawab anggota grup**: kalau lo nyalain, pertanyaan anggota (plus pesan yang mereka bales) dikirim ke penyedia AI anggota. Isi catatan grup gak pernah ikut dikirim. Pengumuman di grup dan intro bot nyebut ini.
- Pesan grup otomatis dihapus setelah 30 hari. Bisa diubah: _"simpan pesan 7 hari aja"_.
- Pas masuk grup, bot ngenalin diri. **Admin grup** bisa ketik `@NamaBot keluar` atau kick bot, dan semua catatan grup itu langsung dihapus.
- Folder `data/` isinya API key dan session WhatsApp. Jangan di-share atau di-upload ke mana-mana.

## Perawatan

| Mau ngapain | Windows (installer) | Docker | Node |
|---|---|---|---|
| Lihat log | buka jendela Japri (log ada di bawah). Log lengkap: file `japri.log` di folder data | `docker compose logs -f` | lihat terminal / `pm2 logs` |
| Ganti provider / API key | jendela Japri → **Pengaturan** → AI | `docker compose run --rm japri setup` → `docker compose up -d` | `npm run setup` |
| Ganti AI buat anggota grup | jendela Japri → **Pengaturan** → AI buat anggota | penyedia lo: bilang _"AI anggota pakai model X"_. Penyedia/key lain: setup ulang kayak di atas | sama kayak Docker |
| Update ke versi baru | bales *update* ke kabar versi baru dari Japri (atau jalanin installer versi baru; data tetap aman) | `docker compose pull && docker compose up -d` | `git pull && npm install`, terus restart |
| Matiin kabar update | bilang ke bot: _"matiin cek update"_ | sama | sama |
| Berhentiin bot | jendela Japri → **Keluar** (nutup jendela doang gak matiin bot) | `docker compose down` | Ctrl+C / `pm2 stop japri` |
| Backup | jendela Japri → **Buka folder data**, copy isinya | copy folder `data/` | copy folder `data/` |
| Uninstall | lihat [Uninstall](#uninstall) | `docker compose down`, hapus folder | hapus folder |

Docker/Node: kalau setup di-rerun pas bot lagi nyala, matiin dulu botnya, biar gak ada dua bot di satu nomor. Versi Windows ngurus ini sendiri: Japri dimatiin dulu selama setup, terus dinyalain lagi.

## Uninstall

**Windows (installer):**

1. Buka **Settings → Apps → Installed apps** (Windows 10: **Apps & features**), cari **Japri**, klik **⋯** → **Uninstall**. Kalau Japri lagi jalan, otomatis dimatiin dulu.
2. Di akhir, lo ditanya **"Hapus juga data Japri?"**
   - **Yes:** pengaturan, API key, session WhatsApp, dan catatan grup ikut dihapus. Bersih total.
   - **No** (default): data disimpan di `%LOCALAPPDATA%\Japri`. Kalau nanti install ulang, Japri langsung jalan tanpa setup dan scan QR lagi.

Shortcut di Desktop, Start Menu, dan autostart ikut kehapus otomatis.

**Docker / Node:** matiin bot (`docker compose down` atau Ctrl+C / `pm2 delete japri`), terus hapus folder proyeknya, termasuk folder `data/`.

**Jangan lupa, di luar komputer (semua cara install):**

- **Lepas perangkat tertaut.** Di HP nomor bot, buka WhatsApp → **Perangkat tertaut**, terus hapus perangkat Japri. Kalau gak dihapus, perangkatnya tetap kedaftar sampai WhatsApp ngelepasnya sendiri karena lama gak aktif.
- **Keluarin bot dari grup.** Bot tetap jadi anggota grup sampai dikeluarin. Ketik _"@Japri keluar"_ di tiap grup sebelum uninstall, atau kick nomornya.

## Troubleshooting

- **"Bot di-logout dari WhatsApp"**: di Windows, Japri otomatis buka halaman QR baru di browser dan ikonnya ada tanda **!**: tinggal scan ulang pakai HP nomor bot. Di Docker/Node: hapus folder `data/auth`, jalanin setup lagi, scan QR ulang.
- **QR gak muncul / koneksi putus terus**: cek internet. Kalau di jaringan kantor yang pakai proxy, set env `HTTPS_PROXY`.
- **Bot gak bales**: pastiin lo ngirim dari nomor yang dulu ngirim kode setup. Cek log buat lihat error dari provider AI (API key salah, saldo habis, dll).
- **Ollama dari Docker gak nyambung**: pakai alamat `http://host.docker.internal:11434/v1` (default wizard udah gitu). Pastiin Ollama dengerin di semua alamat: `OLLAMA_HOST=0.0.0.0`.
- **Reminder telat**: kalau komputer sempat mati, reminder yang kelewat tetap dikirim pas nyala lagi, dan ditandai telat.
- **Windows: jendela Japri ilang**: Japri-nya masih jalan di tray. Buka lagi dari ikon Japri di Desktop / Start Menu, atau klik ikon di pojok kanan bawah (klik panah **^** kalau gak kelihatan).
- **Windows: status merah "Berhenti karena error"**: cek log di jendela Japri buat lihat masalahnya (mis. API key salah), terus klik **Coba jalanin lagi**.
- **Windows: QR gak kebuka di browser**: buka manual file `qr.html` di folder data (Start Menu → Japri - Buka folder data).
- **Windows: PC sleep**: bot gak jalan selama PC sleep. Atur di Settings → System → Power → Sleep: _Never_ kalau mau Japri nyala terus.

## ⚠️ Penting

Bot ini pakai [Baileys](https://github.com/WhiskeySockets/Baileys), library yang niru WhatsApp Web. Ini **bukan API resmi WhatsApp**, jadi ada risiko nomor bot di-ban. Pakai nomor khusus, jangan dipakai buat spam/broadcast, dan kasih tau anggota grup kalau ada bot pencatat. Bot yang aktif ngebales di grup rame (fitur jawab anggota grup) lebih rawan ditandai spam.

Japri gak berafiliasi dengan WhatsApp atau Meta.

---

## Buat developer

```
src/
  main.ts                 entry point: wizard → koneksi WA → scheduler
  bot.ts                  routing pesan: klaim owner, notif mention, perintah, keluar grup
  catchup.ts              "gue ketinggalan apa?": titik mulai per grup + transkrip semua grup
  digest.ts               digest harian (tiap hari / hari kerja) & mingguan, termasuk yang telat karena PC mati
  notify.ts               kirim ke owner + jam tenang (notif ditahan, dikirim gabungan)
  tasks.ts                tugas di notif mention → tawaran reminder ("ya" / jam lain)
  vision.ts               baca gambar jadi catatan teks (jatah harian, cek model bisa lihat gambar)
  selfupdate.ts           update sekali klik di Windows: download, cek checksum, pasang tanpa jendela
  scheduler.ts            kirim reminder, digest, notif yang ditahan, hapus pesan lama
  agent/agent.ts          prompt + riwayat obrolan
  agent/tools.ts          tools yang bisa dipanggil AI (provider-agnostik, pakai zod)
  llm/types.ts            interface LLM & Tool
  llm/anthropic.ts        adapter Claude (SDK resmi Anthropic)
  llm/openai-compatible.ts adapter OpenAI / Gemini / OpenRouter / Ollama / LM Studio
  wa/client.ts            koneksi Baileys & parsing pesan
  setup/wizard.ts         wizard di terminal
  desktop.ts              mode desktop Windows: QR di browser, cegah jalan dobel, status buat ikon tray
  updater.ts              cek rilis baru di GitHub, kabarin owner
  config.ts · db.ts · time.ts
site/                     landing page japri.rifaldirizqi.web.id (deploy ke VPS: docs/DEPLOY-LANDING.md)
deploy/landing/           script setup VPS + konfigurasi Caddy buat landing page
packaging/windows/        installer Windows: Japri.exe (Go, system tray + jendela setup), script Inno Setup, build.ps1
.github/workflows/        tiap push tag v*: installer Windows + image Docker (ghcr.io, amd64 & arm64)
test/                     tes routing bot & adapter AI (WhatsApp & AI di-mock)
docs/REQUIREMENTS*.md     requirement & scope tiap versi
```

- **Nambah kemampuan:** tambah satu `defineTool({...})` di `src/agent/tools.ts`. Otomatis jalan di semua provider.
- **Nambah provider:** kalau OpenAI-compatible, cukup tambah preset di `PROVIDERS` (`src/llm/index.ts`). Kalau beda format, implement interface `LLM`.
- **Tes:** `npm test` · `npm run typecheck`
- **Log detail:** `LOG_LEVEL=debug npm start`
- **Rilis:**
  1. Naikin `version` di `package.json` (bug fix: `0.1.0` → `0.1.1`, fitur baru: `0.2.0`).
  2. Tambahin bagian `## [x.y.z] - YYYY-MM-DD` di `CHANGELOG.md`, isinya poin-poin perubahan pakai bahasa user. Poin-poin ini dikirim ke owner tiap Japri lewat WhatsApp.
  3. Commit, terus push tag yang sama: `git tag v0.1.1 && git push origin v0.1.1`.

  GitHub Actions bakal build `JapriSetup-<versi>.exe`, bikin Release dengan catatan dari `CHANGELOG.md`, dan nempelin installer-nya. Dalam 24 jam, semua Japri yang cek update-nya nyala bakal ngabarin owner-nya. Workflow-nya juga bisa dijalanin manual dari tab Actions buat ngetes; hasilnya ada di Artifacts.
- **Fork:** cek update ngebaca repo dari field `repository` di `package.json`. Ganti ke repo lo sendiri biar user fork lo dapet kabar dari rilis lo.

## Lisensi

Kode Japri berlisensi [MIT](LICENSE).

Installer Windows dan image Docker juga berisi komponen pihak ketiga dengan lisensinya masing-masing, termasuk [libsignal](https://github.com/WhiskeySockets/libsignal-node) (dipakai Baileys) yang berlisensi GPL-3.0. Daftar dan teks lisensinya ada di [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).
