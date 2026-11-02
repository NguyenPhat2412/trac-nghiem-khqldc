#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
umask 077
mkdir -p work data/postgres
if [ ! -f .env ]; then
  cat > .env <<ENV
DATABASE_PASSWORD=$(openssl rand -hex 24)
ADMIN_PASSWORD=${ADMIN_PASSWORD:-Admin123@}
ADMIN_USERNAME=${ADMIN_USERNAME:-admin123@gmail.com}
APP_ORIGIN=http://localhost:3000
SECURE_COOKIE=false
SEED_DEMO=true
ENV
  printf '%s\n' 'Đã tạo cấu hình và mật khẩu riêng trong .env.'
fi
docker compose up -d --build
docker compose restart gateway
printf '%s\n' 'Mở http://localhost:3000 — quản trị tại /admin.' 'Thông tin khởi tạo nằm ở ADMIN_USERNAME và ADMIN_PASSWORD trong .env.'
