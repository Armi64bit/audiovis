<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audio_tracks', function (Blueprint $table): void {
            $table->id();
            $table->string('filename');
            $table->string('path');
            $table->decimal('duration', 10, 2);
            $table->decimal('bpm', 6, 2)->nullable();
            $table->string('key')->nullable();
            $table->decimal('loudness_lufs', 6, 2)->nullable();
            $table->json('waveform_data');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audio_tracks');
    }
};
