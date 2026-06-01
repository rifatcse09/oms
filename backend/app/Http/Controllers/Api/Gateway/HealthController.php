<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Gateway;

/**
 * GET /api/v1/health — served before the procedural router.
 */
final class HealthController
{
    public function __invoke(): void
    {
        json_response(200, ['ok' => true, 'service' => 'gom-backend']);
    }
}
