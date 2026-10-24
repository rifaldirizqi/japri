# Aturan repo Japri

Repo ini **public**. Semua yang masuk ke sini (file, commit, pesan commit, PR, issue, komentar, log Actions) bisa dibaca siapa aja dan tetap kesimpen walaupun nanti dihapus: di history git, di clone orang, di fork, di cache GitHub. Jadi yang private jangan pernah masuk sama sekali, bukan "masuk dulu, hapus belakangan".

## Jangan pernah di-commit

### 1. Rahasia
- API key AI (Anthropic, OpenAI, Gemini, OpenRouter, dll.), token, password.
- Private SSH key, termasuk key deploy landing page (`VPS_SSH_KEY`).
- Isi GitHub Secrets apa pun.
- File `.env` (kecuali `.env.example` yang isinya placeholder).

### 2. Data runtime Japri (folder `data/`)
- `data/auth/`: sesi login WhatsApp nomor bot. Siapa pun yang pegang ini bisa pakai akun WhatsApp-nya.
- `data/agent.db`: isi obrolan grup yang dicatat bot.
- `data/config.json`: API key + pengaturan owner.
- `data/qr.html`, `data/japri.lock`, dan file lain di `data/`.

Kalau `DATA_DIR` diarahkan ke tempat lain, aturannya sama.

### 3. Data pribadi orang
- Nomor HP asli, JID WhatsApp asli (`628…@s.whatsapp.net`, `…@lid`), ID grup (`…@g.us`).
- Nama grup, nama anggota, atau potongan obrolan asli.
- Screenshot atau log yang nampilin hal-hal di atas.

Buat tes dan contoh, pakai data palsu: `6280000000000@s.whatsapp.net`, `120363000000000000@g.us`, nama kayak "Andi" atau "Grup Kantor".

### 4. Detail server/VPS
- IP VPS, port SSH, username server selain default yang udah ada di repo.
- Aplikasi atau subdomain lain yang jalan di server yang sama.
- Nama provider hosting/DNS, catatan status atau progres setup server.
- Port internal, config aplikasi lain, isi Caddyfile/nginx di server.
- Backup, dump database, dan log server.

## Yang boleh

- Domain landing page `japri.rifaldirizqi.web.id`. Itu homepage proyek, udah publik.
- Nilai default generik yang bisa diganti: `/var/www/japri`, user `japri-deploy`, `/etc/caddy/Caddyfile`.
- Placeholder: `IP_VPS`, `ISI_JAPRI_DEPLOY_PUB`, `example.com`, `sk-...` (bukan key beneran).

Docs ditulis buat siapa aja yang mau deploy Japri sendiri, bukan catatan soal server pribadi. Catatan kayak gitu simpen di luar repo: di catatan pribadi, atau di server-nya sendiri.

## Sebelum commit

1. Cek apa aja yang mau masuk: `git status` dan `git diff --cached`. Jangan pakai `git add -A` tanpa ngecek dulu.
2. Cari pola yang mencurigakan di perubahan yang di-stage:

   ```bash
   git diff --cached | grep -nE '([0-9]{1,3}\.){3}[0-9]{1,3}|BEGIN [A-Z ]*PRIVATE KEY|sk-(ant-)?[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{30,}|@s\.whatsapp\.net|@g\.us|@lid\b|\b62[0-9]{9,13}\b'
   ```

   Kalau ada hasil, cek satu-satu. Data palsu dari tes atau placeholder boleh; selain itu keluarin dari commit.
3. Pesan commit dan deskripsi PR juga public: jangan tulis IP, nama server, atau detail kayak di atas.

## Kalau kebocoran

1. **Ganti rahasianya dulu**, langsung: bikin API key baru, cabut yang lama, logout sesi WhatsApp bot dari HP (Perangkat tertaut), bikin SSH key deploy baru (`sudo bash setup-vps.sh`). Hapus commit doang gak cukup, karena yang udah ke-push dianggap udah bocor.
2. Baru setelah itu hapus dari repo.
