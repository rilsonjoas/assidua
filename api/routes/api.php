<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\DoseLogController;
use App\Http\Controllers\DoseScheduleController;
use App\Http\Controllers\MedicationController;
use App\Http\Controllers\ProfileCollaboratorController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\PushTokenController;
use App\Http\Controllers\RevenueCatWebhookController;
use App\Http\Controllers\StockController;
use Illuminate\Support\Facades\Route;

// Fora do auth:sanctum de propósito — quem chama é o RevenueCat, não um
// usuário logado do app. Autenticação própria dentro do controller
// (header Authorization contra REVENUECAT_WEBHOOK_SECRET), não Sanctum.
// Throttle nomeado só pra ter alguma trava contra abuso do endpoint
// público — RevenueCat não manda volume alto o bastante pra precisar de
// mais que isso.
Route::post('/webhooks/revenuecat', [RevenueCatWebhookController::class, 'handle'])->middleware('throttle:60,1');

Route::prefix('auth')->group(function () {
    Route::post('/magic-link', [AuthController::class, 'requestMagicLink'])->middleware('throttle:magic-link');
    // Sem throttle nomeado: token de 64 bytes já é inadivinhável, isto é
    // só uma trava genérica contra automação/probing na rota.
    Route::get('/magic-link/redirect', [AuthController::class, 'magicLinkRedirect'])->middleware('throttle:60,1');
    Route::get('/google', [AuthController::class, 'googleRedirect']);
    Route::get('/google/callback', [AuthController::class, 'googleCallback']);
});

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::delete('/auth/account', [AuthController::class, 'destroyAccount']);

    Route::apiResource('profiles', ProfileController::class);

    // Fase 1.5, Etapa 2 — convite/resgate de cuidador remoto.
    Route::get('/profiles/{profile}/collaborators', [ProfileCollaboratorController::class, 'index']);
    Route::post('/profiles/{profile}/collaborators', [ProfileCollaboratorController::class, 'store']);
    Route::delete('/profiles/{profile}/collaborators/{collaborator}', [ProfileCollaboratorController::class, 'destroy']);
    Route::post('/invites/{code}/accept', [ProfileCollaboratorController::class, 'accept']);
    Route::post('/push-tokens', [PushTokenController::class, 'store']);

    Route::get('/profiles/{profile}/medications', [MedicationController::class, 'index']);
    Route::post('/profiles/{profile}/medications', [MedicationController::class, 'store']);
    Route::get('/medications/{medication}', [MedicationController::class, 'show']);
    Route::put('/medications/{medication}', [MedicationController::class, 'update']);
    Route::delete('/medications/{medication}', [MedicationController::class, 'destroy']);
    Route::post('/medications/{medication}/photo', [MedicationController::class, 'uploadPhoto']);
    Route::delete('/medications/{medication}/photo', [MedicationController::class, 'deletePhoto']);

    Route::get('/medications/{medication}/schedules', [DoseScheduleController::class, 'index']);
    Route::post('/medications/{medication}/schedules', [DoseScheduleController::class, 'store']);
    Route::put('/schedules/{doseSchedule}', [DoseScheduleController::class, 'update']);
    Route::delete('/schedules/{doseSchedule}', [DoseScheduleController::class, 'destroy']);

    Route::get('/profiles/{profile}/doses/today', [DoseLogController::class, 'today']);
    Route::get('/profiles/{profile}/doses/history', [DoseLogController::class, 'history']);
    Route::get('/profiles/{profile}/streak', [DoseLogController::class, 'streak']);
    Route::get('/profiles/{profile}/weekly-adherence', [DoseLogController::class, 'weeklyAdherence']);
    Route::post('/dose-logs', [DoseLogController::class, 'store']);
    Route::delete('/dose-logs/{doseLog}', [DoseLogController::class, 'destroy']);

    Route::get('/medications/{medication}/stock', [StockController::class, 'show']);
    Route::put('/medications/{medication}/stock', [StockController::class, 'update']);
});
