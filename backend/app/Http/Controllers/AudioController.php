<?php

namespace App\Http\Controllers;

use App\Models\AudioTrack;
use App\Services\AudioAnalyzer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

class AudioController extends Controller
{
    public function store(Request $request, AudioAnalyzer $analyzer): JsonResponse
    {
        $validated = $request->validate([
            'audio' => ['required', 'file', 'max:51200', 'mimes:mp3,wav,flac'],
        ]);

        $file = $validated['audio'];
        $path = $file->store('audio', 'local');

        try {
            $analysis = $analyzer->analyze(Storage::disk('local')->path($path));

            $track = AudioTrack::create([
                'filename' => $file->getClientOriginalName(),
                'path' => $path,
                ...$analysis,
            ]);
        } catch (Throwable $exception) {
            Storage::disk('local')->delete($path);
            report($exception);

            return response()->json([
                'message' => 'Audio analysis failed. Check that FFmpeg and FFprobe are installed.',
            ], 422);
        }

        return response()->json($this->trackPayload($track), 201);
    }

    public function show(AudioTrack $audioTrack): JsonResponse|StreamedResponse
    {
        if (request()->boolean('stream')) {
            abort_unless(Storage::disk('local')->exists($audioTrack->path), 404);

            return Storage::disk('local')->response(
                $audioTrack->path,
                $audioTrack->filename,
                ['Content-Type' => $this->contentType($audioTrack->filename)]
            );
        }

        return response()->json($this->trackPayload($audioTrack));
    }

    private function trackPayload(AudioTrack $track): array
    {
        return [
            'id' => $track->id,
            'filename' => $track->filename,
            'stream_url' => url('/api/audio/'.$track->id.'?stream=1'),
            'duration' => $track->duration,
            'bpm' => $track->bpm,
            'key' => $track->key,
            'loudness_lufs' => $track->loudness_lufs,
            'waveform_data' => $track->waveform_data,
        ];
    }

    private function contentType(string $filename): string
    {
        return match (strtolower(pathinfo($filename, PATHINFO_EXTENSION))) {
            'wav' => 'audio/wav',
            'flac' => 'audio/flac',
            default => 'audio/mpeg',
        };
    }
}
