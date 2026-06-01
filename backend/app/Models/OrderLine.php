<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Model;

class OrderLine extends Model
{
    protected $fillable = [
        'order_id',
        'serial',
        'category_code',
        'item_code',
        'item_name_bn',
        'item_name_en',
        'kg',
        'gram',
        'piece',
        'instructions',
        'unit_price',
        'line_total',
    ];

    protected function casts(): array
    {
        return [
            'kg' => 'decimal:3',
            'gram' => 'decimal:3',
            'piece' => 'decimal:3',
            'unit_price' => 'decimal:2',
            'line_total' => 'decimal:2',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }
}
