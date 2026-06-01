<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('order_lines', function (Blueprint $table) {
            $table->decimal('markup_percent', 8, 2)->default(0)->after('line_total');
            $table->decimal('markup_amount', 12, 2)->default(0)->after('markup_percent');
            $table->decimal('unit_price_after_markup', 12, 2)->nullable()->after('markup_amount');
            $table->decimal('line_total_after_markup', 12, 2)->nullable()->after('unit_price_after_markup');
            $table->decimal('profit_loss_amount', 12, 2)->default(0)->after('line_total_after_markup');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('order_lines', function (Blueprint $table) {
            $table->dropColumn([
                'markup_percent',
                'markup_amount',
                'unit_price_after_markup',
                'line_total_after_markup',
                'profit_loss_amount',
            ]);
        });
    }
};

