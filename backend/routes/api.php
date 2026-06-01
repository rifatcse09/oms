<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\AdminUserController;
use App\Http\Controllers\Api\CatalogController;
use App\Http\Controllers\Api\OrderController;
use App\Http\Controllers\Api\StockController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function (): void {
    Route::get('/health', fn () => response()->json(['ok' => true, 'service' => 'laravel-api']));

    Route::post('/auth/register', [AuthController::class, 'register']);
    Route::post('/auth/login', [AuthController::class, 'login']);
    Route::get('/catalog', [CatalogController::class, 'index']);

    Route::middleware('auth:sanctum')->group(function (): void {
        Route::post('/auth/logout', [AuthController::class, 'logout']);
        Route::get('/auth/me', [AuthController::class, 'me']);
        Route::put('/auth/profile', [AuthController::class, 'updateProfile']);

        Route::get('/orders', [OrderController::class, 'index']);
        Route::post('/orders', [OrderController::class, 'store']);
        Route::put('/orders/{order}', [OrderController::class, 'update']);

        Route::get('/admin/users', [AdminUserController::class, 'index']);
        Route::post('/admin/users', [AdminUserController::class, 'store']);
        Route::patch('/admin/users/{user}/block', [AdminUserController::class, 'toggleBlock']);
        Route::patch('/admin/users/{user}/role', [AdminUserController::class, 'updateRole']);
        Route::post('/catalog/categories', [CatalogController::class, 'storeCategory']);
        Route::post('/catalog/items', [CatalogController::class, 'storeItem']);
        Route::post('/orders/{order}/assign', [OrderController::class, 'assign']);

        // Stock management (admin + moderator read; admin write)
        Route::get('/stock', [StockController::class, 'index']);
        Route::post('/stock', [StockController::class, 'store']);
        Route::put('/stock/{stockItem}', [StockController::class, 'update']);
        Route::post('/stock/{stockItem}/adjust', [StockController::class, 'adjust']);
        Route::delete('/stock/{stockItem}', [StockController::class, 'destroy']);
    });
});
