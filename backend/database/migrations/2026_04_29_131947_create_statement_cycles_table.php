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
        Schema::create('statement_cycles', function (Blueprint $table) {
            $table->id();
            $table->enum('type', ['purchase', 'billing'])->index();
            $table->date('cycle_start');
            $table->date('cycle_end');
            $table->foreignId('generated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->json('meta')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('statement_cycles');
    }
};
