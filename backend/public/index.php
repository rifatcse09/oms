<?php

declare(strict_types=1);

use App\Http\Cors\CorsPolicy;

define('LARAVEL_START', microtime(true));

if (file_exists($maintenance = dirname(__DIR__) . '/storage/framework/maintenance.php')) {
    require $maintenance;
}

require_once dirname(__DIR__) . '/vendor/autoload.php';

CorsPolicy::handleApiPreflight();

require_once dirname(__DIR__) . '/app/Support/Api/ApiProcedures.php';

set_error_handler(static function (int $severity, string $message, string $file, int $line): bool {
    if (!(error_reporting() & $severity)) {
        return false;
    }
    throw new ErrorException($message, 0, $severity, $file, $line);
});

set_exception_handler(static function (Throwable $e): void {
    $payload = ['message' => 'Internal server error.'];
    try {
        if (app_debug()) {
            $payload['error'] = $e->getMessage();
            $payload['file'] = $e->getFile();
            $payload['line'] = $e->getLine();
        }
        json_response(500, $payload);
    } catch (Throwable) {
        if (! headers_sent()) {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode($payload, JSON_UNESCAPED_UNICODE);
        exit;
    }
});

$method = $_SERVER['REQUEST_METHOD'];
$path = legacy_api_request_path();

\App\Http\ApiGatewayDispatcher::dispatchIfMatched($method, $path);

require_once dirname(__DIR__) . '/app/Http/ApiGatewayRouteHandlers.php';
api_gateway_dispatch_routes($method, $path);
