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
        Schema::create('order_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->unsignedInteger('serial')->default(1);
            $table->string('category_code', 50)->nullable()->index();
            $table->string('item_code', 80)->nullable()->index();
            $table->string('item_name_bn', 180);
            $table->string('item_name_en', 180);
            $table->decimal('kg', 10, 3)->default(0);
            $table->decimal('gram', 10, 3)->default(0);
            $table->decimal('piece', 10, 3)->default(0);
            $table->text('instructions')->nullable();
            $table->decimal('unit_price', 12, 2)->nullable();
            $table->decimal('line_total', 12, 2)->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('order_lines');
    }
};
