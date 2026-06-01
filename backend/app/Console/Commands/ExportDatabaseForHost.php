<?php

declare(strict_types=1);

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Symfony\Component\Process\Process;

/**
 * Writes a portable dump under storage/app/database-exports/ for backup or import on another machine.
 */
class ExportDatabaseForHost extends Command
{
    protected $signature = 'gom:export-database
                            {--output-dir= : Absolute path or path under storage/app (default: database-exports)}
                            {--filename= : Optional base filename without extension}
                            {--inserts : PostgreSQL only: dump row data as INSERTs (larger file; default is COPY, still full data)}';

    protected $description = 'Full DB export (schema + all row data) to storage for backup or import on another host';

    public function handle(): int
    {
        $default = config('database.default');
        $conn = config("database.connections.{$default}");
        if (! is_array($conn) || ! isset($conn['driver'])) {
            $this->error('Invalid database configuration.');

            return self::FAILURE;
        }

        $driver = (string) $conn['driver'];
        $outOpt = trim((string) $this->option('output-dir'));
        if ($outOpt === '') {
            $dir = storage_path('app/database-exports');
        } elseif (str_starts_with($outOpt, '/')) {
            $dir = $outOpt;
        } else {
            $dir = storage_path('app/'.ltrim($outOpt, '/'));
        }

        // 0755 so host users (outside Docker) can read exports on bind-mounted storage; 0750 + root/nobody owner breaks Ubuntu file managers.
        if (! is_dir($dir) && ! mkdir($dir, 0755, true) && ! is_dir($dir)) {
            $this->error("Cannot create directory: {$dir}");

            return self::FAILURE;
        }
        @chmod($dir, 0755);

        $base = trim((string) $this->option('filename'));
        if ($base === '') {
            $base = 'gom-db-'.date('Y-m-d_His');
        }

        if ($driver === 'pgsql') {
            return $this->exportPostgres($conn, $dir, $base, (bool) $this->option('inserts'));
        }

        if ($driver === 'sqlite') {
            return $this->exportSqlite($conn, $dir, $base);
        }

        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            return $this->exportMysqlFamily($conn, $dir, $base);
        }

        $this->error("Unsupported DB_CONNECTION driver for export: {$driver}. Use mysql, sqlite, or pgsql.");

