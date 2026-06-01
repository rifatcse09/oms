<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\StockItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StockController extends Controller
{
    private function toFrontend(StockItem $s): array
    {
        return [
            'id'            => (string) $s->id,
            'catalogItemId' => $s->catalog_item_id ? (string) $s->catalog_item_id : null,
            'nameEn'        => $s->name_en,
            'nameBn'        => $s->name_bn,
            'unit'          => $s->unit,
            'quantity'      => (float) $s->quantity,
            'reorderLevel'  => (float) $s->reorder_level,
            'notes'         => $s->notes,
            'isActive'      => (bool) $s->is_active,
            'updatedAt'     => $s->updated_at?->toIso8601String(),
        ];
    }

    private function guard(Request $request): ?JsonResponse
    {
        if (! in_array($request->user()->role, ['admin', 'master_admin', 'moderator'], true)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }
        return null;
    }

    private function guardAdmin(Request $request): ?JsonResponse
    {
        if (! in_array($request->user()->role, ['admin', 'master_admin'], true)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }
        return null;
    }

    public function index(Request $request): JsonResponse
    {
        if ($err = $this->guard($request)) return $err;
        $items = StockItem::query()->where('is_active', true)->orderBy('name_en')->get();
        return response()->json(['data' => $items->map(fn (StockItem $s) => $this->toFrontend($s))]);
    }

    public function store(Request $request): JsonResponse
    {
        if ($err = $this->guardAdmin($request)) return $err;
        $data = $request->validate([
            'nameEn'        => 'required|string|max:255',
            'nameBn'        => 'sometimes|string|max:255',
            'unit'          => 'sometimes|string|max:50',
            'quantity'      => 'sometimes|numeric|min:0',
            'reorderLevel'  => 'sometimes|numeric|min:0',
            'catalogItemId' => 'sometimes|nullable|integer|exists:catalog_items,id',
            'notes'         => 'sometimes|nullable|string',
        ]);
        $item = StockItem::create([
            'name_en'         => $data['nameEn'],
            'name_bn'         => $data['nameBn'] ?? '',
            'unit'            => $data['unit'] ?? 'kg',
            'quantity'        => $data['quantity'] ?? 0,
            'reorder_level'   => $data['reorderLevel'] ?? 0,
            'catalog_item_id' => $data['catalogItemId'] ?? null,
            'notes'           => $data['notes'] ?? null,
            'is_active'       => true,
        ]);
        return response()->json(['data' => $this->toFrontend($item)], 201);
    }

    public function update(Request $request, StockItem $stockItem): JsonResponse
    {
        if ($err = $this->guardAdmin($request)) return $err;
        $data = $request->validate([
            'nameEn'       => 'sometimes|string|max:255',
            'nameBn'       => 'sometimes|string|max:255',
            'unit'         => 'sometimes|string|max:50',
            'quantity'     => 'sometimes|numeric|min:0',
            'reorderLevel' => 'sometimes|numeric|min:0',
            'notes'        => 'sometimes|nullable|string',
            'isActive'     => 'sometimes|boolean',
        ]);
        $stockItem->update(array_filter([
            'name_en'       => $data['nameEn'] ?? null,
            'name_bn'       => $data['nameBn'] ?? null,
            'unit'          => $data['unit'] ?? null,
            'quantity'      => $data['quantity'] ?? null,
            'reorder_level' => $data['reorderLevel'] ?? null,
            'notes'         => array_key_exists('notes', $data) ? $data['notes'] : null,
            'is_active'     => $data['isActive'] ?? null,
        ], fn ($v) => $v !== null));
        return response()->json(['data' => $this->toFrontend($stockItem->fresh())]);
    }

    /** Adjust quantity up (restock) or down (consumption/sale). */
    public function adjust(Request $request, StockItem $stockItem): JsonResponse
    {
        if ($err = $this->guard($request)) return $err;
        $data = $request->validate([
            'delta' => 'required|numeric',
            'notes' => 'sometimes|nullable|string',
        ]);
        $newQty = max(0, $stockItem->quantity + $data['delta']);
        $stockItem->update(['quantity' => $newQty]);
        if (! empty($data['notes'])) {
            $stockItem->update(['notes' => $data['notes']]);
        }
        return response()->json(['data' => $this->toFrontend($stockItem->fresh())]);
    }

    public function destroy(StockItem $stockItem, Request $request): JsonResponse
    {
        if ($err = $this->guardAdmin($request)) return $err;
        $stockItem->update(['is_active' => false]);
        return response()->json(['message' => 'Deleted']);
    }
}
