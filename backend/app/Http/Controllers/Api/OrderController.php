<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\OrderStoreRequest;
use App\Http\Requests\Api\OrderUpdateRequest;
use App\Models\Order;
use App\Models\OrderLine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OrderController extends Controller
{
    private function toFrontend(Order $order): array
    {
        $lines = $order->relationLoaded('lines') ? $order->lines : $order->lines()->orderBy('serial')->get();
        return [
            'id' => (string) $order->id,
            'ownerId' => (string) $order->owner_id,
            'assignedModeratorId' => $order->assigned_moderator_id ? (string) $order->assigned_moderator_id : null,
            'orderNo' => $order->order_no,
            'orderDate' => (string) $order->order_date,
            'submittedAt' => optional($order->submitted_at)?->toISOString(),
            'deliveryDate' => optional($order->delivery_datetime)?->format('Y-m-d'),
            'deliveryTime' => (string)($order->delivery_time_window ?? optional($order->delivery_datetime)?->format('H:i')),
            'status' => $order->status,
            'billingAddress' => $order->billing_address,
            'deliveryAddress' => $order->delivery_address,
            'contactPerson' => $order->contact_person,
            'phone' => $order->phone,
            'lines' => $lines->map(static function (OrderLine $line): array {
                return [
                    'id' => (string)$line->id,
                    'serial' => (int)$line->serial,
                    'categoryId' => (string)($line->category_code ?? ''),
                    'itemId' => (string)($line->item_code ?? ''),
                    'itemNameBn' => (string)$line->item_name_bn,
                    'itemNameEn' => (string)$line->item_name_en,
                    'kg' => (string)$line->kg,
                    'gram' => (string)$line->gram,
                    'piece' => (string)$line->piece,
                    'instructions' => $line->instructions,
                    'unitPrice' => $line->unit_price !== null ? (float)$line->unit_price : null,
                    'lineTotal' => $line->line_total !== null ? (float)$line->line_total : null,
                ];
            })->values(),
        ];
    }

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $q = Order::query()->with('lines')->latest('id');
        if ($user->role === 'user') {
            $q->where('owner_id', $user->id);
        }
        return response()->json(['data' => $q->get()->map(fn (Order $o) => $this->toFrontend($o))]);
    }

    public function store(OrderStoreRequest $request): JsonResponse
    {
        $user = $request->user();
        if ($user->role !== 'user') {
            return response()->json(['message' => 'Only user role can create orders.'], 403);
        }
        $data = $request->validated();

        $order = Order::create([
            'owner_id' => $user->id,
            'order_no' => 'ORD-' . now()->format('Ymd') . '-' . random_int(1000, 9999),
            'order_date' => (string)($data['orderDate'] ?? now()->toDateString()),
            'delivery_datetime' => $data['deliveryDate'] . ' ' . ($data['deliveryTime'] ?? '10:00'),
            'delivery_time_window' => $data['deliveryTime'] ?? null,
            'status' => $data['status'] ?? 'draft',
            'billing_address' => $data['billingAddress'],
            'delivery_address' => $data['deliveryAddress'],
            'contact_person' => $data['contactPerson'],
            'phone' => $data['phone'],
        ]);

        foreach (($data['lines'] ?? []) as $idx => $line) {
            $order->lines()->create([
                'serial' => (int)($line['serial'] ?? ($idx + 1)),
                'category_code' => $line['categoryId'] ?? null,
                'item_code' => $line['itemId'] ?? null,
                'item_name_bn' => $line['itemNameBn'],
                'item_name_en' => $line['itemNameEn'],
                'kg' => (float)($line['kg'] ?? 0),
                'gram' => (float)($line['gram'] ?? 0),
                'piece' => (float)($line['piece'] ?? 0),
                'instructions' => $line['instructions'] ?? null,
                'unit_price' => $line['unitPrice'] ?? null,
                'line_total' => $line['lineTotal'] ?? null,
            ]);
        }

        return response()->json(['data' => $this->toFrontend($order->fresh()->load('lines'))], 201);
    }

    public function update(OrderUpdateRequest $request, Order $order): JsonResponse
    {
        $user = $request->user();
        if ($user->role === 'user' && (int) $order->owner_id !== (int) $user->id) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $data = $request->validated();

        $payload = [];
        if (isset($data['deliveryDate']) || isset($data['deliveryTime'])) {
            $date = $data['deliveryDate'] ?? optional($order->delivery_datetime)?->format('Y-m-d') ?? now()->format('Y-m-d');
            $time = $data['deliveryTime'] ?? optional($order->delivery_datetime)?->format('H:i') ?? '10:00';
            $payload['delivery_datetime'] = $date . ' ' . $time;
            $payload['delivery_time_window'] = $data['deliveryTime'] ?? $order->delivery_time_window;
        }
        if (isset($data['orderDate'])) {
            $payload['order_date'] = $data['orderDate'];
        }
        if (isset($data['billingAddress'])) {
            $payload['billing_address'] = $data['billingAddress'];
        }
        if (isset($data['deliveryAddress'])) {
            $payload['delivery_address'] = $data['deliveryAddress'];
        }
        if (isset($data['contactPerson'])) {
            $payload['contact_person'] = $data['contactPerson'];
        }
        if (isset($data['phone'])) {
            $payload['phone'] = $data['phone'];
        }
        if (isset($data['status'])) {
            $payload['status'] = $data['status'];
            if ($data['status'] === 'submitted' && !$order->submitted_at) {
                $payload['submitted_at'] = now();
            }
        }

        if (!empty($payload)) {
            $order->fill($payload);
            $order->save();
        }

        if (array_key_exists('lines', $data)) {
            $order->lines()->delete();
            foreach (($data['lines'] ?? []) as $idx => $line) {
                $order->lines()->create([
                    'serial' => (int)($line['serial'] ?? ($idx + 1)),
                    'category_code' => $line['categoryId'] ?? null,
                    'item_code' => $line['itemId'] ?? null,
                    'item_name_bn' => $line['itemNameBn'],
                    'item_name_en' => $line['itemNameEn'],
                    'kg' => (float)($line['kg'] ?? 0),
                    'gram' => (float)($line['gram'] ?? 0),
                    'piece' => (float)($line['piece'] ?? 0),
                    'instructions' => $line['instructions'] ?? null,
                    'unit_price' => $line['unitPrice'] ?? null,
                    'line_total' => $line['lineTotal'] ?? null,
                ]);
            }
        }

        return response()->json(['data' => $this->toFrontend($order->fresh()->load('lines'))]);
    }

    /** Admin / master_admin: assign an order to a moderator (or unassign). */
    public function assign(Request $request, Order $order): JsonResponse
    {
        $actor = $request->user();
        if (! in_array($actor->role, ['admin', 'master_admin', 'moderator'], true)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }
        $data = $request->validate([
            'moderatorId' => 'nullable|integer|exists:users,id',
        ]);
        $order->update(['assigned_moderator_id' => $data['moderatorId'] ?? null]);
        return response()->json(['data' => $this->toFrontend($order->fresh()->load('lines'))]);
    }
}
