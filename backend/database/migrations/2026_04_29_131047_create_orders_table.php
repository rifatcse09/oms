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
        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('owner_id')->constrained('users')->restrictOnDelete();
            $table->string('order_no')->unique();
            $table->date('order_date');
            $table->dateTimeTz('delivery_datetime');
            $table->string('delivery_time_window', 120)->nullable();
            $table->string('status')->default('draft')->index();
            $table->text('billing_address');
            $table->text('delivery_address');
            $table->string('contact_person', 120);
            $table->string('phone', 40);
            $table->timestampTz('submitted_at')->nullable();
            $table->boolean('is_active')->default(true)->index();
            $table->boolean('is_delayed')->default(false)->index();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('orders');
    }
};
