<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Removes orders and all directly tied finance / document rows.
 * Preserves: users, auth_tokens, categories, catalog_items, and item_price_histories
 * rows that are not tied to an order (order_id IS NULL).
 */
class PurgeOrderTransactionalData extends Command
{
    protected $signature = 'db:purge-order-data
                            {--force : Run without interactive confirmation}';

    protected $description = 'Delete all orders and related data (keeps users, catalog, categories, catalog price history)';

    public function handle(): int
    {
        if (! $this->option('force') && ! $this->confirm('This permanently deletes all orders, invoices, payments, challans, adjustments, etc. Users and catalog stay. Continue?', false)) {
            $this->warn('Aborted.');

            return self::SUCCESS;
        }

        $tables = [
            'payments',
            'invoices',
            'challans',
            'order_lines',
            'adjustments',
            'ledger_entries',
            'statement_cycles',
            'activity_logs',
            'notifications',
            'orders',
        ];

        foreach ($tables as $t) {
            if (! Schema::hasTable($t)) {
                $this->error("Missing table `{$t}` — run migrations first.");

                return self::FAILURE;
            }
        }

        DB::transaction(function (): void {
            DB::table('payments')->delete();
            DB::table('invoices')->delete();
            DB::table('challans')->delete();
            DB::table('order_lines')->delete();

            if (Schema::hasColumn('item_price_histories', 'order_id')) {
                DB::table('item_price_histories')->whereNotNull('order_id')->delete();
            }

            DB::table('adjustments')->delete();
            DB::table('ledger_entries')->delete();
            DB::table('statement_cycles')->delete();
            DB::table('activity_logs')->delete();
            DB::table('notifications')->delete();
            DB::table('orders')->delete();
        });

        $this->info('Order-related data removed. Users, categories, catalog_items, and catalog-only price rows (order_id NULL) were kept.');
        $this->line('Reload the app (hard refresh) or call GET /api/v1/orders so lists pick up an empty state.');

        return self::SUCCESS;
    }
}
