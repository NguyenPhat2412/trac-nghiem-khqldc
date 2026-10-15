#!/usr/bin/env sh
# Only vju_quiz_test is reset. The application's vju_quiz database is untouched.
set -eu
cd "$(dirname "$0")/.."
set -a
. ./.env
set +a
mkdir -p work
docker compose --profile test stop test-backend
docker compose exec -T db psql -U vju -d postgres -v ON_ERROR_STOP=1 -c 'DROP DATABASE IF EXISTS vju_quiz_test WITH (FORCE);' -c 'CREATE DATABASE vju_quiz_test;'
docker compose --profile test up -d test-backend
count=0
until curl -fsS http://localhost:8081/actuator/health > /dev/null; do
 count=$((count+1))
 if [ "$count" -gt 30 ]; then exit 1; fi
 sleep 1
done
python3 scripts/integration_test.py
