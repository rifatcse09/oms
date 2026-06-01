<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_items', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('catalog_item_id')->nullable();
            $table->foreign('catalog_item_id')->references('id')->on('catalog_items')->nullOnDelete();
            $table->string('name_en');
            $table->string('name_bn')->default('');
            $table->string('unit')->default('kg');        // kg, piece, litre, bag, etc.
            $table->decimal('quantity', 12, 3)->default(0);
            $table->decimal('reorder_level', 12, 3)->default(0);
            $table->text('notes')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_items');
    }
};