        return self::FAILURE;
    }

    /**
     * @param  array<string, mixed>  $conn
     */
    private function exportPostgres(array $conn, string $dir, string $base, bool $useInserts): int
    {
        $host = (string) ($conn['host'] ?? '127.0.0.1');
        $port = (string) ($conn['port'] ?? '5432');
        $database = (string) ($conn['database'] ?? '');
        $username = (string) ($conn['username'] ?? '');
        $password = (string) ($conn['password'] ?? '');
        if ($database === '' || $username === '') {
            $this->error('PostgreSQL export requires database and username in .env (DB_DATABASE, DB_USERNAME).');

            return self::FAILURE;
        }

        $file = $dir.'/'.$base.'.sql';
        $pgDump = $this->findExecutable('pg_dump');
        if ($pgDump === null) {
            $this->error('pg_dump not found. Install PostgreSQL client tools (or rebuild the backend Docker image).');
            $this->line('Host: sudo apt install postgresql-client');
            $this->line('Docker: rebuild backend image so pg_dump is available — docker compose build backend && docker compose up -d');

            return self::FAILURE;
        }

        // Full dump: schema + data (default pg_dump; we never pass --schema-only / --data-only).
        $cmd = [
            $pgDump,
            '-h', $host,
            '-p', $port,
            '-U', $username,
            '-d', $database,
            '--no-owner',
            '--no-acl',
            '-f', $file,
        ];
        if ($useInserts) {
            $cmd[] = '--inserts';
        }

        $this->info('Running pg_dump (schema + all table data)…');
        $process = new Process($cmd, null, ['PGPASSWORD' => $password]);
        $process->setTimeout(3600);
        try {
            $process->mustRun();
        } catch (\Throwable $e) {
            $this->error('pg_dump failed: '.$process->getErrorOutput().$process->getOutput());

            return self::FAILURE;
        }

        @chmod($file, 0644);
        $this->info("Wrote: {$file}");
        $this->comment('This file includes CREATE statements and all row data (not a schema-only dump).');
        $this->line('Import on the other host (empty DB first), e.g.:');
        $this->line("  psql -h HOST -p {$port} -U USER -d NEWDB -f ".basename($file));

        return self::SUCCESS;
    }

    /**
     * @param  array<string, mixed>  $conn
     */
    private function exportSqlite(array $conn, string $dir, string $base): int
    {
        $path = (string) ($conn['database'] ?? database_path('database.sqlite'));
        if ($path === '' || ! is_file($path)) {
            $this->error("SQLite database file not found: {$path}");

            return self::FAILURE;
        }

        $dest = $dir.'/'.$base.'.sqlite';
        if (! @copy($path, $dest)) {
            $this->error("Failed to copy SQLite file to: {$dest}");

            return self::FAILURE;
        }

        @chmod($dest, 0644);
        $this->info("Wrote: {$dest}");
        $this->comment('Binary copy of the whole SQLite file (all tables and rows).');
        $this->line('Copy this file to the other host and point DB_DATABASE to it, or replace the target sqlite file.');

        return self::SUCCESS;
    }

    /**
     * @param  array<string, mixed>  $conn
     */
    private function exportMysqlFamily(array $conn, string $dir, string $base): int
    {
        $mysqldump = $this->findMysqlDumpBinary();
        if ($mysqldump === null) {
            $this->error('mysqldump / mariadb-dump not found in PATH.');

            return self::FAILURE;
        }

        $host = (string) ($conn['host'] ?? '127.0.0.1');
        $port = (string) ($conn['port'] ?? '3306');
        $database = (string) ($conn['database'] ?? '');
        $username = (string) ($conn['username'] ?? '');
        $password = (string) ($conn['password'] ?? '');
        if ($database === '' || $username === '') {
            $this->error('MySQL export requires DB_DATABASE and DB_USERNAME.');

            return self::FAILURE;
        }

        $file = $dir.'/'.$base.'.sql';
        // Full dump: schema + data (no --no-data). Routines/triggers/events included.
        $cmd = [
            $mysqldump,
            '--host='.$host,
            '--port='.$port,
            '--user='.$username,
            '--result-file='.$file,
            '--single-transaction',
            '--skip-comments',
            '--routines',
            '--triggers',
            $database,
        ];

        $process = new Process($cmd, null, ['MYSQL_PWD' => $password]);
        $process->setTimeout(3600);
        $binLabel = str_contains($mysqldump, 'mariadb-dump') ? 'mariadb-dump' : 'mysqldump';
        $this->info("Running {$binLabel} (schema + all table data; routines & triggers)…");
        try {
            $process->mustRun();
        } catch (\Throwable $e) {
            $err = $process->getErrorOutput().$process->getOutput();
            $this->error("{$binLabel} failed: {$err}");
            if (str_contains($err, 'caching_sha2_password')) {
                $this->newLine();
                $this->warn('MySQL 8 default auth (caching_sha2_password) is not supported by many MariaDB-based dump clients.');
                $this->line('Fix: set MySQL to mysql_native_password (see docker-compose mysql `command`), recreate the DB volume, or run once as root:');
                $this->line("  ALTER USER '{$username}'@'%' IDENTIFIED WITH mysql_native_password BY '<password>'; FLUSH PRIVILEGES;");
            }

            return self::FAILURE;
        }

        @chmod($file, 0644);
        $this->info("Wrote: {$file}");
        $this->comment('This file includes CREATE TABLE and INSERT/COPY-style data for all tables (not schema-only).');
        $this->line('Import: mysql -h HOST -u USER -p NEWDB < '.basename($file));

        return self::SUCCESS;
    }

    /** Prefer mariadb-dump when present (avoids deprecated mysqldump shim on Alpine). */
    private function findMysqlDumpBinary(): ?string
    {
        foreach (['mariadb-dump', 'mysqldump'] as $name) {
            $path = $this->findExecutable($name);
            if ($path !== null) {
                return $path;
            }
        }

        return null;
    }

    private function findExecutable(string $name): ?string
    {
        $paths = explode(PATH_SEPARATOR, (string) getenv('PATH'));
        foreach ($paths as $p) {
            if ($p === '') {
                continue;
            }
            $full = $p.DIRECTORY_SEPARATOR.$name;
            if (is_file($full) && is_executable($full)) {
                return $full;
            }
        }

        if (PHP_OS_FAMILY === 'Windows') {
            $w = $name.'.exe';
            foreach ($paths as $p) {
                if ($p === '') {
                    continue;
                }
                $full = $p.DIRECTORY_SEPARATOR.$w;
                if (is_file($full) && is_executable($full)) {
                    return $full;
                }
            }
        }

        // Minimal PATH (e.g. some workers): common install locations
        foreach (['/usr/bin', '/usr/local/bin', '/bin'] as $dir) {
            $full = $dir.DIRECTORY_SEPARATOR.$name;
            if (is_file($full) && is_executable($full)) {
                return $full;
            }
        }

        return null;
    }
}
