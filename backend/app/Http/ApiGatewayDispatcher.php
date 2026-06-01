<?php

declare(strict_types=1);

namespace App\Http;

use App\Http\Controllers\Api\Gateway\BillingCycleConfigController;
use App\Http\Controllers\Api\Gateway\CatalogMapController;
use App\Http\Controllers\Api\Gateway\HealthController;

/**
 * Dispatches a small set of /api/v1 routes before the procedural router
 * ({@see api_gateway_dispatch_routes()} in ApiGatewayRouteHandlers.php).
 */
final class ApiGatewayDispatcher
{
    /**
     * Handle early routes (calls json_response + exit on match).
     */
    public static function dispatchIfMatched(string $method, string $path): void
    {
        if ($path === '/api/v1/health' && $method === 'GET') {
            (new HealthController())->__invoke();
        }
        if ($path === '/api/v1/billing-cycle-config' && $method === 'GET') {
            (new BillingCycleConfigController())->show();
        }
        if ($path === '/api/v1/catalog' && $method === 'GET') {
            (new CatalogMapController())->index();
        }
    }
}
