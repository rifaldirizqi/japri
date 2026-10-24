#!/usr/bin/env bash
# Setup VPS buat landing page Japri. Jalanin sekali di VPS (Ubuntu/Debian + Caddy di host):
#
#   curl -fsSLO https://raw.githubusercontent.com/rifaldirizqi/japri/main/deploy/landing/setup-vps.sh
#   less setup-vps.sh          # baca dulu isinya
#   sudo bash setup-vps.sh
#
# Yang dikerjain:
#   1. Bikin user japri-deploy + folder /var/www/japri
#   2. Bikin SSH key deploy baru, dibatasi cuma boleh rsync ke /var/www/japri (rrsync + restrict)
#   3. Nambahin situs landing page ke Caddyfile (backup dulu, divalidasi, balik ke backup kalau gagal)
#   4. Nampilin nilai buat GitHub Secrets, terus private key-nya dihapus dari VPS
#
# Aman dijalanin ulang. Situs yang udah ada di Caddyfile dilewati. Tiap dijalanin, key deploy lama
# diganti key baru (key lama otomatis gak berlaku).
set -euo pipefail

DOMAIN="${DOMAIN:-japri.rifaldirizqi.web.id}"
WEBROOT="${WEBROOT:-/var/www/japri}"
DEPLOY_USER="${DEPLOY_USER:-japri-deploy}"
CADDYFILE="${CADDYFILE:-/etc/caddy/Caddyfile}"
CADDY_BLOCK_URL="https://raw.githubusercontent.com/rifaldirizqi/japri/main/deploy/landing/Caddyfile"

say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mGagal: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "jalanin pakai sudo: sudo bash $0"
command -v caddy >/dev/null || die "Caddy belum terpasang di VPS ini (lihat docs/DEPLOY-LANDING.md, langkah 4)"
[ -f "$CADDYFILE" ] || die "$CADDYFILE gak ketemu"

# ---------- 1. rsync & rrsync ----------
say "Cek rsync"
command -v rsync >/dev/null || { apt-get update -qq && apt-get install -y -qq rsync; }
RRSYNC="$(command -v rrsync || true)"
if [ -z "$RRSYNC" ]; then
  # Ubuntu < 22.04 / Debian < 12: rrsync cuma ada di folder dokumentasi
  src=/usr/share/doc/rsync/scripts/rrsync
  if [ -f "$src.gz" ]; then gunzip -c "$src.gz" > /usr/local/bin/rrsync
  elif [ -f "$src" ]; then cp "$src" /usr/local/bin/rrsync
  else die "rrsync gak ketemu. Update rsync dulu (apt install rsync)"; fi
  chmod 755 /usr/local/bin/rrsync
  RRSYNC=/usr/local/bin/rrsync
fi
echo "rrsync: $RRSYNC"

# ---------- 2. User & folder ----------
say "User $DEPLOY_USER & folder $WEBROOT"
id "$DEPLOY_USER" >/dev/null 2>&1 || adduser --system --group --shell /bin/bash --home "/home/$DEPLOY_USER" "$DEPLOY_USER" >/dev/null
mkdir -p "$WEBROOT"
chown "$DEPLOY_USER:$DEPLOY_USER" "$WEBROOT"
chmod 755 "$WEBROOT"

# ---------- 3. SSH key deploy ----------
say "Bikin SSH key deploy"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
ssh-keygen -q -t ed25519 -N "" -C "github-actions-japri" -f "$TMP/key"
SSH_DIR="/home/$DEPLOY_USER/.ssh"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$SSH_DIR"
echo "command=\"$RRSYNC $WEBROOT\",restrict $(cat "$TMP/key.pub")" > "$SSH_DIR/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "$SSH_DIR/authorized_keys"
chmod 600 "$SSH_DIR/authorized_keys"
echo "Key dipasang, cuma boleh rsync ke $WEBROOT"

# ---------- 4. Caddy ----------
say "Caddy: situs $DOMAIN"
if grep -Eq "^[[:space:]]*(https?://)?${DOMAIN//./\\.}[[:space:]]*(,|\{)" "$CADDYFILE"; then
  echo "Udah ada di $CADDYFILE, dilewati"
else
  BLOCK="$(dirname "$0")/Caddyfile"
  if [ -f "$BLOCK" ] && grep -q "$DOMAIN" "$BLOCK"; then cp "$BLOCK" "$TMP/block"
  else curl -fsSL "$CADDY_BLOCK_URL" -o "$TMP/block" || die "gagal download konfigurasi Caddy"; fi
  BACKUP="$CADDYFILE.bak-$(date +%Y%m%d-%H%M%S)"
  cp "$CADDYFILE" "$BACKUP"
  printf '\n' >> "$CADDYFILE"
  cat "$TMP/block" >> "$CADDYFILE"
  if ! caddy validate --config "$CADDYFILE" --adapter caddyfile >"$TMP/validate.log" 2>&1; then
    cp "$BACKUP" "$CADDYFILE"
    cat "$TMP/validate.log" >&2
    die "konfigurasi Caddy gak valid, Caddyfile udah dibalikin ke semula"
  fi
  systemctl reload caddy
  echo "Ditambahin ke $CADDYFILE (backup: $BACKUP), Caddy di-reload"
fi

# ---------- 5. Nilai buat GitHub Secrets ----------
# awk baca sampai habis (tanpa exit): kalau berhenti duluan, sshd kena SIGPIPE dan pipefail bikin script mati diam-diam
PORT="$(sshd -T 2>/dev/null | awk '/^port /{p=$2} END{print p}' || true)"
PORT="${PORT:-22}"
HOST="${VPS_HOST:-$(hostname -I | awk '{print $1}')}"
HOST_ENTRY="$HOST"
[ "$PORT" = 22 ] || HOST_ENTRY="[$HOST]:$PORT"

say "Cek DNS"
RESOLVED="$(getent ahostsv4 "$DOMAIN" | awk '{print $1; exit}' || true)"
if [ -z "$RESOLVED" ]; then echo "⚠️  $DOMAIN belum ke-resolve. Tambahin record A buat $DOMAIN → IP VPS di pengaturan DNS domain lo."
else echo "$DOMAIN → $RESOLVED"; fi

cat <<EOF

────────────────────────────────────────────────────────────────────
 Isi GitHub Secrets di: https://github.com/rifaldirizqi/japri/settings/secrets/actions
 (New repository secret, satu per baris di bawah)
────────────────────────────────────────────────────────────────────

VPS_HOST
$HOST
   ↑ cek: harus IP publik yang lo pakai buat SSH ke VPS ini. Kalau beda, pakai IP itu,
     dan ganti juga bagian depan VPS_KNOWN_HOSTS biar sama persis.

VPS_USER
$DEPLOY_USER
EOF
[ "$PORT" = 22 ] || printf '\nVPS_PORT\n%s\n' "$PORT"
echo
echo "VPS_KNOWN_HOSTS"
for f in /etc/ssh/ssh_host_*_key.pub; do echo "$HOST_ENTRY $(cut -d' ' -f1,2 "$f")"; done
echo
echo "VPS_SSH_KEY   (copy semua, dari -----BEGIN sampai -----END)"
cat "$TMP/key"
cat <<EOF

────────────────────────────────────────────────────────────────────
 Private key di atas cuma ditampilin sekali dan udah dihapus dari VPS.
 Kalau kelewat, jalanin script ini lagi buat bikin key baru.
 Abis secrets diisi: GitHub → Actions → Landing page → Run workflow.
────────────────────────────────────────────────────────────────────
EOF
