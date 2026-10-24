# Requirements — Japri

> Status: **v1, disepakati, MVP udah diimplementasi**. Fitur di luar MVP dicatat di bagian 6.

## 1. Konteks

Template open-source buat bikin **asisten pribadi di WhatsApp**. Satu instalasi = **satu owner + satu nomor bot**. Bot di-invite ke grup-grup owner, nyatet obrolan, terus bantu owner lewat DM.

Target: gue + circle. Tiap orang jalanin instance-nya sendiri, di **VPS atau PC pribadi**.

## 2. Siapa aja yang terlibat

| Peran | Siapa | Kebutuhan |
|---|---|---|
| **Owner** | Orang yang install & pakai bot. Lumayan melek teknologi tapi **bukan developer** | Setup tanpa ngoding, gak ketinggalan info penting di grup |
| **Anggota grup** | Orang lain di grup tempat bot di-invite | Tau ada bot pencatat, bisa minta bot keluar, gak diganggu bot |

## 3. Kebutuhan fungsional (MVP)

| # | Requirement | Kriteria selesai |
|---|---|---|
| F1 | **Install tanpa ngoding** | Cukup install Docker (atau Node), jalanin **satu perintah setup** (Docker: lanjut `docker compose up -d`), ikutin wizard di terminal (pilih provider AI, tempel API key), scan QR. Gak ada file yang perlu diedit manual. Target < 15 menit. |
| F2 | **Klaim owner** | Wizard nampilin kode setup. Owner DM kode itu ke bot, terus nomornya jadi owner. Gak perlu ngetik nomor di config. |
| F3 | **Setup & pengaturan lewat chat WA** | Nama panggilan, zona waktu, ganti model, dll diatur dengan ngobrol ke bot. Gak ada web dashboard. |
| F4 | **Catat pesan grup** | Semua pesan teks di grup tempat bot di-invite tersimpan. Media dicatat sebagai placeholder (`[gambar]`, `[voice note]`). |
| F5 | **Notif mention** | Ada yang tag owner, reply pesan owner, atau nyebut nama panggilan owner, bot DM owner dalam < 10 detik. |
| F6 | **Summary on-demand** | Owner minta rangkuman grup X untuk N jam terakhir, lewat DM atau tag bot di grup. |
| F7 | **Reminder** | Bisa sekali atau berulang (harian/mingguan), dikirim ke DM atau ke grup, pakai bahasa natural ("besok jam 9"). |
| F8 | **Cuma owner yang bisa merintah** | Pesan dari orang lain ke bot gak bikin bot ngelakuin apa-apa. |
| F9 | **Transparansi ke grup** | Pas masuk grup, bot ngenalin diri dan bilang dia mencatat. Admin grup bisa ketik "@bot keluar": bot keluar dan semua data grup itu dihapus. Kalau bot di-kick, datanya juga dihapus. |

## 4. Provider AI (agnostik)

| # | Requirement |
|---|---|
| P1 | Owner bisa pilih provider di wizard, dan bisa ganti kapan aja tanpa ngubah kode. |
| P2 | Provider yang didukung di MVP: **Anthropic (Claude)**, **OpenAI**, **Google Gemini**, **OpenRouter**, dan **model lokal** (Ollama / LM Studio). |
| P3 | Syarat minimal model: mendukung **tool calling**. Wizard ngetes koneksi + tool calling sebelum disimpan. |
| P4 | Wizard nampilin pilihan model. Claude: daftar model + harga. Provider lain: daftar diambil langsung dari endpoint `/models` provider, jadi gak pernah basi. |

**Pendekatan teknis yang diusulin:** dua adapter aja.
- **Anthropic** lewat SDK resmi.
- **OpenAI-compatible** lewat SDK OpenAI. Satu adapter ini udah nutup OpenAI, Gemini (endpoint OpenAI-compatible), OpenRouter, Ollama, dan LM Studio, cukup beda `base_url`.

Sisa kode (tools, prompt, logika bot) gak tau provider mana yang dipakai.

⚠️ Catatan: model lokal kecil sering jelek di tool calling dan bahasa Indonesia. Itu didukung, tapi gak direkomendasiin sebagai default.

## 5. Kebutuhan non-fungsional

| Area | Requirement |
|---|---|
| **Privasi** | Data cuma disimpan di mesin owner (SQLite lokal). Retensi default 30 hari, bisa diatur. Isi grup cuma dikirim ke provider AI pas dibutuhin (summary/perintah), gak dikirim tiap ada pesan masuk. |
| **Keamanan** | Isi pesan grup dianggap data, bukan perintah (anti prompt injection). Session WA & API key disimpan di folder data, gak ke-commit ke git. |
| **Biaya** | Owner pakai API key sendiri. README kasih estimasi biaya per bulan per provider. Notif mention gak pakai AI sama sekali (gratis). |
| **Keandalan** | Auto reconnect. Gak perlu scan ulang setelah restart. Kalau PC sempat mati, reminder yang kelewat dikirim pas nyala lagi (ditandai telat). Docker `restart: unless-stopped`. |
| **Platform** | Jalan di Linux VPS, Windows, dan macOS (lewat Docker), plus Raspberry Pi (ARM). Buat Windows ada installer `.exe` yang gak butuh Docker, Node, atau hak admin. |
| **Bahasa** | Default bahasa Indonesia santai, ikutin bahasa owner. |
| **Update** | Satu perintah (`docker compose pull && docker compose up -d`). Data & session tetap aman. |

## 6. Setelah MVP (belum dikerjain)

Digest harian · cari pesan lama · kirim pesan ke grup atas perintah owner · deteksi pertanyaan buat owner yang gak nge-tag · transkrip voice note · ngerti isi gambar.

## 7. Di luar scope

Banyak user di satu instance · web dashboard · billing · API resmi WhatsApp · aplikasi mobile.
