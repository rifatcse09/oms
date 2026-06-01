<?php

declare(strict_types=1);

namespace App\Http\Requests\Api\Concerns;

trait ValidatesOrderLinePayload
{
    /** @return array<string, mixed> */
    protected function orderLineRules(): array
    {
        return [
            'lines' => ['nullable', 'array'],
            'lines.*.serial' => ['nullable', 'integer', 'min:1'],
            'lines.*.categoryId' => ['nullable', 'string', 'max:50'],
            'lines.*.itemId' => ['nullable', 'string', 'max:80'],
            'lines.*.itemNameBn' => ['required_with:lines', 'string', 'max:180'],
            'lines.*.itemNameEn' => ['required_with:lines', 'string', 'max:180'],
            'lines.*.kg' => ['nullable'],
            'lines.*.gram' => ['nullable'],
            'lines.*.piece' => ['nullable'],
            'lines.*.instructions' => ['nullable', 'string'],
            'lines.*.unitPrice' => ['nullable', 'numeric'],
            'lines.*.lineTotal' => ['nullable', 'numeric'],
        ];
    }
}
