<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('color_presets', function (Blueprint $table): void {
            $table->id();
            $table->string('name', 80)->unique();
            $table->char('primary_color', 7);
            $table->char('secondary_color', 7);
            $table->char('accent_color', 7);
            $table->char('bg_color', 7);
            $table->char('particle_color', 7);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('color_presets');
    }
};
