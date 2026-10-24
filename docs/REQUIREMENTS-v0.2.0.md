# Requirements — Japri v0.2.0

> Status: **Disepakati semua (F1–F5), udah diimplementasi.**
> Requirement MVP (v0.1.0) ada di [REQUIREMENTS.md](REQUIREMENTS.md).

## 1. Tujuan

v0.1.0 udah nyelesain _"ngabarin kalau ada yang nyariin"_. v0.2.0 nyelesain sisa janji utamanya:
**"gak perlu baca ratusan chat"**, tanpa bikin Japri jadi sumber berisik baru.

Patokan sukses: owner yang seharian gak buka grup cukup baca **satu pesan dari Japri** buat tau apa yang penting.

## 2. Fitur

### F1. "Gue ketinggalan apa?" (catch-up)

Owner minta, Japri ngerangkum **semua grup** yang ada obrolan baru sejak terakhir kali owner ngikutin grup itu. Owner gak perlu nyebut nama grup atau jam.

| # | Requirement |
|---|---|
| F1.1 | Bisa dipanggil pakai bahasa biasa: _"gue ketinggalan apa?"_, _"ada apa aja di grup?"_, _"rangkum semua"_. Lewat DM atau tag Japri di grup. |
| F1.2 | **Titik mulai per grup** = yang paling baru dari: (a) pesan terakhir owner di grup itu, atau (b) catch-up/digest terakhir yang udah nyakup grup itu. |
| F1.3 | Titik mulai paling jauh **3 hari ke belakang**, biar gak kepanjangan dan gak mahal. Kalau owner belum pernah nimbrung di grup itu, mulai dari 24 jam terakhir. |
| F1.4 | Grup yang gak ada pesan baru dilewati. Kalau semuanya sepi, jawab singkat: _"Aman, gak ada yang baru."_ |
| F1.5 | Format: grup paling rame atau paling penting duluan, tiap grup 2–5 poin. Penutupnya bagian **"Perlu perhatian lo"**: pertanyaan atau tugas yang ditujuin ke owner, plus deadline. |
| F1.6 | Abis catch-up dikirim, titik mulai tiap grup maju ke saat itu, jadi catch-up berikutnya gak ngulang yang udah dibahas. |
| F1.7 | Grup rame banget dipotong ke ±300 pesan terakhir, dan Japri bilang kalau dipotong. |

### F2. Digest harian

Catch-up yang dikirim otomatis tiap hari di jam yang owner pilih.

| # | Requirement |
|---|---|
| F2.1 | **Default mati.** Owner nyalain lewat chat: _"kirim rangkuman tiap jam 9 malam"_. Matiin: _"stop digest"_. Pas klaim owner, Japri nawarin fitur ini sekali. |
| F2.2 | Isi dan cara kerjanya sama persis kayak F1, termasuk titik mulai per grup. Jadi kalau siangnya owner udah minta catch-up, digest malam cuma bahas yang baru setelah itu. |
| F2.3 | Kalau gak ada obrolan baru sama sekali, **gak ngirim apa-apa**. |
| F2.4 | Kalau PC mati di jam digest: dikirim pas nyala lagi kalau belum lewat 12 jam, ditandai telat. Lewat dari itu, dilewati (isinya kebawa ke digest berikutnya). |
| F2.5 | Setiap hari. Pilihan "hari kerja aja" ditunda ke versi berikutnya. |

### F3. Cari pesan lama

| # | Requirement |
|---|---|
| F3.1 | Owner nanya pakai bahasa biasa: _"siapa yang ngirim nomor rekening kemarin?"_, _"kapan deadline proposal?"_, _"Budi ngomong apa soal budget?"_ |
| F3.2 | AI nyari pakai kata kunci di semua grup (atau satu grup kalau disebut), dalam rentang simpan pesan (default 30 hari). Boleh nyoba beberapa kata kunci. |
| F3.3 | Jawaban nyebut **sumbernya**: grup, nama pengirim, tanggal & jam. Kalau gak ketemu, bilang gak ketemu, jangan ngarang. |
| F3.4 | Batasan yang dijelasin ke owner kalau relevan: cuma pesan teks, cuma sejak Japri masuk grup, cuma dalam rentang simpan. |

### F4. Atur notif per grup + jam tenang

| # | Requirement |
|---|---|
| F4.1 | Tiap grup punya **mode notif**, diatur lewat chat (_"matiin notif grup alumni"_): **semua** (default: tag, reply, dan nama panggilan), **cuma tag & reply**, atau **mati**. |
| F4.2 | Mode notif cuma ngaruh ke notif. Grup yang notifnya mati **tetap** dicatat dan **tetap** masuk catch-up/digest. |
| F4.3 | **Jam tenang**: _"jangan ganggu jam 10 malam sampai 6 pagi"_. Default mati. |
| F4.4 | Notif yang muncul selama jam tenang **ditahan**, terus dikirim jadi **satu pesan gabungan** pas jam tenang selesai: _"📬 Selama jam tenang, ada 3 yang nyariin lo: …"_ |
| F4.5 | Reminder **tetap** dikirim di jam tenang, karena owner sendiri yang masang jamnya. Kabar update ditahan sampai jam tenang selesai. |
| F4.6 | _"Notif gue gimana?"_ nampilin mode tiap grup + jam tenang. |

