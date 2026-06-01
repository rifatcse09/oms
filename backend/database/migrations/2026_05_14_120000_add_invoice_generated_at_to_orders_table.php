<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->timestampTz('purchase_invoice_generated_at')->nullable()->after('delivered_at');
            $table->timestampTz('billing_invoice_generated_at')->nullable()->after('purchase_invoice_generated_at');
        });

        $hasVoid = Schema::hasColumn('invoices', 'voided_at');
        foreach (DB::table('orders')->pluck('id') as $orderId) {
            $oid = (int) $orderId;
            $pQ = DB::table('invoices')->where('order_id', $oid)->where('type', 'purchase')->orderByDesc('id');
            $bQ = DB::table('invoices')->where('order_id', $oid)->where('type', 'billing')->orderByDesc('id');
            if ($hasVoid) {
                $pQ->whereNull('voided_at');
                $bQ->whereNull('voided_at');
            }
            $pAt = $pQ->value('created_at');
            $bAt = $bQ->value('created_at');
            DB::table('orders')->where('id', $oid)->update([
                'purchase_invoice_generated_at' => $pAt,
                'billing_invoice_generated_at' => $bAt,
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn(['purchase_invoice_generated_at', 'billing_invoice_generated_at']);
        });
    }
};
