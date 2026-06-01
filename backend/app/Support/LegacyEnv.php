<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Reads .env and getenv — same behaviour as legacy envv() in public/index.php.
 */
final class LegacyEnv
{
    /** @var array<string, string>|null */
    private static ?array $dotEnv = null;

    public static function get(string $key, string $default = ''): string
    {
        $v = getenv($key);
        if ($v !== false && $v !== '') {
            return (string) $v;
        }
        if (isset($_ENV[$key]) && $_ENV[$key] !== '') {
            return (string) $_ENV[$key];
        }
        if (isset($_SERVER[$key]) && $_SERVER[$key] !== '') {
            return (string) $_SERVER[$key];
        }
        if (self::$dotEnv === null) {
            self::$dotEnv = self::loadDotEnvFile();
        }

        return (string) (self::$dotEnv[$key] ?? $default);
    }

    /**
     * @return array<string, string>
     */
    private static function loadDotEnvFile(): array
    {
        $path = dirname(__DIR__, 2) . '/.env';
        $out = [];
        if (! is_file($path) || ! is_readable($path)) {
            return $out;
        }
        foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#') || ! str_contains($line, '=')) {
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
}
