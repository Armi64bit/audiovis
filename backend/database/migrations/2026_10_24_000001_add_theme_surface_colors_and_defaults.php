<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('color_presets', function (Blueprint $table): void {
            $table->char('surface_color', 7)->default('#f3f5f3');
            $table->char('muted_color', 7)->default('#6f7d7a');
        });

        $now = now();
        DB::table('color_presets')->insertOrIgnore([
            [
                'name' => 'Signal / Light',
                'primary_color' => '#1d2929',
                'secondary_color' => '#ce39a8',
                'accent_color' => '#00a6c7',
                'bg_color' => '#e6ebea',
                'particle_color' => '#62dce3',
                'surface_color' => '#f3f5f3',
                'muted_color' => '#6f7d7a',
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'name' => 'Signal / Dark',
                'primary_color' => '#e5eeeb',
                'secondary_color' => '#d65aa9',
                'accent_color' => '#43c4dc',
                'bg_color' => '#151c1c',
                'particle_color' => '#78dce5',
                'surface_color' => '#202929',
                'muted_color' => '#9eaaa7',
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'name' => 'Cyan / Graphite',
                'primary_color' => '#d9e7e8',
                'secondary_color' => '#7c8fd6',
                'accent_color' => '#51d5e8',
                'bg_color' => '#111923',
                'particle_color' => '#9fe8e7',
                'surface_color' => '#1c2933',
                'muted_color' => '#94a5ae',
                'created_at' => $now,
                'updated_at' => $now,
            ],
        ]);
    }

    public function down(): void
    {
        DB::table('color_presets')
            ->whereIn('name', ['Signal / Light', 'Signal / Dark', 'Cyan / Graphite'])
            ->delete();

        Schema::table('color_presets', function (Blueprint $table): void {
            $table->dropColumn(['surface_color', 'muted_color']);
        });
    }
};
