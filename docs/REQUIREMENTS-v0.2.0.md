# Requirements — Japri v0.2.0

> Status: **draf, buat didiskusiin**. Bagian bertanda ❓ belum diputusin.
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
| F1.3 | Titik mulai paling jauh **3 hari ke belakang** ❓, biar gak kepanjangan dan gak mahal. Kalau owner belum pernah nimbrung di grup itu, mulai dari 24 jam terakhir. |
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
| F2.4 | Kalau PC mati di jam digest: dikirim pas nyala lagi kalau belum lewat 12 jam ❓, ditandai telat. Lewat dari itu, dilewati. |
| F2.5 | Setiap hari. (Pilihan "hari kerja aja" ditunda ❓) |

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
| F4.2 | Mode notif cuma ngaruh ke notif. Grup yang notifnya mati **tetap** dicatat dan **tetap** masuk catch-up/digest ❓. |
| F4.3 | **Jam tenang**: _"jangan ganggu jam 10 malam sampai 6 pagi"_. Default mati. |
| F4.4 | Notif yang muncul selama jam tenang **ditahan**, terus dikirim jadi **satu pesan gabungan** pas jam tenang selesai ❓: _"📬 Selama jam tenang, ada 3 yang nyariin lo: …"_ |
| F4.5 | Reminder **tetap** dikirim di jam tenang, karena owner sendiri yang masang jamnya. Kabar update ditahan sampai jam tenang selesai. |
| F4.6 | _"Notif gue gimana?"_ nampilin mode tiap grup + jam tenang. |

## 3. Kebutuhan non-fungsional

| Area | Requirement |
|---|---|
| **Biaya** | F1 & F2 manggil AI sekali per permintaan (bukan sekali per grup), dengan transkrip yang dipotong (F1.7). Perkiraan dicantumin di README. F3 dan F4 hampir gak nambah biaya. |
| **Kompatibel** | Update dari v0.1.0 jalan otomatis: database & config lama dimigrasi sendiri, gak perlu setup ulang atau scan QR. |
| **Privasi** | Gak ada data baru yang dikirim ke AI selain transkrip grup yang memang diminta dirangkum atau dicari. |
| **Provider** | Tetap jalan di semua provider yang didukung v0.1.0. Gak butuh model atau layanan tambahan. |
| **Tes** | Tiap fitur ada tes otomatisnya, terutama titik mulai catch-up (F1.2/F1.6), digest yang telat (F2.4), dan jam tenang yang lewat tengah malam (F4.3). |
| **Dokumentasi** | README, landing page (bagian Fitur), dan `CHANGELOG.md` diupdate. |

## 4. Di luar scope v0.2.0

Transkrip voice note · baca gambar · reminder otomatis dari obrolan · kirim pesan ke grup atas nama owner · digest mingguan · pencarian berdasarkan makna (bukan kata kunci).

## 5. Keputusan yang belum diambil

1. **F1.3:** batas maksimal catch-up 3 hari, oke? Atau mau lebih panjang (lebih lengkap, tapi lebih mahal)?
2. **F4.2:** grup yang notifnya dimatiin tetap masuk rangkuman? Atau perlu pilihan terpisah buat "abaikan grup ini sepenuhnya"?
3. **F4.4:** notif selama jam tenang digabung dan dikirim pas jam tenang selesai, atau dibuang aja (cukup dibaca lewat catch-up)?
4. **F2.4:** digest yang telat karena PC mati: tetap dikirim kalau belum lewat 12 jam, atau langsung dilewati aja?
5. **F2.5:** perlu opsi digest "hari kerja aja" sekarang, atau nanti?
