# Changelog

Catatan perubahan tiap versi Japri. Poin-poin di bawah tiap versi dipakai jadi catatan rilis di GitHub,
dan ringkasannya dikirim ke owner lewat WhatsApp waktu ada update.

Format tiap versi: `## [x.y.z] - YYYY-MM-DD`, terus daftar poin (`- ...`) pakai bahasa yang dimengerti user awam.

## [0.3.0] - 2026-10-25

- Tugas → reminder: notif yang isinya tugas (_"Ndi, kirim laporan Jumat ya"_) ditambahin _"Mau gue ingetin?"_. Bales *ya*, atau sebut jam lain. Bisa dimatiin: _"matiin saran reminder"_
- Baca gambar: poster, jadwal, dan struk di grup dibaca AI, terus ikut masuk rangkuman dan pencarian. Default mati, nyalain pakai _"baca gambar di semua grup"_
- Kirim gambar langsung ke Japri, mis. poster + _"ingetin gue acara ini"_
- Digest harian bisa hari kerja aja, plus digest mingguan: _"rangkuman mingguan tiap Minggu jam 7 malam"_
- Windows: mulai versi ini, update cukup bales *update* ke kabar versi baru. Japri download, pasang, dan nyala lagi sendiri
- Docker: image siap pakai, gak perlu build sendiri, jalan juga di Raspberry Pi. Update cukup `docker compose pull && docker compose up -d`

## [0.2.0] - 2026-10-25

- _"Gue ketinggalan apa?"_: satu pesan berisi rangkuman semua grup sejak terakhir lo nimbrung, plus bagian "Perlu perhatian lo"
- Digest harian: _"kirim rangkuman tiap jam 9 malam"_. Kalau gak ada obrolan baru, gak dikirim
- Cari pesan lama: _"siapa yang ngirim nomor rekening kemarin?"_, dijawab lengkap sama grup, pengirim, dan jamnya
- Atur notif per grup: semua, cuma kalau di-tag, atau mati. Contoh: _"matiin notif grup alumni"_
- Jam tenang: _"jangan ganggu jam 10 malam sampai 6 pagi"_. Notif ditahan, terus dikirim jadi satu pesan. Reminder tetap jalan
- Windows: jendela Japri yang baru, isinya status, nomor bot, model AI, tombol, dan log. Jendelanya boleh ditutup: Japri tetap jalan di system tray (ikon deket jam). Kalau crash, nyala ulang sendiri
- Windows: kalau WhatsApp nomor bot ke-logout, halaman QR langsung kebuka lagi buat scan ulang

## [0.1.0] - 2026-10-24

Rilis pertama 🎉

- Notif ke DM lo kalau di-tag, pesan lo dibales, atau nama panggilan lo disebut di grup
- Rangkuman grup: _"rangkum grup kantor 3 jam terakhir"_, lewat DM atau tag Japri di grup
- Reminder sekali atau berulang, ke DM atau ke grup
- Pengaturan lewat chat: nama panggilan, zona waktu, nama bot, model AI
- Bisa pakai Claude, OpenAI, Gemini, OpenRouter, atau model lokal (Ollama / LM Studio)
- Installer Windows, plus Docker dan Node.js
- Admin grup bisa ngeluarin Japri, dan catatan grup itu langsung dihapus
- Japri ngabarin lo kalau ada versi baru
