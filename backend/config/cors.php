<?php

declare(strict_types=1);

/**
 * CORS settings for the API (Laravel middleware + legacy public/index.php entry).
 *
 * @see App\Http\Cors\CorsPolicy
 */
$origins = env('CORS_ALLOWED_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173');
$originsList = array_values(array_filter(array_map('trim', explode(',', (string) $origins))));

return [
    'allowed_origins' => $originsList,
    'allowed_methods' => env('CORS_ALLOWED_METHODS', 'GET, POST, PUT, PATCH, DELETE, OPTIONS'),
    'allowed_headers' => env(
        'CORS_ALLOWED_HEADERS',
        'Content-Type, Authorization, X-Requested-With, Accept, Origin'
    ),
    'max_age' => (int) env('CORS_MAX_AGE', 86400),
    'supports_credentials' => filter_var(env('CORS_SUPPORTS_CREDENTIALS', false), FILTER_VALIDATE_BOOL),
];
