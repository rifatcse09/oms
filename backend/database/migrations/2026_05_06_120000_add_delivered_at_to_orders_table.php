<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('orders', 'delivered_at')) {
            return;
        }

        Schema::table('orders', function (Blueprint $table) {
            $table->timestampTz('delivered_at')->nullable()->after('submitted_at');
        });
    }

    public function down(): void
    {
        if (! Schema::hasColumn('orders', 'delivered_at')) {
            return;
        }

        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn('delivered_at');
        });
    }
};
