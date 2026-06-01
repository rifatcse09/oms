<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\AuthLoginRequest;
use App\Http\Requests\Api\AuthRegisterRequest;
use App\Http\Requests\Api\AuthUpdateProfileRequest;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function register(AuthRegisterRequest $request): JsonResponse
    {
        $data = $request->validated();

        $user = User::create([
            'name' => $data['name'],
            'email' => strtolower($data['email']),
            'password' => $data['password'],
            'phone' => $data['phone'] ?? '',
            'role' => 'user',
            'billing_address' => $data['billingAddress'] ?? '',
            'delivery_address' => $data['deliveryAddress'] ?? '',
            'is_active' => true,
        ]);

        return response()->json([
            'token' => $user->createToken('api-token')->plainTextToken,
            'user' => $this->publicUser($user),
        ], 201);
    }

    public function login(AuthLoginRequest $request): JsonResponse
    {
        $data = $request->validated();

        $user = User::where('email', strtolower($data['email']))->first();
        if (!$user || !Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages(['email' => ['Invalid credentials.']]);
        }
        if (isset($data['role']) && $user->role !== $data['role']) {
            throw ValidationException::withMessages(['role' => ['Selected role does not match this account.']]);
        }

        return response()->json([
            'token' => $user->createToken('api-token')->plainTextToken,
            'user' => $this->publicUser($user),
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        return response()->json(['user' => $this->publicUser($user)]);
    }

    public function updateProfile(AuthUpdateProfileRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $data = $request->validated();

        $user->fill([
            'name' => $data['name'],
            'phone' => $data['phone'] ?? '',
            'billing_address' => $data['billingAddress'] ?? '',
            'delivery_address' => $data['deliveryAddress'] ?? '',
        ]);
        $user->save();

        return response()->json(['user' => $this->publicUser($user)]);
    }

    public function logout(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $user->currentAccessToken()?->delete();
        return response()->json(['ok' => true]);
    }

    private function publicUser(User $user): array
    {
        return [
            'id' => (string) $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'role' => $user->role,
            'billingAddress' => $user->billing_address,
            'deliveryAddress' => $user->delivery_address,
            'isActive' => (bool) $user->is_active,
        ];
    }
}
