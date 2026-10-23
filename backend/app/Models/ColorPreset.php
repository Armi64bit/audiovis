<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ColorPreset extends Model
{
    protected $fillable = [
        'name',
        'primary_color',
        'secondary_color',
        'accent_color',
        'bg_color',
        'particle_color',
        'surface_color',
        'muted_color',
    ];
}
