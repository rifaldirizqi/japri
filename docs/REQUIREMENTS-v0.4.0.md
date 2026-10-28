# Requirements — Japri v0.4.0

> Status: **Disepakati.** Keputusan lengkapnya di [bagian 5](#5-keputusan).
> Requirement sebelumnya: [v0.1.0](REQUIREMENTS.md) · [v0.2.0](REQUIREMENTS-v0.2.0.md) · [v0.3.0](REQUIREMENTS-v0.3.0.md).

## 1. Tujuan

Sampai v0.3.x, Japri cuma nurut sama owner. Tag dari anggota grup lain dicuekin. v0.4.0 nambahin opsi supaya Japri bisa **jawab siapa aja di grup sebagai AI umum** (tanya jawab biasa, kayak ChatGPT), tanpa ngebuka akses ke catatan grup atau fitur owner.

Patokan sukses:
- Owner cukup bilang _"jawab semua orang di grup kantor"_, dan anggota grup itu bisa tag Japri buat nanya apa aja.
- Anggota **gak bisa** baca catatan grup, ngerangkum, bikin reminder, atau ngubah pengaturan. Semua fitur itu tetap cuma buat owner.
- Biaya AI anggota bisa dipisah dari AI owner: provider, API key, dan model sendiri.

## 2. Fitur

### F1. Mode "jawab semua orang" per grup

| # | Requirement |
|---|---|
| F1.1 | Opsi baru, **default mati**. Bisa dinyalain buat semua grup atau per grup. Pengaturan per grup bisa ikut semua grup, selalu nyala, atau selalu mati (pola yang sama kayak baca gambar). |
| F1.2 | Pemicu buat anggota: **tag Japri**, **bales pesan Japri**, atau awali pesan dengan **`/ai`**. Pesan lain gak dikirim ke AI. |
| F1.3 | Owner gak berubah: tag/`/ai` dari owner tetap ke AI owner dengan semua tool-nya (rangkum, reminder, pengaturan). |
| F1.4 | **DM dari selain owner tetap diabaikan.** Mode ini cuma berlaku di grup. |
| F1.5 | _"@Japri keluar"_ tetap bisa dipakai siapa aja, kayak sekarang. |
| F1.6 | Grup yang mode-nya mati: tag dari anggota tetap dicuekin, kayak sekarang. |

### F2. AI anggota

| # | Requirement |
|---|---|
| F2.1 | AI terpisah dari AI owner (`agent/public.ts`): **tanpa tool sama sekali**. Gak bisa baca catatan grup, cari pesan, bikin reminder, atau ngubah pengaturan. |
| F2.2 | Prompt sendiri: Japri ngenalin diri sebagai asisten AI umum di grup ini, jawab singkat pakai format WhatsApp, dan kalau ditanya soal isi obrolan grup atau minta dirangkum, jawab jujur kalau itu cuma bisa diminta owner. |
| F2.3 | Riwayat obrolan **per grup**, terpisah dari riwayat owner, jadi anggota bisa nanya lanjutan (_"terus yang kedua gimana?"_). Isinya cuma tanya jawab anggota dengan Japri di grup itu, dibatasi **10 giliran terakhir atau 2 jam terakhir**, mana yang lebih pendek. |
| F2.4 | Kalau anggota bales pesan orang lain sambil nge-tag Japri (_"@Japri ini maksudnya apa?"_), pesan yang dibales ikut dikirim sebagai konteks. Itu satu-satunya isi grup yang dilihat AI anggota. |
| F2.5 | Jawaban dikirim sebagai balasan (quote) ke pesan penanya, supaya jelas buat siapa. |
| F2.6 | Isi pertanyaan anggota tetap dicatat kayak pesan grup biasa (ikut rangkuman owner). Jawaban Japri ke anggota gak ikut dirangkum. |

### F3. Provider AI anggota

| # | Requirement |
|---|---|
| F3.1 | AI anggota punya pengaturan sendiri: **provider, API key, base URL, dan model**, disimpan di `publicReplies.llm`, terpisah dari `llm` milik owner. |
| F3.2 | Kalau provider-nya sama dengan owner, API key boleh dikosongin: key owner yang dipakai (ikut berubah kalau key owner diganti). |
| F3.3 | Pas disimpan, model dites dulu: cukup bisa jawab satu pesan (gak perlu tool calling). Jadi model gratis atau lokal (mis. OpenRouter `:free`, Ollama) bisa dipakai. Gagal tes = gak disimpan. |
| F3.4 | Mode F1 **gak bisa dinyalain** sebelum AI anggota diatur dan lolos tes. Japri bilang ke owner apa yang kurang. |
| F3.5 | Kalau AI anggota error (key salah, kredit habis, server mati): anggota dapet balasan singkat _"Lagi gak bisa jawab, coba lagi nanti ya."_ Owner dikabarin sekali lewat DM, terus gak dikabarin lagi sampai AI anggota jalan normal lagi. |

### F4. Jatah & pengaman

| # | Requirement |
|---|---|
| F4.1 | **Default tanpa batas**: anggota boleh nanya sebanyak apa pun. |
| F4.2 | Owner bisa nyalain jatah kalau perlu (default mati): maksimal pertanyaan per orang per hari dan/atau per grup per hari. Lewat jatah = dibales sekali _"Jatah tanya hari ini udah habis, besok lagi ya."_, terus dicuekin sampai besok. |
| F4.3 | **Jeda pengaman** biar nomor bot gak rawan diblokir WhatsApp: tiap grup dijawab berurutan (satu pertanyaan selesai baru yang berikutnya), dengan jeda minimal **3 detik** antar balasan di grup yang sama. Ini bukan jatah; semua pertanyaan tetap dijawab, cuma gak beruntun. |
| F4.4 | Jawaban dipotong kalau kepanjangan (batas karakter wajar buat WhatsApp), dengan tanda kalau dipotong. |
| F4.5 | Pemakaian dihitung per grup per hari (jumlah pertanyaan yang dijawab, plus token kalau provider ngasih). Ditampilin di Pengaturan dan bisa ditanya owner: _"AI anggota kepake berapa minggu ini?"_. |
| F4.6 | Japri gak pernah ngebales pesan dari bot lain atau dari dirinya sendiri, biar gak muter-muter. |

### F5. Pengaturan

| # | Requirement |
|---|---|
| F5.1 | Lewat chat (owner): _"jawab semua orang di grup kantor"_, _"jawab semua orang di semua grup"_, _"matiin AI anggota di grup alumni"_, _"AI anggota pakai model X"_, _"batasi AI anggota 20 pertanyaan per orang sehari"_. Lewat tool baru di `settings.ts`, aturannya sama dengan jendela Pengaturan. |
| F5.2 | Jendela Pengaturan (Windows): bagian baru **"AI buat anggota"** dengan form kayak bagian AI (provider, API key, model, _Tes & simpan_), sakelar semua grup, jatah, dan pemakaian. Di bagian Grup ada kolom baru per grup: ikut semua / nyala / mati. |
| F5.3 | Docker & Node: lewat chat cukup buat _"AI anggota pakai provider owner, model X"_. API key gak pernah diketik di chat, biar gak nyangkut di riwayat WhatsApp. Buat provider/key yang beda, `setup` (`npm start setup` / `docker compose run --rm japri setup`) dapet satu langkah opsional "AI buat anggota". |
| F5.4 | Pas mode ini dinyalain buat suatu grup, Japri ngumumin sekali di grup itu: _"Sekarang kalian bisa nanya apa aja ke gue: tag gue, bales pesan gue, atau awali dengan /ai. Gue gak bisa baca isi obrolan grup ini buat kalian."_ Pas dimatiin, gak ada pengumuman. |

### F6. Teks & dokumentasi

| # | Requirement |
|---|---|
| F6.1 | Teks perkenalan Japri di grup (`groupIntro`) nyebutin mode ini kalau nyala buat grup itu. |
| F6.2 | FAQ landing page _"Orang lain bisa nyuruh-nyuruh Japri gue?"_ diupdate: tetap gak bisa nyuruh fitur owner, tapi owner bisa ngizinin anggota grup nanya ke AI umum. |
| F6.3 | README: cara nyalain, beda AI owner vs AI anggota, dan catatan soal biaya & risiko blokir WhatsApp. |

## 3. Kebutuhan non-fungsional

| Area | Requirement |
|---|---|
| **Keamanan** | AI anggota gak punya tool dan gak dikasih isi catatan grup, jadi gak ada cara buat anggota ngebaca obrolan lewat Japri, termasuk lewat prompt injection. Prompt owner dan prompt anggota gak pernah dicampur. API key AI anggota gak pernah dikirim ke halaman Pengaturan (sama kayak key owner). |
| **Biaya** | Satu panggilan AI per pertanyaan anggota. Tanpa batas secara default, jadi README dan pengumuman di Pengaturan bilang jelas kalau biayanya ditanggung API key yang dipasang. Jatah (F4.2) disediain buat jaga-jaga. |
| **Risiko WhatsApp** | Bot yang aktif ngebales di grup ramai lebih rawan ditandai spam. Jeda pengaman (F4.3) wajib, dan risikonya ditulis di README. |
| **Privasi** | Pertanyaan anggota dikirim ke penyedia AI anggota. Pengumuman (F5.4) dan intro grup (F6.1) nyebut ini. |
| **Kompatibel** | Update dari v0.3.x jalan otomatis: config dan database dimigrasi sendiri, mode ini mati sampai owner nyalain. |
| **Provider** | AI anggota jalan di semua provider yang didukung, termasuk model tanpa tool calling. |
| **Tes** | Tes otomatis buat: pemicu (tag, reply ke bot, `/ai`) vs pesan biasa, owner tetap ke AI owner, DM anggota diabaikan, mode per grup (ikut/nyala/mati), AI anggota gak dapet tool, riwayat per grup terpisah, error → balasan singkat + owner dikabarin sekali, jatah, jeda/antrian per grup, dan API Pengaturan (key gak bocor, tes model). AI di-mock. |
| **Dokumentasi** | README, landing page, dan `CHANGELOG.md` diupdate. |

## 4. Di luar scope v0.4.0

Anggota minta rangkuman/catch-up grup · AI anggota pakai tool (cari web, reminder buat anggota) · bales DM dari selain owner · baca gambar yang dikirim anggota ke AI anggota · jatah per orang yang bisa dibeli/di-top-up.

## 5. Keputusan

Disepakati:

1. **Cuma di grup.** DM dari selain owner tetap diabaikan (F1.4).
2. Anggota **gak bisa** minta rangkuman atau baca catatan grup; AI anggota **tanpa tool** (F2.1).
3. **Tanpa batas** secara default (F4.1). Jatah tersedia sebagai opsi yang default-nya mati (F4.2), plus jeda pengaman antar balasan (F4.3).
4. AI anggota **terpisah penuh**: provider, API key, base URL, dan model sendiri (F3.1), dengan opsi pakai key owner kalau provider-nya sama (F3.2).
5. Mode ini **default mati**, bisa per grup atau semua grup (F1.1).
6. Docker & Node ngatur AI anggota lewat chat (provider owner) atau langkah opsional di `setup` (provider/key beda) (F5.3).
7. Jeda pengaman **3 detik** antar balasan per grup (F4.3).
8. Riwayat AI anggota **10 giliran atau 2 jam terakhir**, mana yang lebih pendek (F2.3).
