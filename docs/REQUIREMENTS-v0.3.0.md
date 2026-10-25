# Requirements — Japri v0.3.0

> Status: **Disepakati.** Keputusan lengkapnya di [bagian 5](#5-keputusan).
> Requirement sebelumnya: [v0.1.0](REQUIREMENTS.md) · [v0.2.0](REQUIREMENTS-v0.2.0.md).

## 1. Tujuan

v0.2.0 bikin owner gak perlu baca ratusan chat. v0.3.0 bikin Japri **bantu nindaklanjutin isinya**: tugas buat owner gak kelewat, info yang dikirim dalam bentuk gambar ikut kebaca, dan Japri gampang diupdate sama user awam.

Patokan sukses:
- Owner yang dapet tugas di grup cukup bales **"ya"** buat diingetin.
- Poster atau jadwal yang dikirim dalam bentuk gambar ikut masuk rangkuman dan bisa dicari.
- Update Japri cukup bales **"update"** di WhatsApp, tanpa buka installer.

## 2. Fitur

### F1. Tugas → tawaran reminder

Pas ada pesan di grup yang ditujuin ke owner dan isinya tugas atau deadline, Japri nawarin bikin reminder langsung di notif-nya.

| # | Requirement |
|---|---|
| F1.1 | Cuma dicek buat pesan yang udah bikin notif ke owner (tag, reply, atau nama panggilan, sesuai mode notif grup). Pesan lain gak dikirim ke AI. |
| F1.2 | Kalau isinya permintaan atau tugas buat owner (_"Ndi, tolong kirim laporan Jumat ya"_), notif-nya ditambahin satu baris: _"📌 Mau gue ingetin **Jum, 30 Okt 09:00**? Bales *ya*, sebut jam lain, atau abaikan aja."_ |
| F1.3 | Waktu yang ditawarin diambil dari isi pesan ("Jumat", "besok sore", "tgl 5"). Kalau gak ada petunjuk waktu: tawarin **besok jam 09:00**. |
| F1.4 | Owner bales _"ya"_ → reminder dibuat, isinya tugas tadi plus nama grup dan pengirimnya. Bales jam lain (_"kamis jam 8 aja"_) → pakai jam itu. Diabaikan → gak terjadi apa-apa. |
| F1.5 | Notif gak boleh jadi lama gara-gara ini. Kalau AI belum jawab dalam ±10 detik atau error, notif dikirim tanpa tawaran. |
| F1.6 | Selama jam tenang, tawaran ikut ditahan di pesan gabungan. Tiap notif dikasih nomor, jadi owner bisa bales _"ingetin yang nomor 2"_. |
| F1.7 | Bisa dimatiin/dinyalain lewat chat: _"matiin saran reminder"_. Default: **nyala**. |
| F1.8 | Bagian _"Perlu perhatian lo"_ di catch-up/digest juga bisa langsung dijadiin reminder: _"ingetin poin pertama besok pagi"_. |

### F2. Update sekali klik (Windows)

| # | Requirement |
|---|---|
| F2.1 | Kabar versi baru ditambahin: _"Bales *update* buat update sekarang."_ Owner juga bisa bilang _"update Japri"_ kapan aja. |
| F2.2 | Japri download installer versi terbaru dari GitHub Release repo ini, terus ngecek file-nya utuh (ukuran + checksum SHA-256 dari GitHub). Kalau gak cocok, batal dan kabarin owner. |
| F2.3 | Installer dijalanin tanpa jendela. Japri berhenti bentar (±1 menit), ke-update, terus nyala lagi sendiri di tray. Data, session WhatsApp, dan pengaturan tetap aman. |
| F2.4 | Abis nyala lagi, Japri DM owner: _"✅ Udah update ke v0.3.1"_. Kalau gagal, versi lama tetap jalan, dan owner dapet pesan error plus link download manual. |
| F2.5 | Cuma owner yang bisa nyuruh update. Update **selalu nunggu perintah owner**; update otomatis tanpa nanya ditunda. |
| F2.6 | Docker & Node: _"update"_ dibales instruksi update manual sesuai cara install-nya (kayak sekarang). |
| F2.7 | Catatan: fitur ini baru kepake buat update **dari** v0.3.0 ke versi berikutnya. Update dari v0.2.0 ke v0.3.0 masih pakai installer. |

### F3. Baca gambar

| # | Requirement |
|---|---|
| F3.1 | Gambar di grup (poster, jadwal, screenshot, struk) dibaca AI jadi deskripsi singkat plus teks yang ada di gambarnya. Disimpan sebagai catatan teks, mis. `[gambar: poster buka bersama, Sabtu 7 Nov 18:00, Resto Andalas]`. |
| F3.2 | Hasilnya ikut masuk rangkuman, catch-up, digest, dan pencarian (_"jam berapa acara di poster kemarin?"_). |
| F3.3 | **Default mati**, karena ini ngirim data baru (gambar) ke penyedia AI. Owner nyalain lewat chat: _"baca gambar di semua grup"_ atau _"baca gambar di grup kantor aja"_. |
| F3.4 | Stiker, GIF, dan gambar sekali lihat dilewati. Paling banyak **100 gambar per hari**; lewat dari itu dicatat `[gambar]` aja kayak sekarang. |
| F3.5 | File gambarnya gak disimpan; yang disimpan cuma catatan teksnya. |
| F3.6 | Gambar yang owner kirim langsung ke DM bot selalu dibaca (owner sendiri yang ngirim), mis. kirim poster + _"ingetin gue acara ini"_. |
| F3.7 | Pas dinyalain, Japri ngecek model AI-nya bisa baca gambar. Kalau gak bisa (sebagian model lokal / OpenRouter), bilang ke owner dan sarankan model lain. |

### F4. Digest hari kerja & mingguan

| # | Requirement |
|---|---|
| F4.1 | Digest harian bisa diset **hari kerja aja** (Senin–Jumat): _"kirim rangkuman tiap hari kerja jam 9 malam"_. |
| F4.2 | **Digest mingguan**, default mati: _"kirim rangkuman mingguan tiap Minggu jam 7 malam"_. Isinya ringkasan 7 hari: topik besar per grup, keputusan, dan hal yang masih nunggu respon owner. |
| F4.3 | Digest mingguan gak ngubah titik mulai catch-up/digest harian. Itu gambaran besar, bukan pengganti. |
| F4.4 | Biar biaya tetap kecil, transkrip mingguan tiap grup dipotong, dan Japri bilang kalau dipotong. Perkiraan biayanya dicantumin di README. |
| F4.5 | Aturan telat sama kayak digest harian: dikirim kalau belum lewat 12 jam, ditandai telat. Kalau gak ada obrolan sama sekali, gak dikirim. |

### F5. Image Docker siap pakai (kalau sempet)

| # | Requirement |
|---|---|
| F5.1 | Tiap rilis, image Docker di-build otomatis ke GitHub Packages: `ghcr.io/rifaldirizqi/japri:latest` dan `:0.3.0`. |
| F5.2 | Jalan di PC/VPS biasa (amd64) **dan** Raspberry Pi / VPS ARM (arm64). |
| F5.3 | `docker-compose.yml` pakai image itu, jadi gak perlu build sendiri. Update cukup `docker compose pull && docker compose up -d`. |
| F5.4 | Package-nya perlu diset public sekali di GitHub (dikerjain owner repo, karena gak bisa diubah dari workflow). |

## 3. Kebutuhan non-fungsional

| Area | Requirement |
|---|---|
| **Biaya** | F1: satu panggilan AI kecil per notif (cuma pesan yang emang buat owner). F3: satu panggilan per gambar, dibatasi per hari. F4: sekali per digest. Perkiraan per fitur dicantumin di README. |
| **Kompatibel** | Update dari v0.2.0 jalan otomatis: database & config dimigrasi sendiri, gak perlu setup ulang atau scan QR. |
| **Privasi** | Gambar cuma dikirim ke AI kalau owner nyalain (F3.3). Intro Japri di grup dan README nyebut kalau gambar dibaca AI. |
| **Provider** | F1, F2, F4 jalan di semua provider. F3 butuh model yang bisa baca gambar. Kalau gak bisa, fitur lain tetap jalan. |
| **Keamanan update** | Installer cuma diambil dari GitHub Release repo di `package.json`, dicek checksum-nya, dan cuma owner yang bisa nyuruh update. |
| **Tes** | Tes otomatis buat: deteksi tugas & parsing waktu (AI di-mock), bales "ya"/jam lain, tawaran di pesan gabungan jam tenang, verifikasi checksum, batas gambar per hari, jadwal hari kerja & mingguan. Update sekali klik dites lewat build Windows plus percobaan manual di PC owner. |
| **Dokumentasi** | README, landing page, dan `CHANGELOG.md` diupdate. |

## 4. Di luar scope v0.3.0

Transkrip voice note (butuh layanan speech-to-text terpisah) · bales ke grup atas nama owner · pencarian berdasarkan makna · update otomatis tanpa nanya · versi desktop Mac/Linux.

## 5. Keputusan

Disepakati:

1. Tugas tanpa petunjuk waktu tetap ditawarin, default **besok 09:00** (F1.3).
2. Saran reminder **nyala** dari awal, bisa dimatiin (F1.7).
3. Update **selalu nunggu perintah owner** (F2.5).
4. Baca gambar **default mati**, dinyalain owner per grup atau semua grup (F3.3).
5. Batas **100 gambar per hari** (F3.4).
6. Image Docker buat **amd64 + arm64** (F5.2), masuk v0.3.0 kalau waktunya cukup.
