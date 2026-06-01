<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Model;

class Order extends Model
{
    protected $fillable = [
        'owner_id',
        'assigned_moderator_id',
        'order_no',
        'order_date',
        'delivery_datetime',
        'delivery_time_window',
        'status',
        'billing_address',
        'delivery_address',
        'contact_person',
        'phone',
        'submitted_at',
        'is_active',
        'is_delayed',
    ];

    protected function casts(): array
    {
        return [
            'delivery_datetime' => 'datetime',
            'submitted_at' => 'datetime',
            'is_active' => 'boolean',
            'is_delayed' => 'boolean',
        ];
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(OrderLine::class);
    }
}
