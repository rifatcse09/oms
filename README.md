# Grocery order management

Monorepo: **Laravel** API (`backend/`) + **React** SPA (`frontend/`).

---

## Quick start (Docker)

From the repository root:

```bash
docker compose up -d --build
```

- **API:** http://127.0.0.1:8000 — health: `GET /api/v1/health`
- **MySQL:** host `127.0.0.1`, port **53306** (mapped from container `3306`)
- **DB name / user / password:** `gom` / `gom` / `gom_secret` (see `docker-compose.yml`)

The backend container runs migrations + seed on start, then `php artisan serve`.

To wipe all MySQL data and start clean:

```bash
./scripts/docker-reset-mysql.sh
# or: docker compose down -v && docker compose up -d --build
```

---

## Frontend (`frontend/`)

### API URL

Create `frontend/.env` from `frontend/.env.example`. The SPA calls the Laravel API using:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

Use the **public base URL** of the Laravel app (no trailing slash). Examples:

- Local Docker: `http://127.0.0.1:8000`
- Production: `https://your-domain.com` or `https://your-domain.com/hmc/backend` if the API is mounted under a path

Paths like `/api/v1/...` are appended automatically. **Rebuild** the frontend after changing env (`npm run build` or restart `npm run dev`) — Vite bakes `VITE_*` at build time.

If the UI shows old or empty data, the browser is often pointed at the **wrong API** — fix `VITE_API_BASE_URL` and reload.

### Hosting the SPA under a subpath (e.g. `/hmc/`)

This repo defaults to assets and routes at `/`. If you serve the built app from a subpath, configure Vite `base` and React Router `basename` to match (not wired to env by default).

---

## Backend (`backend/`)

### Requirements

- **PHP ≥ 8.4** and Composer dependencies for `php artisan` on the host, **or** run Artisan inside the **backend** Docker image (PHP 8.x from `composer:2`).

Copy `backend/.env.example` to `backend/.env` and set `APP_KEY`, database, etc. Docker Compose injects DB settings for the `backend` service.

### CORS

For a separate frontend origin, ensure Laravel allows that origin (see `CorsMiddleware` / config).

---

## Database export (full schema + data)

Exports go to **`backend/storage/app/database-exports/`** (SQL for MySQL/Postgres, or a copied `.sqlite` file for SQLite).

### Command

```bash
cd backend
php artisan gom:export-database
```

Options:

```bash
php artisan gom:export-database --filename=my-backup
php artisan gom:export-database --output-dir=database-exports
php artisan gom:export-database --output-dir=/tmp
# PostgreSQL only:
php artisan gom:export-database --inserts
```

### Wrapper script

```bash
./backend/scripts/export-database.sh
```

- If host **PHP &lt; 8.4**, the script tries **`docker compose run --rm backend php artisan gom:export-database`** from this repo root (when `docker-compose.yml` exists and Docker is available).
- **MySQL / MariaDB:** `mysqldump` or `mariadb-dump` must be on `PATH` (included in the backend Docker image as `mysql-client`).
- **PostgreSQL:** `pg_dump` required.
- **SQLite:** no extra tools; the DB file is copied.

### Docker (no local PHP 8.4)

```bash
docker compose run --rm backend php artisan gom:export-database
```

The dump file appears on the host under `backend/storage/app/database-exports/` because `./backend` is bind-mounted into the container.

### Import (MySQL example)

Create an empty database, then:

```bash
mysql -h HOST -u USER -p NEW_DATABASE < gom-db-YYYY-MM-DD_HHMMSS.sql
```

### Ubuntu: “no permissions to read” on `database-exports`

Exports often run **inside Docker**. The dump directory/file can end up owned by **root** or **`nobody`** (UID mapped from the container) with mode **0750** (`rwxr-x---`). Your desktop user is then “other” and has **no** read/execute on that folder, so Nautilus / “Compress” fails.

**One-time fix** (from the project root, replace `YOURUSER` with your login, e.g. `rifat`):

```bash
sudo chown -R YOURUSER:YOURUSER backend/storage/app/database-exports
sudo chmod -R u+rwX,go+rX backend/storage/app/database-exports
```

New exports from this repo use a more permissive export dir mode and `chmod` on the SQL file where the process is allowed to; if problems persist, use the commands above.

---

## MySQL authentication and `mysqldump`

MySQL 8 defaults to **`caching_sha2_password`**. The dump client in the **Alpine** backend image is **MariaDB-based** and does not ship the MySQL `caching_sha2_password` client plugin, so dumps can fail with an error about that plugin.

**Compose fix (new volumes):** `docker-compose.yml` starts MySQL with:

`--default-authentication-plugin=mysql_native_password`

so **newly** created application users use an auth plugin the MariaDB client supports.

**Existing data volume** (users already on `caching_sha2_password`): run once as root:

```bash
docker compose exec mysql mysql -uroot -pgom_root_secret -e \
  "ALTER USER 'gom'@'%' IDENTIFIED WITH mysql_native_password BY 'gom_secret'; FLUSH PRIVILEGES;"
```

Adjust user, host, and password to match your `.env` / compose file.

---

## Project layout

| Path | Role |
|------|------|
| `backend/` | Laravel 13 API |
| `frontend/` | Vite + React UI |
| `docker-compose.yml` | MySQL + backend dev stack |
| `scripts/docker-reset-mysql.sh` | Reset MySQL volume |

---

## Backend-only note

The file `backend/README.md` points here for ops; default Laravel marketing text was replaced to avoid duplicate maintenance.
