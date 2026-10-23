<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AudioTrack extends Model
{
    protected $fillable = [
        'filename',
        'path',
        'duration',
        'bpm',
        'key',
        'loudness_lufs',
        'waveform_data',
    ];

    protected function casts(): array
    {
        return [
            'duration' => 'float',
            'bpm' => 'float',
            'loudness_lufs' => 'float',
            'waveform_data' => 'array',
        ];
    }
}
