# Deploy landing page ke VPS

Landing page Japri (folder `site/`) di-deploy otomatis ke VPS tiap ada perubahan di `site/` yang di-push ke `main`. Tiap rilis baru, workflow installer Windows juga memicu deploy ini supaya `latest.json` (versi terbaru, link & checksum installer di GitHub Releases) ikut ke-update. File itu dibaca Japri buat cek update dan tombol download di landing page.
Caranya: GitHub Actions upload file pakai `rsync` lewat SSH, terus Caddy nyajiin halamannya dengan HTTPS otomatis.

Setup ini cukup sekali. Butuh: VPS Ubuntu/Debian dengan Caddy terpasang langsung di host (bukan di container), plus akses `sudo`. Caddy pegang port 80 & 443, dan landing page dapet blok situs sendiri di `/etc/caddy/Caddyfile`.

```
browser ──HTTPS :443──▶ Caddy (host, /etc/caddy/Caddyfile) ──blok japri.…──▶ /var/www/japri
```

Situs lain di VPS yang sama tetap aman: masing-masing punya blok sendiri di Caddyfile.

## Cara cepat (disarankan)

1. Bikin record DNS (langkah 1 di bawah).
2. SSH ke VPS, terus jalanin:

   ```bash
   curl -fsSLO https://raw.githubusercontent.com/rifaldirizqi/japri/main/deploy/landing/setup-vps.sh
   less setup-vps.sh        # baca dulu isinya, tekan q buat keluar
   sudo bash setup-vps.sh
   ```

   Script-nya ngerjain langkah 2–4 di bawah: bikin user & folder, bikin SSH key yang dibatasi, dan nambahin situs ke Caddy (ada backup, divalidasi, otomatis balik kalau gagal). Di akhir, dia nampilin semua nilai buat GitHub Secrets. Private key-nya cuma ditampilin sekali, terus langsung dihapus dari VPS.
3. Copy nilai-nilai itu ke GitHub Secrets (langkah 5), terus jalanin deploy pertama (langkah 6).

Script-nya aman dijalanin ulang. Kalau situsnya udah ada di Caddyfile, bagian Caddy dilewati. Tiap dijalanin, key deploy diganti yang baru, dan key lama otomatis gak berlaku. Jadi kalau secrets-nya salah copy, jalanin lagi aja.

## Cara manual

## 1. DNS

Di pengaturan DNS domain lo (di registrar atau penyedia DNS-nya), tambahin record buat subdomain landing page. Contoh buat `japri.rifaldirizqi.web.id`:

| Type | Name / Host | Value | TTL |
|---|---|---|---|
| A | `japri` | IP publik VPS (IPv4) | 3600 |
| AAAA | `japri` | IPv6 VPS. Lewati kalau VPS gak punya IPv6 | 3600 |

Kalau nama itu udah punya record `CNAME` (misalnya sisa GitHub Pages), hapus dulu. Satu nama gak boleh punya CNAME dan A sekaligus.

Cek udah aktif atau belum (dari komputer mana aja):

```bash
dig +short japri.rifaldirizqi.web.id
# harus keluar IP VPS lo
```

## 2. User khusus deploy di VPS

Login ke VPS, terus:

```bash
sudo apt install -y rsync
sudo adduser --system --group --shell /bin/bash --home /home/japri-deploy japri-deploy
sudo mkdir -p /var/www/japri
sudo chown japri-deploy:japri-deploy /var/www/japri
```

## 3. SSH key buat GitHub Actions

Bikin key **baru khusus deploy** (jangan pakai key pribadi lo). Bisa di laptop lo:

```bash
ssh-keygen -t ed25519 -N "" -C github-actions-japri -f japri-deploy
# hasilnya dua file: japri-deploy (private) dan japri-deploy.pub (public)
```

Pasang public key-nya di VPS, **dibatasi cuma boleh rsync ke `/var/www/japri`**. Ganti `ISI_JAPRI_DEPLOY_PUB` dengan isi file `japri-deploy.pub`:

