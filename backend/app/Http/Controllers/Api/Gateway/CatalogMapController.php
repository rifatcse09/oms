<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Gateway;

use App\Database\LegacyPdo;
use App\Services\Catalog\CatalogMapService;

/**
 * GET /api/v1/catalog (public).
 */
final class CatalogMapController
{
    public function index(): void
    {
        $data = (new CatalogMapService(LegacyPdo::connection()))->mapIndexed();
        json_response(200, ['data' => array_values($data)]);
    }
}
