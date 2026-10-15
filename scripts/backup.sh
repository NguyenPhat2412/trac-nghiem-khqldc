#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
umask 077
mkdir -p backups
backup_file="backups/vju-quiz-$(date +%Y%m%d-%H%M%S).dump"
docker compose exec -T db pg_dump -U vju -d vju_quiz -Fc > "$backup_file"
printf 'Đã lưu %s\n' "$backup_file"