```bash
sudo mkdir -p /home/japri-deploy/.ssh
echo 'command="rrsync /var/www/japri",restrict ISI_JAPRI_DEPLOY_PUB' | sudo tee /home/japri-deploy/.ssh/authorized_keys
sudo chown -R japri-deploy:japri-deploy /home/japri-deploy/.ssh
sudo chmod 700 /home/japri-deploy/.ssh && sudo chmod 600 /home/japri-deploy/.ssh/authorized_keys
```

Dengan batasan `rrsync` + `restrict`, key ini **gak bisa** dipakai buka shell, gak bisa nulis di luar `/var/www/japri`, dan gak bisa port forwarding. Kalau key-nya bocor, paling parah orang cuma bisa ngubah file landing page.

> `rrsync` ada di Ubuntu 22.04+ / Debian 12+ (`/usr/bin/rrsync`). Di versi lebih lama:
> `sudo sh -c 'gunzip -c /usr/share/doc/rsync/scripts/rrsync.gz > /usr/local/bin/rrsync && chmod +x /usr/local/bin/rrsync'`

## 4. Caddy

**Pasang Caddy** (kalau belum). Pakai repo resmi Caddy, soalnya paket bawaan Ubuntu versinya ketinggalan jauh:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

Caddy butuh port 80 & 443 buat dirinya sendiri. Kalau ada web server lain yang udah pegang port itu (misalnya nginx atau Apache), pindahin dulu situs-situsnya ke Caddyfile, baru matiin web server itu.

**Tambahin situsnya.** Tempel isi [`deploy/landing/Caddyfile`](../deploy/landing/Caddyfile) ke `/etc/caddy/Caddyfile` di VPS (di bawah situs lain yang udah ada), terus:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy otomatis minta sertifikat HTTPS dari Let's Encrypt, asal DNS di langkah 1 udah aktif dan port 80/443 kebuka di firewall (`sudo ufw allow 80/tcp && sudo ufw allow 443`).

## 5. GitHub Secrets

Di repo `japri` → **Settings → Secrets and variables → Actions → New repository secret**, isi:

| Nama | Isi |
|---|---|
| `VPS_HOST` | IP VPS (atau hostname-nya) |
| `VPS_USER` | `japri-deploy` |
| `VPS_SSH_KEY` | **Seluruh** isi file private key `japri-deploy`, dari `-----BEGIN` sampai `-----END` |
| `VPS_KNOWN_HOSTS` | Output perintah di bawah |
| `VPS_PORT` | Opsional, cuma kalau SSH VPS bukan di port 22 |

Isi `VPS_KNOWN_HOSTS` (biar GitHub Actions bisa mastiin dia beneran nyambung ke VPS lo, bukan ke server palsu). Jalanin **di VPS**:

```bash
for f in /etc/ssh/ssh_host_*_key.pub; do echo "IP_VPS $(cut -d' ' -f1,2 "$f")"; done
```

Ganti `IP_VPS` dengan nilai yang sama persis kayak `VPS_HOST`. Kalau SSH-nya bukan port 22, tulis `[IP_VPS]:PORT`.

Setelah secrets ke-save, **hapus file private key `japri-deploy` dari laptop lo**. Kalau suatu saat butuh lagi, bikin key baru aja.

## 6. Deploy pertama

Repo → **Actions → Landing page → Run workflow**. Kalau hijau, buka https://japri.rifaldirizqi.web.id.

Setelah itu, tiap ada perubahan di `site/` yang di-push ke `main`, landing page ke-update sendiri.

## Troubleshooting

| Error di Actions | Artinya |
|---|---|
| `Secret ... belum diisi` | Ada secret di langkah 5 yang kelewat |
| `Host key verification failed` | `VPS_KNOWN_HOSTS` salah, atau nama host-nya beda sama `VPS_HOST` |
| `Permission denied (publickey)` | `VPS_SSH_KEY` gak lengkap, atau `authorized_keys` di VPS salah (cek langkah 3) |
| `rrsync: not found` | Pasang `rrsync` (lihat catatan di langkah 3) |
| `ngebales HTTP 000` / `502` | File udah ke-upload, tapi Caddy belum nyajiin: cek langkah 4, DNS, dan firewall port 80/443 |