### F5. Jendela Japri + system tray (Windows)

Di v0.1.0, Japri jalan di jendela hitam yang gak boleh ditutup. Buat user awam itu rawan: sekali ketutup, bot mati tanpa mereka sadar. v0.2.0 ngasih Japri **jendela sendiri** yang bisa ditutup kapan aja, karena Japri tetap jalan di **system tray** (ikon kecil di pojok kanan bawah, deket jam).

| # | Requirement |
|---|---|
| F5.1 | Japri punya jendela sendiri, isinya: **status** (jalan normal / lagi nyambung / butuh perhatian), **nomor bot**, **model AI**, tombol **Ganti pengaturan AI**, **Buka folder data**, **Keluar**, dan **log** di bawahnya. |
| F5.2 | Jendelanya kebuka kalau Japri dibuka dari ikon Desktop / Start Menu, atau ikon tray-nya diklik. |
| F5.3 | Tombol **X** atau minimize → jendela **sembunyi ke tray**, bot tetap jalan. Pertama kali, muncul notifikasi _"Japri masih jalan di tray"_. |
| F5.4 | Pas autostart waktu Windows nyala, Japri langsung ke tray **tanpa** buka jendela. |
| F5.5 | Ikon tray nunjukin status yang sama (beda warna), plus tulisan statusnya kalau mouse diarahin ke ikon. Klik kanan → menu: status · **Buka Japri** · **Ganti pengaturan AI** · **Buka folder data** · **Keluar**. |
| F5.6 | **Setup pertama** (wizard, API key, scan QR, kode setup) tetap pakai jendela console kayak sekarang, karena butuh tempat ngetik. Abis setup selesai, jendela console ketutup sendiri dan jendela Japri kebuka. |
| F5.7 | Kalau WhatsApp minta scan QR ulang: notifikasi Windows, halaman QR kebuka di browser, dan di jendela Japri muncul tombol **Buka halaman QR**. |
| F5.8 | Kalau bot-nya crash, Japri nyoba nyalain ulang sendiri. Kalau gagal terus (3× dalam 5 menit), status jadi "butuh perhatian", plus notifikasi Windows dan tombol **Coba jalanin lagi**. |
| F5.9 | Japri cuma berhenti kalau dipilih **Keluar** (tombol di jendela atau menu tray), atau pas Windows dimatiin. |
| F5.10 | Tetap cuma satu Japri yang jalan. Kalau dibuka lagi pas udah jalan, jendela Japri yang udah ada dimunculin. |
| F5.11 | Docker & Node.js gak berubah. Fitur ini khusus installer Windows. |

## 3. Kebutuhan non-fungsional

| Area | Requirement |
|---|---|
| **Biaya** | F1 & F2 manggil AI sekali per permintaan (bukan sekali per grup), dengan transkrip yang dipotong (F1.7). Perkiraan dicantumin di README. F3 dan F4 hampir gak nambah biaya. |
| **Kompatibel** | Update dari v0.1.0 jalan otomatis: database & config lama dimigrasi sendiri, gak perlu setup ulang atau scan QR. |
| **Privasi** | Gak ada data baru yang dikirim ke AI selain transkrip grup yang memang diminta dirangkum atau dicari. |
| **Provider** | Tetap jalan di semua provider yang didukung v0.1.0. Gak butuh model atau layanan tambahan. |
| **Tes** | Tiap fitur ada tes otomatisnya, terutama titik mulai catch-up (F1.2/F1.6), digest yang telat (F2.4), dan jam tenang yang lewat tengah malam (F4.3). Tray (F5) dites lewat build di Windows (GitHub Actions) plus percobaan manual di PC owner. |
| **Dokumentasi** | README, landing page (bagian Fitur), dan `CHANGELOG.md` diupdate. |

## 4. Di luar scope v0.2.0

Transkrip voice note · baca gambar · reminder otomatis dari obrolan · kirim pesan ke grup atas nama owner · digest mingguan · pencarian berdasarkan makna (bukan kata kunci).

## 5. Keputusan

Disepakati:

1. Catch-up paling jauh 3 hari ke belakang (F1.3).
2. Grup yang notifnya mati tetap masuk rangkuman (F4.2).
3. Notif selama jam tenang ditahan, terus dikirim jadi satu pesan (F4.4).
4. Digest yang telat dikirim kalau belum lewat 12 jam (F2.4).
5. Opsi digest "hari kerja aja" ditunda (F2.5).
6. F5: Japri punya jendela (status + tombol + log). Tombol X nyembunyiin ke tray, bukan matiin (F5.3). Setup pertama tetap pakai jendela console (F5.6), dan crash otomatis dinyalain ulang (F5.8).
