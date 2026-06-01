<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Rows created with NULL payment_type were excluded from net-paid SQL used for
 * adjustment caps, so purchase/billing adjustments could never be saved.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('payments') || ! Schema::hasColumn('payments', 'payment_type')) {
            return;
        }
        $ids = DB::table('payments')->whereNull('payment_type')->pluck('note', 'id');
        foreach ($ids as $id => $note) {
            $n = strtolower((string) $note);
            if (str_contains($n, 'purchase statement payment')) {
                DB::table('payments')->where('id', $id)->update(['payment_type' => 'purchase']);
            } elseif (str_contains($n, 'billing statement payment')) {
                DB::table('payments')->where('id', $id)->update(['payment_type' => 'billing']);
            }
        }
    }

    public function down(): void
    {
        // Intentionally empty: do not clear corrected payment_type values.
    }
};
