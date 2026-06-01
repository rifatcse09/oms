<?php

declare(strict_types=1);

namespace App\Http\Requests\Api;

use Illuminate\Foundation\Http\FormRequest;

class CatalogStoreItemRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'categoryId' => ['required', 'string', 'max:50'],
            'nameBn' => ['required', 'string', 'max:180'],
            'nameEn' => ['required', 'string', 'max:180'],
        ];
    }
}
