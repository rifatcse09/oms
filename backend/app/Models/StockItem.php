<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockItem extends Model
{
    protected $fillable = [
        'catalog_item_id',
        'name_en',
        'name_bn',
        'unit',
        'quantity',
        'reorder_level',
        'notes',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'quantity'      => 'float',
            'reorder_level' => 'float',
            'is_active'     => 'boolean',
        ];
    }

    public function catalogItem(): BelongsTo
    {
        return $this->belongsTo(CatalogItem::class);
    }
}
