#!/usr/bin/env bash
# Prepara un VPS Ubuntu/Debian (o la VM de GCP) para el camino SIN panel (Docker + Caddy).
# Con Dokploy o Coolify no hace falta: sus instaladores ya instalan Docker (docs/deploy.md).
#
#   curl -fsSL https://raw.githubusercontent.com/<usuario>/Avicola2-Platform/main/deploy/bootstrap-vps.sh | sudo bash
#   (o copia el archivo al servidor y: sudo bash bootstrap-vps.sh)
#
# Es idempotente: se puede volver a ejecutar sin romper nada.
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/avicola2}
REPO_URL=${REPO_URL:-}

if [ "$(id -u)" -ne 0 ]; then
  echo "Ejecútalo con sudo." >&2
  exit 1
fi

echo "==> Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

echo "==> Firewall: solo SSH, HTTP y HTTPS"
if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw allow 443/udp
  ufw --force enable
else
  echo "    ufw no está instalado: en GCP usa las reglas de firewall de la VPC (80 y 443)."
fi

echo "==> Swap (solo si el servidor tiene menos de 4 GB de RAM y no tiene swap)"
mem_kb=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
if [ "$mem_kb" -lt 4000000 ] && ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Código en $APP_DIR"
if [ -n "$REPO_URL" ] && [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_URL" "$APP_DIR"
fi
mkdir -p "$APP_DIR"

cat <<EOF

Listo. Siguientes pasos (docs/deploy.md, camino C):
  1. cp $APP_DIR/deploy/production.env.example $APP_DIR/.env  y completa los valores.
  2. cd $APP_DIR && docker compose -f deploy/compose.prod.yml -f deploy/compose.caddy.yml --env-file .env up -d --build
EOF
