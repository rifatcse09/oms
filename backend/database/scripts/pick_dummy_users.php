#!/usr/bin/env php
<?php

declare(strict_types=1);

/**
 * Reads backend/.env, connects to the same DB Laravel uses,
 * prints one line of JSON: userEmail, staffEmail, roles — for dummy_order_flow.sh.
 *
 * Usage: php backend/database/scripts/pick_dummy_users.php
 */

function load_dotenv(string $path): array {
    $out = [];
    if (!is_file($path) || !is_readable($path)) {
        return $out;
    }
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
            continue;
        }
        [$k, $val] = explode('=', $line, 2);
        $k = trim($k);
        $val = trim($val);
        if ($k === '') {
            continue;
        }
        if ((str_starts_with($val, '"') && str_ends_with($val, '"')) || (str_starts_with($val, "'") && str_ends_with($val, "'"))) {
            $val = substr($val, 1, -1);
        }
        $out[$k] = $val;
    }
    return $out;
}

function env_val(array $env, string $key, string $default): string {
    if (isset($env[$key]) && $env[$key] !== '') {
        return (string) $env[$key];
    }
    $g = getenv($key);
    if ($g !== false && $g !== '') {
        return (string) $g;
    }

    return $default;
}

$backendRoot = dirname(__DIR__, 2);
$env = load_dotenv($backendRoot . '/.env');
$connection = strtolower(env_val($env, 'DB_CONNECTION', 'mysql'));

try {
    if ($connection === 'sqlite') {
        $relative = env_val($env, 'DB_DATABASE', 'database/database.sqlite');
        $dbPath = str_starts_with($relative, '/') ? $relative : $backendRoot . '/' . ltrim($relative, '/');
        $pdo = new PDO('sqlite:' . $dbPath, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    } else {
        $host = env_val($env, 'DB_HOST', '127.0.0.1');
        if (is_file('/.dockerenv') && in_array($host, ['127.0.0.1', 'localhost', '::1'], true)) {
            $host = 'mysql';
        }
        $port = env_val($env, 'DB_PORT', '3306');
        $dbname = env_val($env, 'DB_DATABASE', 'gom');
        $user = env_val($env, 'DB_USERNAME', 'gom');
        $pass = env_val($env, 'DB_PASSWORD', '');
        $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', $host, $port, $dbname);
        $pdo = new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            Pdo\Mysql::ATTR_INIT_COMMAND => 'SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci',
        ]);
    }
} catch (Throwable $e) {
    $msg = $e->getMessage();
    fwrite(STDERR, 'pick_dummy_users: DB connection failed: ' . $msg . "\n");
    if (str_contains($msg, 'could not find driver')) {
        fwrite(STDERR, "hint: enable pdo_mysql or pdo_sqlite in CLI php.ini, or run dummy_order_flow.sh without setting emails (it falls back to user@demo.local / moderator@demo.local).\n");
    }
    exit(1);
}

$uRow = $pdo->query("
    SELECT email, role FROM users
    WHERE is_active = true AND role = 'user'
    ORDER BY id ASC
    LIMIT 1
")->fetch();
$sRow = $pdo->query("
    SELECT email, role FROM users
    WHERE is_active = true AND role IN ('moderator', 'admin')
    ORDER BY CASE role WHEN 'moderator' THEN 0 ELSE 1 END, id ASC
    LIMIT 1
")->fetch();

if (!$uRow || !$sRow) {
    fwrite(STDERR, "pick_dummy_users: need at least one active user (role=user) and one staff (moderator or admin).\n");
    exit(1);
}

echo json_encode([
    'userEmail' => (string) $uRow['email'],
    'staffEmail' => (string) $sRow['email'],
    'userRole' => (string) $uRow['role'],
    'staffRole' => (string) $sRow['role'],
], JSON_UNESCAPED_UNICODE) . "\n";
