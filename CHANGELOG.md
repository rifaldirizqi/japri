# Changelog

Catatan perubahan tiap versi Japri. Poin-poin di bawah tiap versi dipakai jadi catatan rilis di GitHub,
dan ringkasannya dikirim ke owner lewat WhatsApp waktu ada update.

Format tiap versi: `## [x.y.z] - YYYY-MM-DD`, terus daftar poin (`- ...`) pakai bahasa yang dimengerti user awam.

## [0.2.0] - 2026-10-24

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
