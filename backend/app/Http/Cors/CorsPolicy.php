<?php

declare(strict_types=1);

namespace App\Http\Cors;

use App\Support\LegacyEnv;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Shared CORS rules from .env / config for legacy index.php and CorsMiddleware.
 */
final class CorsPolicy
{
    /**
     * Procedural API front controller: answer OPTIONS preflight and return.
     */
    public static function handleApiPreflight(): void
    {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'OPTIONS') {
            return;
        }
        self::sendNativeCorsHeaders();
        header('Content-Type: text/plain; charset=utf-8');
        http_response_code(204);
        exit;
    }

    /**
     * Send CORS headers on the current PHP response (legacy json_response, etc.).
     */
    public static function sendNativeCorsHeaders(): void
    {
        $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
        $allowOrigin = self::resolveAllowOrigin($origin);
        header('Access-Control-Allow-Origin: ' . $allowOrigin);
        header('Vary: Origin');
        header('Access-Control-Allow-Methods: ' . self::allowedMethods());
        header('Access-Control-Allow-Headers: ' . self::allowedHeaders());
        if (self::supportsCredentials() && $allowOrigin !== '*') {
            header('Access-Control-Allow-Credentials: true');
        }
        $maxAge = self::maxAge();
        if ($maxAge > 0) {
            header('Access-Control-Max-Age: ' . (string) $maxAge);
        }
    }

    public static function applyToSymfonyResponse(Request $request, Response $response): Response
    {
        $origin = (string) $request->headers->get('Origin', '');
        $allowOrigin = self::resolveAllowOrigin($origin);
        $response->headers->set('Access-Control-Allow-Origin', $allowOrigin);
        $response->headers->set('Vary', 'Origin');
        $response->headers->set('Access-Control-Allow-Methods', self::allowedMethods());
        $response->headers->set('Access-Control-Allow-Headers', self::allowedHeaders());
        if (self::supportsCredentials() && $allowOrigin !== '*') {
            $response->headers->set('Access-Control-Allow-Credentials', 'true');
        }
        $maxAge = self::maxAge();
        if ($maxAge > 0) {
            $response->headers->set('Access-Control-Max-Age', (string) $maxAge);
        }

        return $response;
    }

    public static function resolveAllowOrigin(string $requestOrigin): string
    {
        $allowed = self::allowedOriginsParsed();
        if ($allowed === ['*']) {
            return '*';
        }
        if ($requestOrigin !== '' && in_array($requestOrigin, $allowed, true)) {
            return $requestOrigin;
        }

        return '*';
    }

    /**
     * @return list<string>
     */
    private static function allowedOriginsParsed(): array
    {
        if (function_exists('config')) {
            try {
                $fromConfig = config('cors.allowed_origins');
                if (is_array($fromConfig) && $fromConfig !== []) {
                    return self::normalizeOriginList($fromConfig);
                }
            } catch (\Throwable) {
                // legacy entry or config not loaded yet
            }
        }

        $raw = LegacyEnv::get('CORS_ALLOWED_ORIGINS', '');
        if ($raw === '') {
            return ['http://localhost:5173', 'http://127.0.0.1:5173'];
        }

        return self::normalizeOriginList(array_map('trim', explode(',', $raw)));
    }

    /**
     * @param array<int, string> $list
     * @return list<string>
     */
    private static function normalizeOriginList(array $list): array
    {
        $list = array_values(array_filter($list, static fn (string $o): bool => $o !== ''));
        if ($list === []) {
            return ['*'];
        }
        if (count($list) === 1 && $list[0] === '*') {
            return ['*'];
        }

        return $list;
    }

    private static function allowedMethods(): string
    {
        if (function_exists('config')) {
            try {
                $v = config('cors.allowed_methods');
                if (is_string($v) && $v !== '') {
                    return $v;
                }
            } catch (\Throwable) {
            }
        }

        return LegacyEnv::get('CORS_ALLOWED_METHODS', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    }

    private static function allowedHeaders(): string
    {
        if (function_exists('config')) {
            try {
                $v = config('cors.allowed_headers');
                if (is_string($v) && $v !== '') {
                    return $v;
                }
            } catch (\Throwable) {
            }
        }

        return LegacyEnv::get(
            'CORS_ALLOWED_HEADERS',
            'Content-Type, Authorization, X-Requested-With, Accept, Origin'
        );
    }

    private static function maxAge(): int
    {
        if (function_exists('config')) {
            try {
                $v = config('cors.max_age');
                if (is_int($v) || (is_string($v) && ctype_digit($v))) {
                    return (int) $v;
                }
            } catch (\Throwable) {
            }
        }

        return (int) LegacyEnv::get('CORS_MAX_AGE', '86400');
    }

    private static function supportsCredentials(): bool
    {
        if (function_exists('config')) {
            try {
                return (bool) config('cors.supports_credentials', false);
            } catch (\Throwable) {
            }
        }

        return strtolower(LegacyEnv::get('CORS_SUPPORTS_CREDENTIALS', 'false')) === 'true';
    }
}
