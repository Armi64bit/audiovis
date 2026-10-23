<?php

namespace App\Services;

use Illuminate\Support\Facades\Process;
use RuntimeException;

class AudioAnalyzer
{
    public function analyze(string $path): array
    {
        $probe = Process::timeout(30)->run([
            config('services.audio.ffprobe', env('FFPROBE_BIN', 'ffprobe')),
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            $path,
        ]);

        if (! $probe->successful() || ! is_numeric(trim($probe->output()))) {
            throw new RuntimeException('FFprobe could not read the audio duration: '.$probe->errorOutput());
        }

        $loudness = Process::timeout(120)->run([
            config('services.audio.ffmpeg', env('FFMPEG_BIN', 'ffmpeg')),
            '-hide_banner', '-nostats', '-i', $path,
            '-af', 'loudnorm=print_format=json',
            '-f', 'null', '-',
        ]);

        if (! $loudness->successful()) {
            throw new RuntimeException('FFmpeg could not measure loudness: '.$loudness->errorOutput());
        }
        $analysis = $this->parseLoudness($loudness->errorOutput());

        $waveform = Process::timeout(120)->run([
            config('services.audio.ffmpeg', env('FFMPEG_BIN', 'ffmpeg')),
            '-hide_banner', '-loglevel', 'error', '-i', $path,
            '-ac', '1', '-ar', '100', '-f', 'f32le', 'pipe:1',
        ]);

        if (! $waveform->successful()) {
            throw new RuntimeException('FFmpeg could not extract the waveform: '.$waveform->errorOutput());
        }

        $samples = array_values(unpack('g*', $waveform->output()) ?: []);
        $bpm = $this->estimateBpm($path);

        return [
            'duration' => round((float) trim($probe->output()), 2),
            'bpm' => $bpm,
            'key' => null,
            'loudness_lufs' => $analysis,
            'waveform_data' => $this->downsample($samples, 1200),
        ];
    }

    private function parseLoudness(string $output): ?float
    {
        if (! preg_match('/\{\s*"input_i"\s*:\s*"([^"]+)"/s', $output, $matches)) {
            return null;
        }

        return is_numeric($matches[1]) ? (float) $matches[1] : null;
    }

    private function estimateBpm(string $path): ?float
    {
        $envelope = Process::timeout(90)->run([
            config('services.audio.ffmpeg', env('FFMPEG_BIN', 'ffmpeg')),
            '-hide_banner', '-loglevel', 'error', '-t', '90', '-i', $path,
            '-vn', '-ac', '1',
            '-af', 'highpass=f=35,lowpass=f=180,aresample=2000',
            '-f', 'f32le', 'pipe:1',
        ]);

        if (! $envelope->successful()) {
            throw new RuntimeException('FFmpeg could not extract the bass envelope: '.$envelope->errorOutput());
        }

        $samples = array_values(unpack('g*', $envelope->output()) ?: []);
        $frameSize = 20;
        $levels = [];

        for ($offset = 0, $sampleCount = count($samples); $offset + $frameSize <= $sampleCount; $offset += $frameSize) {
            $sum = 0.0;
            for ($index = $offset; $index < $offset + $frameSize; $index++) {
                $sum += $samples[$index] * $samples[$index];
            }
            $levels[] = sqrt($sum / $frameSize);
        }

        if (count($levels) < 250) {
            return null;
        }

        $onsets = [0.0];
        for ($index = 1, $levelCount = count($levels); $index < $levelCount; $index++) {
            $onsets[] = max(0.0, $levels[$index] - $levels[$index - 1]);
        }

        $energy = array_sum(array_map(static fn (float $value): float => $value * $value, $onsets));
        if ($energy < 1.0e-8) {
            return null;
        }

        $bestLag = 0;
        $bestScore = 0.0;
        $scores = [];
        for ($lag = 33; $lag <= 100; $lag++) {
            $correlation = 0.0;
            $leftEnergy = 0.0;
            $rightEnergy = 0.0;

            for ($index = $lag, $length = count($onsets); $index < $length; $index++) {
                $left = $onsets[$index];
                $right = $onsets[$index - $lag];
                $correlation += $left * $right;
                $leftEnergy += $left * $left;
                $rightEnergy += $right * $right;
            }

            $score = $correlation / sqrt($leftEnergy * $rightEnergy ?: 1.0);
            $scores[$lag] = $score;
            if ($score > $bestScore) {
                $bestScore = $score;
                $bestLag = $lag;
            }
        }

        for ($lag = 33; $lag < $bestLag; $lag++) {
            if (($scores[$lag] ?? 0.0) >= max(0.18, $bestScore * 0.72)) {
                $bestLag = $lag;
                break;
            }
        }

        return $bestLag && $bestScore >= 0.18
            ? round(min(180, max(60, 6000 / $bestLag)), 2)
            : null;
    }

    /**
     * @param list<float> $samples
     * @return list<float>
     */
    private function downsample(array $samples, int $limit): array
    {
        if (count($samples) <= $limit) {
            return array_map(static fn (float $sample): float => round($sample, 4), $samples);
        }

        $result = [];
        $bucketSize = count($samples) / $limit;

        for ($index = 0; $index < $limit; $index++) {
            $start = (int) floor($index * $bucketSize);
            $end = (int) floor(($index + 1) * $bucketSize);
            $peak = 0.0;

            for ($sampleIndex = $start; $sampleIndex < max($start + 1, $end); $sampleIndex++) {
                $peak = max($peak, abs($samples[$sampleIndex] ?? 0.0));
            }

            $result[] = round($peak, 4);
        }

        return $result;
    }
}
