<?php

declare(strict_types=1);

namespace App\Http\Requests\Api;

use Concerns\ValidatesOrderLinePayload;
use Illuminate\Foundation\Http\FormRequest;

class OrderUpdateRequest extends FormRequest
{
    use ValidatesOrderLinePayload;

    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return array_merge([
            'deliveryDate' => ['nullable', 'date'],
            'deliveryTime' => ['nullable', 'string', 'max:120'],
            'billingAddress' => ['nullable', 'string'],
            'deliveryAddress' => ['nullable', 'string'],
            'contactPerson' => ['nullable', 'string', 'max:120'],
            'phone' => ['nullable', 'string', 'max:40'],
            'status' => ['nullable', 'string'],
            'orderDate' => ['nullable', 'date'],
        ], $this->orderLineRules());
    }
}
