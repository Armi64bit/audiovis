import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface AudioTrackResponse {
  id: number;
  filename: string;
  stream_url: string;
  duration: number;
  bpm: number | null;
  key: string | null;
  loudness_lufs: number | null;
  waveform_data: number[];
}

export interface ColorPreset {
  id?: number;
  name: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  bg_color: string;
  particle_color: string;
  surface_color?: string;
  muted_color?: string;
}

@Injectable({ providedIn: 'root' })
export class AudioApiService {
  private readonly apiBaseUrl = 'http://localhost:8000/api';

  constructor(private readonly http: HttpClient) {}

  upload(file: File): Observable<AudioTrackResponse> {
    const body = new FormData();
    body.append('audio', file);
    return this.http.post<AudioTrackResponse>(`${this.apiBaseUrl}/audio/upload`, body);
  }

  getTrack(id: number): Observable<AudioTrackResponse> {
    return this.http.get<AudioTrackResponse>(`${this.apiBaseUrl}/audio/${id}`);
  }

  getThemes(): Observable<ColorPreset[]> {
    return this.http.get<ColorPreset[]>(`${this.apiBaseUrl}/themes`);
  }

  saveTheme(preset: ColorPreset): Observable<ColorPreset> {
    return this.http.post<ColorPreset>(`${this.apiBaseUrl}/themes`, preset);
  }
}
