# Audiovis

An Angular audio visualizer dashboard with a Laravel 13 API for audio uploads,
waveform extraction, loudness analysis, and saved color presets.

## Frontend

```powershell
cd frontend
npm install
npm start
```

The dashboard works locally with browser audio playback and Web Audio analysis.
Set `apiBaseUrl` in `frontend/src/app/services/audio-api.service.ts` to use the
Laravel API. Built-in palettes are available even when the API is offline;
custom colors are stored in browser storage and audio plays directly from the
selected file.

The dashboard includes SPECIMEN, ROLL, FOUNTAIN, ORBIT, and GLYPH, plus waveform,
stereo scope, spectrum, spectrogram, and note-network panels. Use a card's
three-dot menu to hide or restore it and adjust its intensity; these per-card
preferences are saved in browser storage. Each menu also customizes that card's
signal, bloom, particle, and line colors. Use “Randomize all colors” in the
color drawer to generate and save a coordinated workspace and per-card palette.
The spectrogram keeps a bounded rolling history while audio is playing.

## Laravel API

The API source is in `backend`. It requires PHP 8.3+, Composer, SQLite, FFmpeg,
and FFprobe. Add the PHP and Composer install directories to `PATH` before
running the commands below. In this environment they are `C:\php` and
`C:\ProgramData\ComposerSetup\bin`.

```powershell
cd backend
Copy-Item .env.example .env
composer install
php artisan key:generate
New-Item -ItemType File -Path database/database.sqlite
php artisan migrate
php artisan serve
```

If VS Code was open during PHP installation, restart its terminal (or VS Code)
so the updated `PATH` is available to Composer.

Endpoints:

- `POST /api/audio/upload` accepts an `audio` file (MP3, WAV, or FLAC, up to 50 MB).
- `GET /api/audio/{id}` returns metadata and the waveform.
- `GET /api/audio/{id}?stream=1` streams the uploaded audio.
- `GET /api/themes` lists the built-in and saved color presets.
- `POST /api/themes` validates and stores a color preset.

FFmpeg and FFprobe must be on `PATH`, or configured with `FFMPEG_BIN` and
`FFPROBE_BIN`. Upload analysis extracts duration, waveform, integrated loudness,
and an estimated tempo from the first 90 seconds of bass-band onset data. The
key and active pitches are estimated from the live spectrum after playback
begins. Tempo and key are estimates and remain blank when the signal is
insufficient. Visuals respond to measured frequency bands and pitch peaks; the
application does not isolate instrument stems.

For 50 MB uploads, configure PHP's `upload_max_filesize` to at least `50M` and
`post_max_size` to at least `52M`. If using Nginx, set `client_max_body_size`
to at least `52m`.
