#!/usr/bin/env bash
# Wipe Docker MySQL volume for this project, rebuild, migrate + seed demo users/catalog.
# Use when you switched DB or still see old data — also set frontend VITE_API_BASE_URL to this API.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Stopping containers and removing named volume mysql_data (all MySQL data for gom)…"
docker compose down -v

echo "==> Starting MySQL + backend (migrations + seed run on backend start)…"
docker compose up -d --build

echo "==> Waiting for backend container…"
for i in $(seq 1 60); do
  if docker compose exec -T backend php -r 'exit(0);' 2>/dev/null; then
    break
  fi
  sleep 1
done

echo "==> Check backend status (should be Up, not Restarting):"
docker compose ps

echo ""
echo "Done. Open the app with VITE_API_BASE_URL=http://127.0.0.1:8000 (or your host) so the UI hits this API, not an old Postgres server."
