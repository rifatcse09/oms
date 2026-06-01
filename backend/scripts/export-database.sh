#!/usr/bin/env bash
# Export DB to backend/storage/app/database-exports/ (schema + all row data).
#
# Requires either:
#   - PHP >= 8.4 on PATH, Composer deps installed, and mysqldump/pg_dump for MySQL/Postgres; or
#   - Docker Compose from the repo root (this script will run artisan inside the backend image).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/.." && pwd)"

if php -r 'exit(version_compare(PHP_VERSION, "8.4.0", ">=") ? 0 : 1);' 2>/dev/null; then
  cd "$ROOT"
  exec php artisan gom:export-database "$@"
fi

if [ -f "$REPO_ROOT/docker-compose.yml" ] && docker compose version >/dev/null 2>&1; then
  cd "$REPO_ROOT"
  exec docker compose run -T --rm backend php artisan gom:export-database "$@"
fi

echo "This Laravel app needs PHP >= 8.4 (you have: $(php -r 'echo PHP_VERSION;' 2>/dev/null || echo 'none'))." >&2
echo "Fix: install PHP 8.4+, or use Docker from the repo root:" >&2
echo "  cd $REPO_ROOT && docker compose run --rm backend php artisan gom:export-database" >&2
exit 1
