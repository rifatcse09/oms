# Backend (Laravel API)

Setup, Docker, database export, MySQL `mysqldump` notes, and frontend API URL are documented in the **[repository root README.md](../README.md)**.

Typical local install (without Docker): copy `.env.example` to `.env`, run `composer install`, `php artisan key:generate`, then migrate. This project targets **PHP ≥ 8.4** (see `composer.json` / lockfile).
