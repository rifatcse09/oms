<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\CatalogStoreCategoryRequest;
use App\Http\Requests\Api\CatalogStoreItemRequest;
use App\Models\CatalogItem;
use App\Models\Category;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class CatalogController extends Controller
{
    private function nextCategoryCodeFromEnglishName(string $nameEn): string
    {
        $baseSlug = Str::slug($nameEn, '-');
        if ($baseSlug === '') {
            $baseSlug = 'category';
        }
        $base = 'custom-cat-' . $baseSlug;
        $base = substr($base, 0, 50);
        $code = $base;
        $suffix = 2;
        while (Category::query()->where('code', $code)->exists()) {
            $suffixText = '-' . $suffix;
            $trimLen = max(1, 50 - strlen($suffixText));
            $code = substr($base, 0, $trimLen) . $suffixText;
            $suffix++;
        }

        return $code;
    }

    public function index(Request $request): JsonResponse
    {
        $categories = Category::query()
            ->where('is_active', true)
            ->with(['items' => fn ($q) => $q->where('is_active', true)->orderBy('name_en')])
            ->orderBy('name_en')
            ->get()
            ->map(static function (Category $category): array {
                return [
                    'id' => $category->code,
                    'nameBn' => $category->name_bn,
                    'nameEn' => $category->name_en,
                    'markupPercent' => (float)$category->markup_percent,
                    'items' => $category->items->map(static fn ($item): array => [
                        'id' => $item->code,
                        'categoryId' => $category->code,
                        'nameBn' => $item->name_bn,
                        'nameEn' => $item->name_en,
                    ])->values(),
                ];
            })
            ->values();

        return response()->json(['data' => $categories]);
    }

    public function storeCategory(CatalogStoreCategoryRequest $request): JsonResponse
    {
        $user = $request->user();
        if (!$user || !in_array($user->role, ['admin', 'moderator'], true)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }
        $data = $request->validated();
        $duplicateExists = Category::query()
            ->where('is_active', true)
            ->where(static function ($q) use ($data): void {
                $q->whereRaw('LOWER(name_bn) = LOWER(?)', [$data['nameBn']])
                    ->orWhereRaw('LOWER(name_en) = LOWER(?)', [$data['nameEn']]);
            })
            ->exists();
        if ($duplicateExists) {
            return response()->json(['message' => 'Duplicate category name found for Bangla or English.'], 409);
        }
        $code = $this->nextCategoryCodeFromEnglishName($data['nameEn']);
        $category = Category::query()->create([
            'code' => $code,
            'name_bn' => $data['nameBn'],
            'name_en' => $data['nameEn'],
            'markup_percent' => 0,
            'is_active' => true,
        ]);
        return response()->json([
            'data' => [
                'id' => $category->code,
                'nameBn' => $category->name_bn,
                'nameEn' => $category->name_en,
                'markupPercent' => (float)$category->markup_percent,
                'items' => [],
            ],
        ], 201);
    }

    public function storeItem(CatalogStoreItemRequest $request): JsonResponse
    {
        $user = $request->user();
        if (!$user || !in_array($user->role, ['admin', 'moderator', 'user'], true)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }
        $data = $request->validated();
        $category = Category::query()->where('code', $data['categoryId'])->first();
        if (!$category) {
            return response()->json(['message' => 'Category not found'], 404);
        }
        $duplicateExists = CatalogItem::query()
            ->where('category_id', $category->id)
            ->where('is_active', true)
            ->where(static function ($q) use ($data): void {
                $q->whereRaw('LOWER(name_bn) = LOWER(?)', [$data['nameBn']])
                    ->orWhereRaw('LOWER(name_en) = LOWER(?)', [$data['nameEn']]);
            })
            ->exists();
        if ($duplicateExists) {
            return response()->json(['message' => 'Duplicate item name found in this category for Bangla or English.'], 409);
        }
        $code = 'custom-' . $category->code . '-' . now()->timestamp . '-' . random_int(100, 999);
        $item = CatalogItem::query()->create([
            'category_id' => $category->id,
            'code' => $code,
            'name_bn' => $data['nameBn'],
            'name_en' => $data['nameEn'],
            'is_active' => true,
        ]);
        return response()->json([
            'data' => [
                'id' => $item->code,
                'categoryId' => $category->code,
                'nameBn' => $item->name_bn,
                'nameEn' => $item->name_en,
            ],
        ], 201);
    }
}
