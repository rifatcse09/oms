<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\AdminUserStoreRequest;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminUserController extends Controller
{
    private function toFrontend(User $user): array
    {
        return [
            'id'              => (string) $user->id,
            'name'            => $user->name,
            'email'           => $user->email,
            'phone'           => $user->phone,
            'role'            => $user->role,
            'billingAddress'  => $user->billing_address,
            'deliveryAddress' => $user->delivery_address,
            'isActive'        => (bool) $user->is_active,
            'emailVerifiedAt' => $user->email_verified_at?->toIso8601String(),
            'created_at'      => $user->created_at?->toIso8601String(),
            'updated_at'      => $user->updated_at?->toIso8601String(),
        ];
    }

    public function index(Request $request): JsonResponse
    {
        if (! in_array($request->user()->role, ['admin', 'master_admin'], true)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }
        $users = User::query()->latest('id')->get()->map(fn (User $u) => $this->toFrontend($u));
        return response()->json(['data' => $users]);
    }

    public function store(AdminUserStoreRequest $request): JsonResponse
    {
        if (! in_array($request->user()->role, ['admin', 'master_admin'], true)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }
        $data = $request->validated();
        if (($data['role'] ?? '') === 'master_admin' && $request->user()->role !== 'master_admin') {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $created = User::create([
            'name' => $data['name'],
            'email' => strtolower($data['email']),
            'password' => $data['password'],
            'phone' => $data['phone'] ?? '',
            'role' => $data['role'],
            'billing_address' => $data['billingAddress'] ?? '',
            'delivery_address' => $data['deliveryAddress'] ?? '',
            'is_active' => true,
        ]);

        return response()->json(['data' => $this->toFrontend($created)], 201);
    }

    public function toggleBlock(Request $request, User $user): JsonResponse
    {
        if (! in_array($request->user()->role, ['admin', 'master_admin'], true)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }
        if ($user->id === $request->user()->id) {
            return response()->json(['message' => 'You cannot block your own account.'], 422);
        }
        $user->update(['is_active' => ! $user->is_active]);
        return response()->json(['data' => $this->toFrontend($user->fresh())]);
    }

    public function updateRole(Request $request, User $user): JsonResponse
    {
        if (! in_array($request->user()->role, ['admin', 'master_admin'], true)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }
        if ($user->id === $request->user()->id) {
            return response()->json(['message' => 'You cannot change your own role.'], 422);
        }
        $data = $request->validate([
            'role' => 'required|string|in:user,moderator,admin,master_admin',
        ]);
        if ($data['role'] === 'master_admin' && $request->user()->role !== 'master_admin') {
            return response()->json(['message' => 'Only master admin can assign master_admin role.'], 403);
        }
        $user->update(['role' => $data['role']]);
        return response()->json(['data' => $this->toFrontend($user->fresh())]);
    }
}
