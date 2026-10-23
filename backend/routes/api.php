<?php

use App\Http\Controllers\AudioController;
use App\Http\Controllers\ThemeController;
use Illuminate\Support\Facades\Route;

Route::post('/audio/upload', [AudioController::class, 'store']);
Route::get('/audio/{audioTrack}', [AudioController::class, 'show']);
Route::get('/themes', [ThemeController::class, 'index']);
Route::post('/themes', [ThemeController::class, 'store']);
