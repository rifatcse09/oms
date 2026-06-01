<?php

declare(strict_types=1);

namespace App\Services\Billing;

use App\Support\LegacyEnv;

/**
 * Billing cycle for statement bucketing (.env — see backend/.env.example).
 *
 * @return array{cycleDays: int, weekStartDay: int, label: string}
 */
final class BillingCycleConfigService
{
    /**
     * @return array{cycleDays: int, weekStartDay: int, label: string}
     */
    public function toArray(): array
    {
        $days = (int) LegacyEnv::get('BILLING_CYCLE_DAYS', '7');
        if ($days !== 7 && $days !== 14) {
            $days = 7;
        }
        $weekStart = (int) LegacyEnv::get('BILLING_CYCLE_WEEK_START_DAY', '0');
        if ($weekStart < 0 || $weekStart > 6) {
            $weekStart = 0;
        }
        $label = trim(LegacyEnv::get('BILLING_CYCLE_LABEL', ''));
        if ($label === '') {
            $dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            $startName = $dayNames[$weekStart] ?? 'Sunday';
            $endName = $dayNames[($weekStart + 6) % 7] ?? 'Saturday';
            $label = $days === 7
                ? "Weekly ({$startName} - {$endName})"
                : 'Bi-weekly billing cycle';
        }

        return [
            'cycleDays' => $days,
            'weekStartDay' => $weekStart,
            'label' => $label,
        ];
    }
}
