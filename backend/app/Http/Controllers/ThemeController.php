<?php

namespace App\Http\Controllers;

use App\Models\ColorPreset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ThemeController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(ColorPreset::query()->orderBy('name')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $preset = ColorPreset::create($request->validate([
            'name' => ['required', 'string', 'max:80', 'unique:color_presets,name'],
            'primary_color' => ['required', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'secondary_color' => ['required', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'accent_color' => ['required', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'bg_color' => ['required', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'particle_color' => ['required', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'surface_color' => ['sometimes', 'required', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'muted_color' => ['sometimes', 'required', 'regex:/^#[0-9A-Fa-f]{6}$/'],
        ]));

        return response()->json($preset, 201);
    }
}
