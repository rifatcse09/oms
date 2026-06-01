<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Gateway;

use App\Services\Billing\BillingCycleConfigService;

/**
 * GET /api/v1/billing-cycle-config (admin / moderator).
 */
final class BillingCycleConfigController
{
    public function show(): void
    {
        $user = require_auth();
        require_role($user, ['admin', 'master_admin', 'moderator']);
        json_response(200, ['data' => (new BillingCycleConfigService())->toArray()]);
    }
}
