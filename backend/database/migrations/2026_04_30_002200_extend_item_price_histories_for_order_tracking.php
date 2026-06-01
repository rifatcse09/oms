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
        Schema::table('item_price_histories', function (Blueprint $table) {
            $table->foreignId('order_id')->nullable()->after('catalog_item_id')->constrained('orders')->cascadeOnDelete();
            $table->string('item_code', 80)->nullable()->after('order_id')->index();
            $table->decimal('unit_price', 12, 2)->nullable()->after('new_price');
            $table->decimal('line_total', 12, 2)->nullable()->after('unit_price');
            $table->unique(['order_id', 'item_code'], 'item_price_histories_order_item_unique');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('item_price_histories', function (Blueprint $table) {
            $table->dropUnique('item_price_histories_order_item_unique');
            $table->dropColumn(['line_total', 'unit_price', 'item_code']);
            $table->dropConstrainedForeignId('order_id');
        });
    }
};

