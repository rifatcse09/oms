<?php

declare(strict_types=1);

namespace App\Http\Requests\Api;

use Concerns\ValidatesOrderLinePayload;
use Illuminate\Foundation\Http\FormRequest;

class OrderStoreRequest extends FormRequest
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
            'deliveryDate' => ['required', 'date'],
            'deliveryTime' => ['nullable', 'string', 'max:120'],
            'billingAddress' => ['required', 'string'],
            'deliveryAddress' => ['required', 'string'],
            'contactPerson' => ['required', 'string', 'max:120'],
            'phone' => ['required', 'string', 'max:40'],
            'status' => ['nullable', 'string'],
            'orderDate' => ['nullable', 'date'],
        ], $this->orderLineRules());
    }
}
