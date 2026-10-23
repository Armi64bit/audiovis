import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  NgZone,
  QueryList,
  ViewChild,
  ViewChildren,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { AudioApiService, AudioTrackResponse, ColorPreset } from './services/audio-api.service';

interface Theme {
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  accent: string;
  secondary: string;
  particle: string;
}

interface Bands {
  sub: number;
  lows: number;
  mids: number;
  highMids: number;
  air: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
  size: number;
  hue: number;
}

const DEFAULT_THEME: Theme = {
  bg: '#e6ebea',
  surface: '#f3f5f3',
  ink: '#1d2929',
  muted: '#6f7d7a',
  accent: '#00a6c7',
  secondary: '#ce39a8',
  particle: '#62dce3',
};

const DARK_THEME: Theme = {
  bg: '#151c1c',
  surface: '#202929',
  ink: '#e5eeeb',
  muted: '#9eaaa7',
  accent: '#43c4dc',
  secondary: '#d65aa9',
  particle: '#78dce5',
};

const PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const BUILT_IN_PRESETS: ColorPreset[] = [
  {
    name: 'Signal / Light',
    primary_color: DEFAULT_THEME.ink,
    secondary_color: DEFAULT_THEME.secondary,
    accent_color: DEFAULT_THEME.accent,
    bg_color: DEFAULT_THEME.bg,
    particle_color: DEFAULT_THEME.particle,
    surface_color: DEFAULT_THEME.surface,
    muted_color: DEFAULT_THEME.muted,
  },
  {
    name: 'Signal / Dark',
    primary_color: DARK_THEME.ink,
    secondary_color: DARK_THEME.secondary,
    accent_color: DARK_THEME.accent,
    bg_color: DARK_THEME.bg,
    particle_color: DARK_THEME.particle,
    surface_color: DARK_THEME.surface,
    muted_color: DARK_THEME.muted,
  },
  {
    name: 'Cyan / Graphite',
    primary_color: '#d9e7e8',
    secondary_color: '#7c8fd6',
    accent_color: '#51d5e8',
    bg_color: '#111923',
    particle_color: '#9fe8e7',
    surface_color: '#1c2933',
    muted_color: '#94a5ae',
  },
];

interface NoteEvent {
  time: number;
  midi: number;
  strength: number;
}

type VisualCardId =
  | 'specimen'
  | 'roll'
  | 'fountain'
  | 'orbit'
  | 'glyph'
  | 'waveform'
  | 'scope'
  | 'spectrum'
  | 'spectrogram'
  | 'network';

interface VisualCardOptions {
  enabled: boolean;
  intensity: number;
}

type VisualCardColorKey = 'ink' | 'accent' | 'secondary' | 'particle';
type VisualCardColors = Partial<Pick<Theme, VisualCardColorKey>>;

const VISUAL_COLOR_FIELDS: { key: VisualCardColorKey; label: string }[] = [
  { key: 'accent', label: 'Signal' },
  { key: 'secondary', label: 'Bloom' },
  { key: 'particle', label: 'Particles' },
  { key: 'ink', label: 'Lines' },
];

const VISUAL_CARD_IDS: VisualCardId[] = [
  'specimen', 'roll', 'fountain', 'orbit', 'glyph',
  'waveform', 'scope', 'spectrum', 'spectrogram', 'network',
];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements AfterViewInit, OnDestroy {
  @ViewChildren('vizCanvas') canvases!: QueryList<ElementRef<HTMLCanvasElement>>;
  @ViewChild('audioPlayer') private audioElement!: ElementRef<HTMLAudioElement>;

  readonly colorFields: { key: keyof Theme; label: string }[] = [
    { key: 'bg', label: 'Background base' },
    { key: 'surface', label: 'Panel surface' },
    { key: 'ink', label: 'Vectors and text' },
    { key: 'accent', label: 'Primary accent' },
    { key: 'secondary', label: 'Sub bloom' },
    { key: 'particle', label: 'Particle color' },
  ];
  waveformBars = Array.from({ length: 20 }, () => 0);
  readonly bands: Bands = { sub: 0, lows: 0, mids: 0, highMids: 0, air: 0 };
  private activeVisualCard: VisualCardId | null = null;
  readonly cardColors: Record<VisualCardId, VisualCardColors> = {
    specimen: {}, roll: {}, fountain: {}, orbit: {}, glyph: {},
    waveform: {}, scope: {}, spectrum: {}, spectrogram: {}, network: {},
  };
  readonly theme = new Proxy({ ...DEFAULT_THEME }, {
    get: (colors, key: string | symbol) => {
      if (typeof key !== 'string') return Reflect.get(colors, key);
      const cardId = this.activeVisualCard;
      const colorKey = key as VisualCardColorKey;
      return cardId && VISUAL_COLOR_FIELDS.some((field) => field.key === colorKey)
        ? this.cardColors[cardId][colorKey] ?? Reflect.get(colors, key)
        : Reflect.get(colors, key);
    },
  });
  readonly particles: Particle[] = [];
  readonly frequencyData = new Uint8Array(4096);
  readonly timeData = new Uint8Array(8192);
  readonly leftTimeData = new Uint8Array(8192);
  readonly rightTimeData = new Uint8Array(8192);
  readonly visualColorFields = VISUAL_COLOR_FIELDS;
  readonly cardOptions: Record<VisualCardId, VisualCardOptions> = {
    specimen: { enabled: true, intensity: 1 },
    roll: { enabled: true, intensity: 1 },
    fountain: { enabled: true, intensity: 1 },
    orbit: { enabled: true, intensity: 1 },
    glyph: { enabled: true, intensity: 1 },
    waveform: { enabled: true, intensity: 1 },
    scope: { enabled: true, intensity: 1 },
    spectrum: { enabled: true, intensity: 1 },
    spectrogram: { enabled: true, intensity: 1 },
    network: { enabled: true, intensity: 1 },
  };

  trackId = '--';
  trackName = 'No audio loaded';
  tempo: number | null = null;
  musicalKey = '--';
  loudness = '--';
  duration = 0;
  currentTime = 0;
  isPlaying = false;
  themeOpen = false;
  darkMode = false;
  particleTrailsEnabled = true;
  statusMessage = '';
  errorMessage = '';
  themeName = 'My signal';
  presets: ColorPreset[] = [...BUILT_IN_PRESETS];
  openCardMenu: VisualCardId | null = null;
  peakDb = '--';
  soundingNotes = '--';
  panLeft = '--';
  panRight = '--';
  kickLevel = '--';
  panPosition = 50;
  widthValue: number | null = null;
  sparkCount = 0;
  stepNumber: number | null = null;
  bassNote = '--';
  private audioUrl = '';
  private audioContext?: AudioContext;
  private analyser?: AnalyserNode;
  private leftAnalyser?: AnalyserNode;
  private rightAnalyser?: AnalyserNode;
  private gainNode?: GainNode;
  private animationFrame = 0;
  private resizeObserver?: ResizeObserver;
  private visibilityObserver?: IntersectionObserver;
  private visibleCanvases = new WeakSet<HTMLCanvasElement>();
  private canvasSizes = new WeakMap<HTMLCanvasElement, { width: number; height: number }>();
  private renderedStaticFrames = new WeakMap<HTMLCanvasElement, string>();
  private previousBass = 0;
  private tempoSource: 'upload' | 'live' | null = null;
  private lastBeatTime = 0;
  private beatIntervals: number[] = [];
  private lastUiUpdate = 0;
  private lastTransient = 0;
  private chordNotes: string[] = [];
  private pitchEnergy = new Float32Array(12);
  private networkTargets = new Float32Array(12);
  private networkLevels = new Float32Array(12);
  private networkX = new Float32Array(12);
  private networkY = new Float32Array(12);
  private networkVelocityX = new Float32Array(12);
  private networkVelocityY = new Float32Array(12);
  private networkInitialized = false;
  private networkWidth = 0;
  private networkHeight = 0;
  private chromaTotals = new Float64Array(12);
  private noteEvents: NoteEvent[] = [];
  private networkNoteEvents: NoteEvent[] = [];
  private lastNoteTimes = new Map<number, number>();
  private lastKeyUpdate = -1;
  private lastNetworkFrame = 0;
  private spectrogramFrames: Uint8Array[] = [];
  private lastSpectrogramFrame = 0;
  private spectrogramCanvas?: HTMLCanvasElement;
  private spectrogramPalette = '';

  constructor(private readonly audioApi: AudioApiService, private readonly zone: NgZone) {
    this.restoreTheme();
  }

  get barBeat(): string {
    if (!this.tempo) return '--';
    const beatDuration = 60 / this.tempo;
    const beatPosition = (this.currentTime / beatDuration) % 16;
    const bar = Math.floor(beatPosition / 4) + 1;
    const beat = Math.floor(beatPosition % 4) + 1;
    const subdivision = Math.floor((beatPosition % 1) * 4) + 1;
    return `${bar}.${beat}.${subdivision}`;
  }

  get hasAudio(): boolean {
    return Boolean(this.audioUrl);
  }

  get revolution(): string {
    return this.tempo ? (240 / this.tempo).toFixed(2) : '--';
  }

  get binaryStatus(): string {
    const binHz = (this.audioContext?.sampleRate ?? 44100) / 8192;
    return Array.from({ length: 24 }, (_, index) => {
      const frequency = 30 * Math.pow(16000 / 30, index / 23);
      const bin = Math.min(this.frequencyData.length - 1, Math.max(1, Math.round(frequency / binHz)));
      return this.frequencyData[bin] > 72 ? 'X' : '0';
    }).join('');
  }

  getCardOptions(id: string): VisualCardOptions {
    const cardId = VISUAL_CARD_IDS.find((candidate) => candidate === id);
    return cardId ? this.cardOptions[cardId] : { enabled: false, intensity: 1 };
  }

  toggleCardMenu(id: string, event: Event): void {
    event.stopPropagation();
    this.openCardMenu = this.openCardMenu === id ? null : VISUAL_CARD_IDS.find((candidate) => candidate === id) ?? null;
  }

  setCardEnabled(id: string, event: Event): void {
    const cardId = VISUAL_CARD_IDS.find((candidate) => candidate === id);
    if (!cardId) return;
    const enabled = (event.target as HTMLInputElement).checked;
    this.cardOptions[cardId].enabled = enabled;
    this.saveCardOptions();
    if (!enabled) this.openCardMenu = null;
  }

  showCard(id: string): void {
    const cardId = VISUAL_CARD_IDS.find((candidate) => candidate === id);
    if (!cardId) return;
    this.cardOptions[cardId].enabled = true;
    this.saveCardOptions();
  }

  setCardIntensity(id: string, event: Event): void {
    const cardId = VISUAL_CARD_IDS.find((candidate) => candidate === id);
    if (!cardId) return;
    this.cardOptions[cardId].intensity = Number((event.target as HTMLInputElement).value);
    this.applyCardIntensity(cardId);
    this.saveCardOptions();
  }

  getCardColor(id: string, key: VisualCardColorKey): string {
    const cardId = VISUAL_CARD_IDS.find((candidate) => candidate === id);
    return cardId ? this.cardColors[cardId][key] ?? this.theme[key] : this.theme[key];
  }

  setCardColor(id: string, key: VisualCardColorKey, event: Event): void {
    const cardId = VISUAL_CARD_IDS.find((candidate) => candidate === id);
    if (!cardId) return;
    this.cardColors[cardId][key] = (event.target as HTMLInputElement).value;
    localStorage.setItem('audiovis-card-colors', JSON.stringify(this.cardColors));
  }

  randomizeAllColors(): void {
    const hue = Math.floor(Math.random() * 360);
    const dark = Math.random() < 0.5;
    this.theme.bg = this.hslToHex(hue, 17, dark ? 11 : 94);
    this.theme.surface = this.hslToHex(hue, 14, dark ? 16 : 99);
    this.theme.ink = this.hslToHex(hue, 12, dark ? 91 : 17);
    this.theme.muted = this.hslToHex(hue, 9, dark ? 65 : 43);
    this.theme.accent = this.hslToHex(hue, 76, dark ? 65 : 42);
    this.theme.secondary = this.hslToHex((hue + 126) % 360, 73, dark ? 67 : 43);
    this.theme.particle = this.hslToHex((hue + 205) % 360, 78, dark ? 73 : 38);
    this.darkMode = dark;

    VISUAL_CARD_IDS.forEach((id, index) => {
      const cardHue = (hue + index * 29) % 360;
      this.cardColors[id] = {
        accent: this.hslToHex(cardHue, 78, dark ? 67 : 42),
        secondary: this.hslToHex((cardHue + 112) % 360, 75, dark ? 69 : 43),
        particle: this.hslToHex((cardHue + 205) % 360, 80, dark ? 75 : 38),
        ink: this.hslToHex(cardHue, 12, dark ? 88 : 22),
      };
    });
    this.saveTheme();
    localStorage.setItem('audiovis-card-colors', JSON.stringify(this.cardColors));
  }

  private hslToHex(hue: number, saturation: number, lightness: number): string {
    const s = saturation / 100;
    const l = lightness / 100;
    const chroma = (1 - Math.abs(2 * l - 1)) * s;
    const secondary = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
    const offset = l - chroma / 2;
    const [red, green, blue] = hue < 60 ? [chroma, secondary, 0]
      : hue < 120 ? [secondary, chroma, 0]
      : hue < 180 ? [0, chroma, secondary]
      : hue < 240 ? [0, secondary, chroma]
      : hue < 300 ? [secondary, 0, chroma]
      : [chroma, 0, secondary];
    return `#${[red, green, blue].map((channel) =>
      Math.round((channel + offset) * 255).toString(16).padStart(2, '0'),
    ).join('')}`;
  }

  private saveCardOptions(): void {
    localStorage.setItem('audiovis-card-options', JSON.stringify(this.cardOptions));
  }

  private applyCardIntensity(id: VisualCardId): void {
    this.canvases?.forEach(({ nativeElement }) => {
      if (nativeElement.dataset['visual'] === id) {
        nativeElement.style.opacity = String(this.cardOptions[id].intensity);
      }
    });
  }

  ngAfterViewInit(): void {
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) this.resizeCanvas(entry.target as HTMLCanvasElement);
    });
    this.visibilityObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const canvas = entry.target as HTMLCanvasElement;
        if (entry.isIntersecting) this.visibleCanvases.add(canvas);
        else this.visibleCanvases.delete(canvas);
      }
    }, { rootMargin: '160px' });
    this.canvases.forEach(({ nativeElement }) => this.resizeObserver?.observe(nativeElement));
    this.canvases.forEach(({ nativeElement }) => this.visibilityObserver?.observe(nativeElement));
    this.resizeCanvases();
    VISUAL_CARD_IDS.forEach((id) => this.applyCardIntensity(id));
    this.zone.runOutsideAngular(() => {
      this.animationFrame = requestAnimationFrame(this.drawLoop);
    });
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver?.disconnect();
    this.visibilityObserver?.disconnect();
    if (this.audioUrl.startsWith('blob:')) URL.revokeObjectURL(this.audioUrl);
    void this.audioContext?.close();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const allowed = /\.(mp3|wav|flac)$/i.test(file.name);
    if (!allowed || file.size > 50 * 1024 * 1024) {
      this.errorMessage = 'Choose an MP3, WAV, or FLAC file up to 50 MB.';
      return;
    }

    this.errorMessage = '';
    this.statusMessage = 'Loading audio and preparing the live analyzer…';
    this.stopPlayback();
    if (this.audioUrl.startsWith('blob:')) URL.revokeObjectURL(this.audioUrl);
    this.audioUrl = URL.createObjectURL(file);
    this.trackName = file.name;
    this.trackId = 'LOCAL';
    this.duration = 0;
    this.currentTime = 0;
    this.resetAnalysis();
    this.statusMessage = 'Local audio ready. Press play to start the analysis.';
    const player = this.audioElement.nativeElement;
    player.src = this.audioUrl;
    player.load();
    this.audioApi.upload(file).subscribe({
      next: (track) => this.applyTrackMetadata(track),
      error: () => {
        this.statusMessage = 'Local analysis ready. Laravel API is not connected.';
      },
    });
  }

  async togglePlayback(): Promise<void> {
    const player = this.audioElement.nativeElement;
    if (!this.audioUrl) return;
    try {
      if (player.paused) {
        await this.connectAudioGraph();
        await this.audioContext?.resume();
        await player.play();
        this.statusMessage = '';
      } else {
        player.pause();
      }
    } catch {
      this.errorMessage = 'Audio could not be played. Try selecting the file again.';
    }
  }

  seek(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(value)) this.audioElement.nativeElement.currentTime = value;
  }

  onTimeUpdate(): void {
    this.currentTime = this.audioElement.nativeElement.currentTime;
  }

  onMetadataLoaded(): void {
    this.duration = this.audioElement.nativeElement.duration || 0;
  }

  onEnded(): void {
    this.isPlaying = false;
    this.bands.sub = this.bands.lows = this.bands.mids = this.bands.highMids = this.bands.air = 0;
    this.particles.splice(0, this.particles.length);
    this.networkTargets.fill(0);
    this.networkNoteEvents = [];
    this.noteEvents = [];
    this.soundingNotes = '--';
    this.bassNote = '--';
  }

  formatTime(seconds: number): string {
    if (!Number.isFinite(seconds)) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${minutes}:${remainder}`;
  }

  setColor(key: keyof Theme, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.theme[key] = value;
    this.saveTheme();
  }

  toggleParticleTrails(event: Event): void {
    this.particleTrailsEnabled = (event.target as HTMLInputElement).checked;
    localStorage.setItem('audiovis-particle-trails', String(this.particleTrailsEnabled));
    const fountain = this.canvases?.find(({ nativeElement }) => nativeElement.dataset['visual'] === 'fountain')
      ?.nativeElement;
    const context = fountain?.getContext('2d');
    if (context && fountain) {
      context.clearRect(0, 0, fountain.width, fountain.height);
    }
  }

  updateThemeName(event: Event): void {
    this.themeName = (event.target as HTMLInputElement).value;
  }

  toggleDarkMode(event: Event): void {
    this.darkMode = (event.target as HTMLInputElement).checked;
    Object.assign(this.theme, this.darkMode ? DARK_THEME : DEFAULT_THEME);
    this.saveTheme();
  }

  resetTheme(): void {
    Object.assign(this.theme, DEFAULT_THEME);
    this.darkMode = false;
    this.saveTheme();
  }

  toggleThemeDrawer(): void {
    this.themeOpen = !this.themeOpen;
    if (this.themeOpen) {
      this.audioApi.getThemes().subscribe({
        next: (presets) => {
          const merged = new Map(BUILT_IN_PRESETS.map((preset) => [preset.name, preset]));
          presets.forEach((preset) => merged.set(preset.name, preset));
          this.presets = [...merged.values()];
        },
        error: () => {
          this.presets = [...BUILT_IN_PRESETS];
          this.statusMessage = 'Saved palettes require the Laravel API. Color editing still works locally.';
        },
      });
    }
  }

  saveCurrentTheme(): void {
    this.audioApi.saveTheme({
      name: this.themeName.trim() || 'My signal',
      primary_color: this.theme.ink,
      secondary_color: this.theme.secondary,
      accent_color: this.theme.accent,
      bg_color: this.theme.bg,
      particle_color: this.theme.particle,
      surface_color: this.theme.surface,
      muted_color: this.theme.muted,
    }).subscribe({
      next: (preset) => {
        this.presets = [...this.presets.filter((entry) => entry.name !== preset.name), preset];
        this.statusMessage = `Palette "${preset.name}" saved.`;
      },
      error: () => {
        this.statusMessage = 'Connect the Laravel API to save palettes between sessions.';
      },
    });
  }

  applyPreset(preset: ColorPreset): void {
    this.theme.ink = preset.primary_color;
    this.theme.secondary = preset.secondary_color;
    this.theme.accent = preset.accent_color;
    this.theme.bg = preset.bg_color;
    this.theme.particle = preset.particle_color;
    this.theme.surface = preset.surface_color ?? DEFAULT_THEME.surface;
    this.theme.muted = preset.muted_color ?? DEFAULT_THEME.muted;
    this.darkMode = this.isDarkColor(this.theme.bg);
    this.saveTheme();
  }

  private applyTrackMetadata(track: AudioTrackResponse): void {
    this.trackId = String(track.id);
    if (track.duration) this.duration = track.duration;
    if (track.bpm && track.bpm >= 60 && track.bpm <= 180) {
      this.tempo = Math.round(track.bpm);
      this.tempoSource = 'upload';
    }
    if (track.key) this.musicalKey = track.key;
    if (track.waveform_data?.length) {
      this.waveformBars = Array.from({ length: 20 }, (_, index) => {
        const sample = track.waveform_data[Math.floor(index * track.waveform_data.length / 20)] ?? 0;
        return Math.max(3, Math.round(sample * 100));
      });
    }
    if (track.loudness_lufs !== null && track.loudness_lufs !== undefined) {
      this.loudness = track.loudness_lufs.toFixed(1);
    }
    this.statusMessage = 'Track uploaded and analyzed by Audiovis API.';
  }

  private estimateKey(): void {
    const total = this.chromaTotals.reduce((sum, value) => sum + value, 0);
    if (total < 100) return;
    const normalized = Array.from(this.chromaTotals, (value) => value / total);
    const profiles = [
      { name: 'major', values: MAJOR_PROFILE },
      { name: 'minor', values: MINOR_PROFILE },
    ];
    let best = { score: -Infinity, tonic: 0, mode: 'major' };
    let runnerUp = -Infinity;
    for (let tonic = 0; tonic < 12; tonic++) {
      for (const profile of profiles) {
        const values = Array.from({ length: 12 }, (_, pitch) => profile.values[(pitch - tonic + 12) % 12]);
        const profileMean = values.reduce((sum, value) => sum + value, 0) / 12;
        const chromaMean = normalized.reduce((sum, value) => sum + value, 0) / 12;
        let covariance = 0;
        let profileVariance = 0;
        let chromaVariance = 0;
        for (let pitch = 0; pitch < 12; pitch++) {
          const profileDelta = values[pitch] - profileMean;
          const chromaDelta = normalized[pitch] - chromaMean;
          covariance += profileDelta * chromaDelta;
          profileVariance += profileDelta * profileDelta;
          chromaVariance += chromaDelta * chromaDelta;
        }
        const score = covariance / Math.sqrt(profileVariance * chromaVariance || 1);
        if (score > best.score) {
          runnerUp = best.score;
          best = { score, tonic, mode: profile.name };
        } else if (score > runnerUp) {
          runnerUp = score;
        }
      }
    }
    if (best.score >= 0.2 && best.score - runnerUp >= 0.015) {
      this.musicalKey = `${PITCH_CLASSES[best.tonic]} ${best.mode}`;
    }
  }

  private ensureAudioContext(): AudioContext {
    if (!this.audioContext) {
      const AudioContextConstructor = window.AudioContext;
      this.audioContext = new AudioContextConstructor();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 8192;
      this.analyser.smoothingTimeConstant = 0.78;
      this.gainNode = this.audioContext.createGain();
      const source = this.audioContext.createMediaElementSource(this.audioElement.nativeElement);
      source.connect(this.analyser);
      this.analyser.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);

      const splitter = this.audioContext.createChannelSplitter(2);
      const silentGain = this.audioContext.createGain();
      silentGain.gain.value = 0;
      this.leftAnalyser = this.audioContext.createAnalyser();
      this.rightAnalyser = this.audioContext.createAnalyser();
      this.leftAnalyser.fftSize = 8192;
      this.rightAnalyser.fftSize = 8192;
      source.connect(splitter);
      splitter.connect(this.leftAnalyser, 0);
      splitter.connect(this.rightAnalyser, 1);
      this.leftAnalyser.connect(silentGain);
      this.rightAnalyser.connect(silentGain);
      silentGain.connect(this.audioContext.destination);
    }
    return this.audioContext;
  }

  private async connectAudioGraph(): Promise<void> {
    this.ensureAudioContext();
  }

  private stopPlayback(): void {
    this.audioElement.nativeElement.pause();
    this.isPlaying = false;
  }

  private resetAnalysis(): void {
    this.tempo = null;
    this.tempoSource = null;
    this.musicalKey = '--';
    this.loudness = '--';
    this.beatIntervals = [];
    this.pitchEnergy.fill(0);
    this.chromaTotals.fill(0);
    this.lastKeyUpdate = -1;
    this.lastBeatTime = 0;
    this.lastTransient = 0;
    this.previousBass = 0;
    this.noteEvents = [];
    this.networkNoteEvents = [];
    this.lastNoteTimes.clear();
    this.networkTargets.fill(0);
    this.networkLevels.fill(0);
    this.networkVelocityX.fill(0);
    this.networkVelocityY.fill(0);
    this.networkInitialized = false;
    this.lastNetworkFrame = 0;
    this.soundingNotes = '--';
    this.bassNote = '--';
    this.panLeft = '--';
    this.panRight = '--';
    this.kickLevel = '--';
    this.widthValue = null;
    this.bands.sub = this.bands.lows = this.bands.mids = this.bands.highMids = this.bands.air = 0;
    this.frequencyData.fill(0);
    this.timeData.fill(128);
    this.leftTimeData.fill(128);
    this.rightTimeData.fill(128);
    this.waveformBars = Array.from({ length: 20 }, () => 0);
    this.particles.splice(0, this.particles.length);
    this.spectrogramFrames = [];
    this.lastSpectrogramFrame = 0;
    this.peakDb = '--';
    this.renderedStaticFrames = new WeakMap<HTMLCanvasElement, string>();
  }

  private drawLoop = (): void => {
    const now = performance.now();
    if (this.isPlaying) this.updateAudioLevels(now);
    this.canvases?.forEach(({ nativeElement }) => {
      const canvas = nativeElement;
      const cardId = VISUAL_CARD_IDS.find((id) => id === canvas.dataset['visual']);
      if (!cardId) return;
      if (!this.cardOptions[cardId].enabled || !this.visibleCanvases.has(canvas)) return;
      const size = this.canvasSizes.get(canvas);
      if (!size || !size.width || !size.height) return;
      const isSpectrogram = cardId === 'spectrogram';
      const networkFading = cardId === 'network' && this.networkLevels.some((level) => level > 0.01);
      const canHoldFrame = (!this.isPlaying || isSpectrogram)
        && !(cardId === 'fountain' && this.particles.length > 0)
        && !networkFading;
      let renderKey = '';
      if (canHoldFrame) {
        const colors = this.cardColors[cardId];
        const paletteKey = `${colors.ink ?? this.theme.ink}:${colors.accent ?? this.theme.accent}:${colors.secondary ?? this.theme.secondary}:${colors.particle ?? this.theme.particle}`;
        const dataKey = isSpectrogram
          ? this.lastSpectrogramFrame
          : `${this.currentTime}:${this.bands.sub}:${this.bands.lows}:${this.bands.mids}:${this.bands.highMids}:${this.bands.air}:${this.soundingNotes}`;
        renderKey = `${size.width}:${size.height}:${dataKey}:${this.darkMode}:${paletteKey}`;
        if (this.renderedStaticFrames.get(canvas) === renderKey) return;
      }
      const context = canvas.getContext('2d');
      if (!context) return;
      const ratio = canvas.width / size.width;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (canvas.dataset['visual'] === 'fountain' && this.particleTrailsEnabled) {
        context.globalCompositeOperation = 'destination-out';
        context.fillStyle = 'rgba(0, 0, 0, 0.055)';
        context.fillRect(0, 0, size.width, size.height);
        context.globalCompositeOperation = 'source-over';
      } else {
        context.clearRect(0, 0, size.width, size.height);
      }
      this.activeVisualCard = cardId;
      try {
        switch (canvas.dataset['visual']) {
          case 'specimen': this.drawSpecimen(context, size.width, size.height, now); break;
          case 'roll': this.drawRoll(context, size.width, size.height, now); break;
          case 'fountain': this.drawFountain(context, size.width, size.height); break;
          case 'orbit': this.drawOrbit(context, size.width, size.height, now); break;
          case 'glyph': this.drawGlyph(context, size.width, size.height, now); break;
          case 'waveform': this.drawWaveform(context, size.width, size.height); break;
          case 'scope': this.drawStereoScope(context, size.width, size.height); break;
          case 'spectrum': this.drawSpectrum(context, size.width, size.height); break;
          case 'spectrogram': this.drawSpectrogram(context, size.width, size.height); break;
          case 'network': this.drawNoteNetwork(context, size.width, size.height, now); break;
        }
      } finally {
        this.activeVisualCard = null;
      }
      if (canHoldFrame) this.renderedStaticFrames.set(canvas, renderKey);
    });
    this.animationFrame = requestAnimationFrame(this.drawLoop);
  };

  private updateAudioLevels(now: number): void {
    if (!this.analyser) return;
    this.analyser.getByteFrequencyData(this.frequencyData);
    this.analyser.getByteTimeDomainData(this.timeData);
    this.leftAnalyser?.getByteTimeDomainData(this.leftTimeData);
    this.rightAnalyser?.getByteTimeDomainData(this.rightTimeData);
    const sampleRate = this.audioContext?.sampleRate ?? 44100;
    const binHz = sampleRate / this.analyser.fftSize;
    this.bands.sub = this.bandAverage(20, 60, binHz);
    this.bands.lows = this.bandAverage(60, 250, binHz);
    this.bands.mids = this.bandAverage(250, 2000, binHz);
    this.bands.highMids = this.bandAverage(2000, 6000, binHz);
    this.bands.air = this.bandAverage(6000, Math.min(20000, sampleRate / 2), binHz);
    if (this.isPlaying && now - this.lastSpectrogramFrame >= 90) {
      this.recordSpectrogramFrame(binHz);
      this.lastSpectrogramFrame = now;
    }

    const bass = this.bands.sub * 0.68 + this.bands.lows * 0.32;
    if (bass > Math.max(18, this.previousBass * 1.42) && now - this.lastTransient > 180) {
      this.registerTransient(now);
    }
    this.previousBass = this.previousBass * 0.82 + bass * 0.18;
    if (now - this.lastUiUpdate > 180) {
      this.lastUiUpdate = now;
      let peak = 0;
      for (const sample of this.timeData) {
        peak = Math.max(peak, Math.abs((sample - 128) / 128));
      }
      this.peakDb = peak > 0 ? `${(20 * Math.log10(peak)).toFixed(1)}` : '-∞';
      this.zone.run(() => {
        const leftLevel = this.channelRms(this.leftTimeData);
        const rightLevel = this.channelRms(this.rightTimeData);
        const totalLevel = leftLevel + rightLevel;
        const balance = totalLevel > 0.0001 ? (leftLevel - rightLevel) / totalLevel : 0;
        this.panPosition = 50 + balance * 48;
        const midRms = this.channelDifferenceRms(this.leftTimeData, this.rightTimeData, false);
        const sideRms = this.channelDifferenceRms(this.leftTimeData, this.rightTimeData, true);
        this.widthValue = Math.round(100 * sideRms / Math.max(0.0001, midRms + sideRms));
        this.kickLevel = `${Math.round(this.bands.sub)}%`;
        this.panLeft = `${(20 * Math.log10(Math.max(leftLevel, 0.0001))).toFixed(1)}`;
        this.panRight = `${(20 * Math.log10(Math.max(rightLevel, 0.0001))).toFixed(1)}`;
        this.stepNumber = this.tempo
          ? Math.floor((this.currentTime / (60 / this.tempo / 4)) % 16) + 1
          : null;
        this.updatePitchTelemetry(binHz);
      });
    }
  }

  private bandAverage(low: number, high: number, binHz: number): number {
    const start = Math.max(0, Math.floor(low / binHz));
    const end = Math.min(this.frequencyData.length, Math.ceil(high / binHz));
    let total = 0;
    for (let index = start; index < end; index++) total += this.frequencyData[index];
    return end > start ? (total / (end - start) / 255) * 100 : 0;
  }

  private recordSpectrogramFrame(binHz: number): void {
    const frame = new Uint8Array(64);
    for (let index = 0; index < frame.length; index++) {
      const lowFrequency = 35 * Math.pow(16000 / 35, index / frame.length);
      const highFrequency = 35 * Math.pow(16000 / 35, (index + 1) / frame.length);
      const lowBin = Math.max(1, Math.floor(lowFrequency / binHz));
      const highBin = Math.max(lowBin + 1, Math.ceil(highFrequency / binHz));
      let peak = 0;
      for (let bin = lowBin; bin < Math.min(highBin, this.frequencyData.length); bin++) {
        peak = Math.max(peak, this.frequencyData[bin]);
      }
      frame[index] = peak;
    }
    this.spectrogramFrames.push(frame);
    if (this.spectrogramFrames.length > 120) this.spectrogramFrames.shift();
  }

  private channelRms(samples: Uint8Array): number {
    let sum = 0;
    for (const sample of samples) {
      const centered = (sample - 128) / 128;
      sum += centered * centered;
    }
    return Math.sqrt(sum / samples.length);
  }

  private channelDifferenceRms(left: Uint8Array, right: Uint8Array, side: boolean): number {
    let sum = 0;
    const length = Math.min(left.length, right.length);
    for (let index = 0; index < length; index++) {
      const leftSample = (left[index] - 128) / 128;
      const rightSample = (right[index] - 128) / 128;
      const sample = side ? (leftSample - rightSample) / 2 : (leftSample + rightSample) / 2;
      sum += sample * sample;
    }
    return Math.sqrt(sum / Math.max(length, 1));
  }

  private registerTransient(now: number): void {
    this.lastTransient = now;
    if (this.lastBeatTime) {
      const interval = now - this.lastBeatTime;
      if (interval > 250 && interval < 1500) {
        this.beatIntervals.push(interval);
        if (this.beatIntervals.length > 8) this.beatIntervals.shift();
        const sorted = [...this.beatIntervals].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        const consistent = sorted.filter((value) => Math.abs(value - median) / median < 0.18).length;
        if (this.beatIntervals.length >= 3 && consistent >= 3) {
          const estimated = Math.round(60000 / median);
          const normalized = estimated < 75 ? estimated * 2 : estimated > 150 ? estimated / 2 : estimated;
          if (normalized >= 60 && normalized <= 180 && this.tempoSource !== 'upload') {
            this.tempo = Math.round(normalized);
            this.tempoSource = 'live';
          }
        }
      }
    }
    this.lastBeatTime = now;
  }

  private updatePitchTelemetry(binHz: number): void {
    this.pitchEnergy.fill(0);
    this.networkTargets.fill(0);
    const spectralNotes: { midi: number; strength: number }[] = [];
    for (let midi = 36; midi <= 84; midi++) {
      const frequency = 440 * Math.pow(2, (midi - 69) / 12);
      const center = Math.round(frequency / binHz);
      const radius = Math.max(1, Math.ceil(frequency * 0.025 / binHz));
      let strength = 0;
      for (let bin = Math.max(1, center - radius); bin <= Math.min(this.frequencyData.length - 1, center + radius); bin++) {
        strength = Math.max(strength, this.frequencyData[bin]);
      }
      spectralNotes.push({ midi, strength });
      this.pitchEnergy[midi % 12] += strength;
    }
    for (let pitch = 0; pitch < 12; pitch++) {
      this.chromaTotals[pitch] = this.chromaTotals[pitch] * 0.985 + this.pitchEnergy[pitch];
    }
    const keyWindow = Math.floor(this.currentTime / 5);
    if (this.isPlaying && this.currentTime >= 8 && keyWindow !== this.lastKeyUpdate) {
      this.estimateKey();
      this.lastKeyUpdate = keyWindow;
    }
    const peaks = spectralNotes.filter(({ strength }) => strength >= 42);
    peaks.sort((a, b) => b.strength - a.strength);
    const notes: { midi: number; strength: number }[] = [];
    for (const peak of peaks) {
      if (notes.every((note) => Math.abs(note.midi - peak.midi) >= 3)) notes.push(peak);
      if (notes.length === 4) break;
    }
    for (const note of notes) {
      const pitch = note.midi % 12;
      this.networkTargets[pitch] = Math.max(this.networkTargets[pitch], Math.min(1, note.strength / 150));
    }
    if (notes.length) {
      this.chordNotes = notes.slice(0, 3).map(({ midi }) => this.noteName(midi));
      this.soundingNotes = this.chordNotes.join('  ');
      const lowest = Math.min(...notes.map(({ midi }) => midi));
      this.bassNote = this.noteName(lowest);
      if (this.isPlaying) {
        for (const note of notes) {
          const lastTime = this.lastNoteTimes.get(note.midi) ?? -Infinity;
          if (this.currentTime - lastTime >= 0.14) {
            const event = { time: this.currentTime, midi: note.midi, strength: note.strength };
            this.noteEvents.push(event);
            this.networkNoteEvents.push(event);
            this.lastNoteTimes.set(note.midi, this.currentTime);
          }
        }
      }
    } else {
      this.chordNotes = [];
      this.soundingNotes = '--';
      this.bassNote = '--';
    }
    this.noteEvents = this.noteEvents.filter((event) => event.time >= Math.max(0, this.currentTime - 30));
    this.networkNoteEvents = this.networkNoteEvents.filter((event) => event.time >= this.currentTime - 1.5);
    if (this.networkNoteEvents.length > 36) {
      this.networkNoteEvents.splice(0, this.networkNoteEvents.length - 36);
    }
  }

  private noteName(midi: number): string {
    return `${PITCH_CLASSES[midi % 12]}${Math.floor(midi / 12) - 1}`;
  }

  private isDarkColor(color: string): boolean {
    const red = Number.parseInt(color.slice(1, 3), 16);
    const green = Number.parseInt(color.slice(3, 5), 16);
    const blue = Number.parseInt(color.slice(5, 7), 16);
    return (red * 0.2126 + green * 0.7152 + blue * 0.0722) < 128;
  }

  private resizeCanvases(): void {
    this.canvases?.forEach(({ nativeElement }) => {
      this.resizeCanvas(nativeElement);
    });
  }

  private resizeCanvas(canvas: HTMLCanvasElement): void {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const pixelWidth = Math.max(1, Math.round(rect.width * ratio));
    const pixelHeight = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    this.canvasSizes.set(canvas, { width: rect.width, height: rect.height });
    this.renderedStaticFrames.delete(canvas);
  }

  private drawSpecimen(ctx: CanvasRenderingContext2D, width: number, height: number, now: number): void {
    const cx = width * 0.58;
    const cy = height * 0.5;
    const radius = Math.min(height * 0.4, width * 0.29);
    const isDark = this.darkMode;
    const lowEnergy = Math.min(1, (this.bands.sub * 0.7 + this.bands.lows * 0.3) / 100);
    const pulse = this.bands.sub * 0.007;
    const bloom = ctx.createRadialGradient(cx, height * 0.82, 1, cx, height * 0.78, width * 0.5);
    bloom.addColorStop(0, isDark ? `${this.theme.secondary}55` : `${this.theme.secondary}32`);
    bloom.addColorStop(0.48, isDark ? `${this.theme.particle}2d` : `${this.theme.particle}18`);
    bloom.addColorStop(1, `${this.theme.particle}00`);
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = isDark ? 'rgba(190, 221, 220, 0.34)' : `${this.theme.ink}35`;
    ctx.lineWidth = isDark ? 1 : 0.8;
    for (let ring = 1; ring <= 5; ring++) {
      ctx.beginPath();
      ctx.arc(0, 0, radius * ring / 5, -Math.PI * 0.9, Math.PI * 0.9);
      ctx.stroke();
    }
    ctx.strokeStyle = isDark ? 'rgba(190, 221, 220, 0.25)' : `${this.theme.ink}25`;
    for (let ray = -5; ray <= 5; ray++) {
      const angle = (ray / 5) * Math.PI * 0.48;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.sin(angle) * radius, Math.cos(angle) * radius);
      ctx.stroke();
    }

    const cloudRadius = radius * (0.15 + pulse);
    if (isDark) {
      const glowRadius = cloudRadius * (1.45 + lowEnergy * 0.7) * 0.5;
      const glow = ctx.createRadialGradient(0, 0, glowRadius * 0.04, 0, 0, glowRadius);
      glow.addColorStop(0, this.theme.accent);
      glow.addColorStop(0.3, this.theme.particle);
      glow.addColorStop(0.68, this.theme.secondary);
      glow.addColorStop(1, `${this.theme.secondary}00`);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.2 + lowEnergy * 0.68;
      ctx.shadowColor = this.theme.accent;
      ctx.shadowBlur = 10 + lowEnergy * 14;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.ellipse(
        Math.sin(now / 420) * cloudRadius * 0.12,
        0,
        glowRadius * 0.82,
        glowRadius * 1.12,
        0.06,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.restore();
    }

    const cloud = ctx.createRadialGradient(0, 0, cloudRadius * 0.12, 0, 0, cloudRadius);
    cloud.addColorStop(0, isDark ? '#36575b' : '#162627');
    cloud.addColorStop(0.48, isDark ? '#294447e8' : '#293637e8');
    cloud.addColorStop(1, isDark ? '#29444700' : '#29363700');
    ctx.fillStyle = cloud;
    ctx.beginPath();
    ctx.ellipse(0, 0, cloudRadius * 0.9, cloudRadius * 1.28, 0.06, 0, Math.PI * 2);
    ctx.fill();

    if (isDark) {
      const coreRadius = cloudRadius * (0.68 + lowEnergy * 0.38) * 0.5;
      const coreGlow = ctx.createRadialGradient(
        -coreRadius * 0.16,
        -coreRadius * 0.18,
        1,
        0,
        0,
        coreRadius,
      );
      coreGlow.addColorStop(0, this.theme.particle);
      coreGlow.addColorStop(0.35, this.theme.accent);
      coreGlow.addColorStop(0.76, `${this.theme.secondary}b8`);
      coreGlow.addColorStop(1, `${this.theme.secondary}00`);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.22 + lowEnergy * 0.72;
      ctx.shadowColor = this.theme.particle;
      ctx.shadowBlur = 6 + lowEnergy * 12;
      ctx.fillStyle = coreGlow;
      ctx.beginPath();
      ctx.ellipse(0, 0, coreRadius * 0.72, coreRadius, 0.06, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.34 + lowEnergy * 0.5;
      ctx.shadowColor = this.theme.accent;
      ctx.shadowBlur = 5 + lowEnergy * 8;
      ctx.strokeStyle = this.theme.accent;
      ctx.lineWidth = 1 + lowEnergy * 1.2;
      ctx.beginPath();
      ctx.ellipse(0, 0, cloudRadius * 0.45, cloudRadius * 0.64, 0.06, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const detail = ctx.createRadialGradient(0, radius * 0.46, 1, 0, radius * 0.46, radius * 0.2);
    detail.addColorStop(0, isDark ? '#315155' : '#203132');
    detail.addColorStop(1, isDark ? '#31515500' : '#20313200');
    ctx.fillStyle = detail;
    ctx.beginPath();
    ctx.arc(0, radius * 0.46, radius * 0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = this.theme.accent;
    ctx.shadowBlur = isDark ? 14 : 5;
    ctx.strokeStyle = this.theme.accent;
    ctx.globalAlpha = isDark ? 0.98 : 0.78;
    ctx.lineWidth = isDark ? 2 : 1.4;
    ctx.beginPath();
    ctx.moveTo(Math.sin(now / 2400) * radius * 0.12, -radius * 1.08);
    ctx.bezierCurveTo(-radius * 0.12, -radius * 0.56, radius * 0.18, radius * 0.25, 0, radius * 1.02);
    ctx.stroke();
    ctx.restore();

    const spectrumRadius = radius * 0.82;
    const spectrumPoints = 96;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = this.theme.particle;
    ctx.shadowBlur = isDark ? 12 : 4;
    ctx.strokeStyle = this.theme.particle;
    ctx.globalAlpha = isDark ? 0.86 : 0.68;
    ctx.lineWidth = isDark ? 1.8 : 1.2;
    ctx.beginPath();
    for (let point = 0; point <= spectrumPoints; point++) {
      const angle = (point / spectrumPoints) * Math.PI * 2 - Math.PI / 2;
      const bin = 2 + Math.floor((point / spectrumPoints) * (this.frequencyData.length * 0.18));
      const level = this.frequencyData[bin] / 255;
      const pointRadius = spectrumRadius + level * radius * 0.48;
      const x = Math.cos(angle) * pointRadius;
      const y = Math.sin(angle) * pointRadius;
      if (point === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
    ctx.restore();

    ctx.fillStyle = isDark ? '#d7efed' : this.theme.muted;
    ctx.font = `${isDark ? '11px' : '9px'} "IBM Plex Mono", monospace`;
    if (isDark) {
      ctx.shadowColor = this.theme.bg;
      ctx.shadowBlur = 3;
    }
    ctx.fillText(`L ${this.panLeft}`, width * 0.06, height * 0.52);
    ctx.fillText(`R ${this.panRight}`, width * 0.82, height * 0.52);
    ctx.fillStyle = isDark ? '#f0fbfa' : this.theme.ink;
    ctx.font = `${isDark ? '12px' : '10px'} "IBM Plex Mono", monospace`;
    ctx.fillText(this.bassNote, cx + radius * 0.58, cy - radius * 0.58);
    ctx.shadowBlur = 0;
  }

  private drawRoll(ctx: CanvasRenderingContext2D, width: number, height: number, now: number): void {
    const left = 34;
    const top = 8;
    const right = width - 8;
    const bottom = height - 8;
    const gridWidth = right - left;
    const gridHeight = bottom - top;
    const rowHeight = gridHeight / 7;
    const columnWidth = gridWidth / 4;

    ctx.fillStyle = `${this.theme.ink}06`;
    ctx.fillRect(left, top, gridWidth, gridHeight);
    ctx.strokeStyle = `${this.theme.ink}1d`;
    ctx.lineWidth = 0.65;
    for (let row = 0; row <= 7; row++) {
      const y = top + row * rowHeight;
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
      if (row < 7) {
        ctx.fillStyle = this.theme.muted;
        ctx.font = '9px "IBM Plex Mono", monospace';
        ctx.fillText(`C${6 - row + 1}`, 5, y + rowHeight * 0.62);
      }
    }
    for (let column = 0; column <= 4; column++) {
      const x = left + column * columnWidth;
      ctx.strokeStyle = column === 0 ? `${this.theme.ink}42` : `${this.theme.ink}24`;
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
    }
    const barDuration = this.tempo ? 240 / this.tempo : 0;
    const firstVisibleBar = barDuration ? Math.max(0, Math.floor(this.currentTime / barDuration) - 3) : 0;
    const windowStart = firstVisibleBar * barDuration;
    for (let column = 0; column < 4; column++) {
      ctx.fillStyle = this.theme.muted;
      ctx.font = '9px "IBM Plex Mono", monospace';
      ctx.fillText(String(firstVisibleBar + column + 1), left + column * columnWidth + 5, top + 11);
    }
    if (barDuration) {
      for (const event of this.noteEvents) {
        if (event.time < windowStart || event.time > this.currentTime) continue;
        const x = left + ((event.time - windowStart) / (barDuration * 4)) * gridWidth;
        const row = Math.max(0, Math.min(6, 6 - Math.floor((event.midi - 24) / 12)));
        ctx.globalAlpha = 0.3 + event.strength / 510;
        ctx.fillStyle = this.theme.accent;
        ctx.fillRect(x, top + row * rowHeight + rowHeight * 0.4, Math.max(4, gridWidth / 48), 3);
      }
    }
    ctx.globalAlpha = 1;
    const playhead = left + (barDuration
      ? Math.max(0, Math.min(gridWidth, ((this.currentTime - windowStart) / (barDuration * 4)) * gridWidth))
      : (this.duration ? (this.currentTime / this.duration) * gridWidth : 0));
    ctx.strokeStyle = this.theme.ink;
    ctx.lineWidth = 1.35;
    ctx.beginPath(); ctx.moveTo(playhead, 0); ctx.lineTo(playhead, height); ctx.stroke();
    ctx.fillStyle = this.theme.ink;
    ctx.fillRect(playhead - 3, 0, 6, 3);
    if (this.isPlaying && this.tempo && this.chordNotes.length) {
      ctx.fillStyle = this.theme.accent;
      for (const note of this.chordNotes) {
        const pitchClass = PITCH_CLASSES.indexOf(note.replace(/\d+$/, ''));
        const octave = Number(note.match(/\d+$/)?.[0] ?? 3);
        const midi = pitchClass + (octave + 1) * 12;
        const y = bottom - ((midi - 24) / 72) * gridHeight;
        ctx.fillRect(playhead + 4, y - 2, 14 + this.bands.mids * 0.12, 3);
      }
    }
    void now;
  }

  private drawWaveform(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const centerY = height / 2;
    ctx.strokeStyle = `${this.theme.ink}25`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();
    if (!this.analyser) return;

    const amplitude = height * 0.43;
    const waveform = ctx.createLinearGradient(0, 0, width, 0);
    waveform.addColorStop(0, this.theme.accent);
    waveform.addColorStop(0.55, this.theme.particle);
    waveform.addColorStop(1, this.theme.secondary);
    ctx.beginPath();
    const sampleStep = Math.max(1, Math.floor(this.timeData.length / Math.max(1, Math.floor(width * 2))));
    for (let index = 0; index < this.timeData.length; index += sampleStep) {
      const x = (index / (this.timeData.length - 1)) * width;
      const y = centerY + ((this.timeData[index] - 128) / 128) * amplitude;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = waveform;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = this.theme.accent;
    ctx.shadowBlur = this.darkMode ? 7 : 0;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = this.theme.muted;
    ctx.font = '8px "IBM Plex Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('+1', 2, 11);
    ctx.fillText('0', 2, centerY - 3);
    ctx.fillText('-1', 2, height - 2);
  }

  private drawStereoScope(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const centerX = width / 2;
    const centerY = height / 2;
    const scale = Math.min(width, height) * 0.44;
    ctx.strokeStyle = `${this.theme.ink}20`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, height);
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(centerX, centerY, scale * 0.7, 0, Math.PI * 2);
    ctx.stroke();
    if (!this.analyser) return;

    const left = this.leftAnalyser ? this.leftTimeData : this.timeData;
    const right = this.rightAnalyser ? this.rightTimeData : this.timeData;
    const step = Math.max(1, Math.floor(left.length / 1600));
    ctx.beginPath();
    for (let index = 0; index < left.length; index += step) {
      const x = centerX + ((left[index] - 128) / 128) * scale;
      const y = centerY - ((right[index] - 128) / 128) * scale;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = this.theme.accent;
    ctx.lineWidth = 1.35;
    ctx.shadowColor = this.theme.accent;
    ctx.shadowBlur = this.darkMode ? 8 : 0;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = this.theme.muted;
    ctx.font = '8px "IBM Plex Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('L', 4, centerY - 5);
    ctx.textAlign = 'right';
    ctx.fillText('R', width - 4, centerY - 5);
  }

  private drawSpectrum(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const left = 24;
    const right = width - 8;
    const top = 12;
    const bottom = height - 20;
    const plotWidth = right - left;
    const plotHeight = bottom - top;
    ctx.font = '8px "IBM Plex Mono", monospace';
    ctx.textAlign = 'left';
    for (const [label, fraction] of [['0', 0], ['−40', 0.4], ['−80', 0.8]] as const) {
      const y = top + plotHeight * fraction;
      ctx.strokeStyle = `${this.theme.ink}18`;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
      ctx.fillStyle = this.theme.muted;
      ctx.fillText(label, 1, y + 3);
    }

    const bars = 56;
    const gap = 2;
    const barWidth = Math.max(1, (plotWidth - gap * (bars - 1)) / bars);
    const binHz = (this.audioContext?.sampleRate ?? 44100) / (this.analyser?.fftSize ?? 8192);
    const gradient = ctx.createLinearGradient(0, bottom, 0, top);
    gradient.addColorStop(0, this.theme.secondary);
    gradient.addColorStop(0.52, this.theme.accent);
    gradient.addColorStop(1, this.theme.particle);
    ctx.fillStyle = gradient;
    for (let index = 0; index < bars; index++) {
      const lowFrequency = 30 * Math.pow(16000 / 30, index / bars);
      const highFrequency = 30 * Math.pow(16000 / 30, (index + 1) / bars);
      const lowBin = Math.max(1, Math.floor(lowFrequency / binHz));
      const highBin = Math.max(lowBin + 1, Math.ceil(highFrequency / binHz));
      let energy = 0;
      for (let bin = lowBin; bin < Math.min(highBin, this.frequencyData.length); bin++) {
        energy = Math.max(energy, this.frequencyData[bin]);
      }
      const normalized = Math.pow(energy / 255, 0.82);
      const barHeight = Math.max(1, normalized * plotHeight);
      const x = left + index * (barWidth + gap);
      ctx.globalAlpha = 0.28 + normalized * 0.72;
      ctx.fillRect(x, bottom - barHeight, barWidth, barHeight);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.theme.muted;
    ctx.textAlign = 'left';
    ctx.fillText('30 Hz', left, height - 4);
    ctx.textAlign = 'center';
    ctx.fillText('1 kHz', left + plotWidth * 0.53, height - 4);
    ctx.textAlign = 'right';
    ctx.fillText('16 kHz', right, height - 4);
  }

  private drawSpectrogram(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (!this.spectrogramFrames.length) {
      ctx.fillStyle = this.theme.muted;
      ctx.font = '10px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('PLAY AUDIO TO BUILD HISTORY', width / 2, height / 2);
      return;
    }
    const canvas = ctx.canvas;
    const palette = `${this.theme.accent}:${this.theme.secondary}:${this.theme.particle}:${this.theme.ink}`;
    if (!this.spectrogramCanvas) this.spectrogramCanvas = document.createElement('canvas');
    const ratio = canvas.width / width;
    const pixelWidth = Math.max(1, Math.round(width * ratio));
    const pixelHeight = Math.max(1, Math.round(height * ratio));
    if (this.spectrogramCanvas.width !== pixelWidth || this.spectrogramCanvas.height !== pixelHeight) {
      this.spectrogramCanvas.width = pixelWidth;
      this.spectrogramCanvas.height = pixelHeight;
    }
    if (this.spectrogramPalette !== palette) {
      this.spectrogramPalette = palette;
    }
    const cacheContext = this.spectrogramCanvas.getContext('2d');
    if (!cacheContext) return;
    cacheContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    cacheContext.clearRect(0, 0, width, height);
    const maxFrames = 120;
    const startX = width * (1 - this.spectrogramFrames.length / maxFrames);
    const columnWidth = width / maxFrames + 0.5;
    const rowHeight = height / 64 + 0.5;
    for (let frameIndex = 0; frameIndex < this.spectrogramFrames.length; frameIndex++) {
      const frame = this.spectrogramFrames[frameIndex];
      const x = startX + frameIndex * width / maxFrames;
      for (let band = 0; band < frame.length; band++) {
        const energy = frame[band] / 255;
        if (energy < 0.035) continue;
        cacheContext.globalAlpha = 0.16 + energy * 0.84;
        cacheContext.fillStyle = energy > 0.62 ? this.theme.particle : energy > 0.28 ? this.theme.accent : this.theme.secondary;
        cacheContext.fillRect(x, height - (band + 1) * height / 64, columnWidth, rowHeight);
      }
    }
    cacheContext.globalAlpha = 1;
    cacheContext.strokeStyle = `${this.theme.ink}24`;
    cacheContext.beginPath();
    cacheContext.moveTo(0, height - 1);
    cacheContext.lineTo(width, height - 1);
    cacheContext.stroke();
    ctx.drawImage(this.spectrogramCanvas, 0, 0, width, height);
  }

  private drawNoteNetwork(ctx: CanvasRenderingContext2D, width: number, height: number, now: number): void {
    const delta = this.lastNetworkFrame ? Math.min((now - this.lastNetworkFrame) / 1000, 0.1) : 0;
    this.lastNetworkFrame = now;
    this.updateNetworkLayout(width, height, now, delta);
    const activeNotes = this.networkNoteEvents.filter((event) => this.currentTime - event.time < 0.2);
    for (let pitch = 0; pitch < 12; pitch++) {
      const target = this.networkTargets[pitch];
      const release = target > this.networkLevels[pitch] ? 0.07 : 0.48;
      const blend = delta ? 1 - Math.exp(-delta / release) : 0;
      this.networkLevels[pitch] += (target - this.networkLevels[pitch]) * blend;
    }
    const points = Array.from({ length: 12 }, (_, pitch) => {
      return {
        x: this.networkX[pitch],
        y: this.networkY[pitch],
        energy: this.networkLevels[pitch],
        pitch,
      };
    });

    const activePoints = points.filter((point) => point.energy > 0.1);
    for (let first = 0; first < points.length; first++) {
      for (let second = first + 1; second < points.length; second++) {
        const a = points[first];
        const b = points[second];
        const interval = (b.pitch - a.pitch + 12) % 12;
        const strength = Math.min(a.energy, b.energy);
        if (strength < 0.12) continue;
        const harmonic = [3, 4, 5, 7, 9].includes(interval);
        ctx.globalAlpha = harmonic ? 0.12 + strength * 0.72 : 0.08 + strength * 0.38;
        ctx.strokeStyle = harmonic ? (interval === 7 ? this.theme.accent : this.theme.secondary) : this.theme.muted;
        ctx.lineWidth = 0.7 + strength * 1.6;
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = this.darkMode ? 5 + strength * 7 : 0;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.shadowBlur = 0;

        const pulse = (now / 1300 + a.pitch * 0.137 + b.pitch * 0.071) % 1;
        ctx.globalAlpha = 0.35 + strength * 0.65;
        ctx.fillStyle = this.theme.particle;
        ctx.beginPath();
        ctx.arc(a.x + (b.x - a.x) * pulse, a.y + (b.y - a.y) * pulse, 1.5 + strength * 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    for (const event of this.networkNoteEvents) {
      const age = this.currentTime - event.time;
      if (age < 0 || age > 1.25) continue;
      const point = points[event.midi % 12];
      const progress = age / 1.25;
      ctx.globalAlpha = (1 - progress) * Math.min(1, event.strength / 110);
      ctx.strokeStyle = this.theme.particle;
      ctx.lineWidth = 1 + (1 - progress) * 1.5;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 5 + progress * Math.min(45, width * 0.08), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    for (const point of points) {
      const active = point.energy > 0.08;
      const nodeRadius = 2.2 + point.energy * 7;
      ctx.globalAlpha = active ? 0.42 + point.energy * 0.58 : 0.32;
      ctx.fillStyle = active ? (point.energy > 0.62 ? this.theme.particle : this.theme.accent) : this.theme.muted;
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = active && this.darkMode ? 5 + point.energy * 11 : 0;
      ctx.beginPath();
      ctx.arc(point.x, point.y, nodeRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.fillStyle = this.theme.muted;
      ctx.font = '8px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      const activeOctave = activeNotes.find((event) => event.midi % 12 === point.pitch);
      const label = activeOctave ? this.noteName(activeOctave.midi) : PITCH_CLASSES[point.pitch];
      ctx.fillText(label, point.x, point.y - nodeRadius - 6);
      if (activeOctave && point.energy > 0.18) {
        ctx.fillStyle = this.theme.particle;
        ctx.font = '6px "IBM Plex Mono", monospace';
        ctx.fillText('PLAYING', point.x, point.y + nodeRadius + 9);
      }
    }
    ctx.globalAlpha = 1;
    if (!activePoints.length) {
      ctx.fillStyle = this.theme.muted;
      ctx.font = '8px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(this.hasAudio ? 'WAITING FOR NOTES' : 'PLAY AUDIO TO MAP NOTES', width / 2, height / 2);
    } else {
      ctx.fillStyle = this.theme.muted;
      ctx.font = '8px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${activePoints.length} ACTIVE`, width / 2, height - 5);
    }
  }

  private updateNetworkLayout(width: number, height: number, now: number, delta: number): void {
    const seedX = [0.12, 0.34, 0.57, 0.82, 0.22, 0.45, 0.72, 0.91, 0.16, 0.39, 0.64, 0.84];
    const seedY = [0.28, 0.13, 0.31, 0.18, 0.59, 0.48, 0.62, 0.46, 0.85, 0.78, 0.9, 0.78];
    const padding = Math.min(24, Math.max(12, height * 0.12));
    if (!this.networkInitialized) {
      for (let pitch = 0; pitch < 12; pitch++) {
        this.networkX[pitch] = seedX[pitch] * width;
        this.networkY[pitch] = padding + seedY[pitch] * Math.max(1, height - padding * 2);
      }
      this.networkInitialized = true;
      this.networkWidth = width;
      this.networkHeight = height;
      return;
    }
    if (this.networkWidth !== width || this.networkHeight !== height) {
      const scaleX = width / Math.max(1, this.networkWidth);
      const scaleY = height / Math.max(1, this.networkHeight);
      for (let pitch = 0; pitch < 12; pitch++) {
        this.networkX[pitch] *= scaleX;
        this.networkY[pitch] *= scaleY;
      }
      this.networkWidth = width;
      this.networkHeight = height;
    }
    if (!delta) return;

    const minimumDistance = Math.min(64, Math.max(26, Math.min(width, height) * 0.19));
    const time = now / 1000;
    for (let pitch = 0; pitch < 12; pitch++) {
      const homeX = seedX[pitch] * width;
      const homeY = padding + seedY[pitch] * Math.max(1, height - padding * 2);
      const energy = this.networkTargets[pitch];
      const wanderX = Math.sin(time * (0.42 + pitch * 0.013) + pitch * 1.7) * width * (0.1 + energy * 0.12);
      const wanderY = Math.cos(time * (0.37 + pitch * 0.011) + pitch * 1.1) * height * (0.2 + energy * 0.2);
      let forceX = (homeX + wanderX - this.networkX[pitch]) * (0.7 + energy * 0.8);
      let forceY = (homeY + wanderY - this.networkY[pitch]) * (0.7 + energy * 0.8);

      for (let other = 0; other < 12; other++) {
        if (other === pitch) continue;
        const dx = this.networkX[pitch] - this.networkX[other];
        const dy = this.networkY[pitch] - this.networkY[other];
        const distance = Math.max(1, Math.hypot(dx, dy));
        if (distance < minimumDistance) {
          const push = ((minimumDistance - distance) / minimumDistance) * 95;
          forceX += (dx / distance) * push;
          forceY += (dy / distance) * push;
        } else if (energy > 0.12 && this.networkTargets[other] > 0.12) {
          const interval = (other - pitch + 12) % 12;
          if ([3, 4, 5, 7, 9].includes(interval)) {
            forceX -= dx * 0.025;
            forceY -= dy * 0.025;
          }
        }
      }

      this.networkVelocityX[pitch] = (this.networkVelocityX[pitch] + forceX * delta) * Math.exp(-2.4 * delta);
      this.networkVelocityY[pitch] = (this.networkVelocityY[pitch] + forceY * delta) * Math.exp(-2.4 * delta);
      this.networkX[pitch] += this.networkVelocityX[pitch] * delta;
      this.networkY[pitch] += this.networkVelocityY[pitch] * delta;
      if (this.networkX[pitch] < 10 || this.networkX[pitch] > width - 10) {
        this.networkX[pitch] = Math.max(10, Math.min(width - 10, this.networkX[pitch]));
        this.networkVelocityX[pitch] *= -0.45;
      }
      if (this.networkY[pitch] < padding || this.networkY[pitch] > height - padding) {
        this.networkY[pitch] = Math.max(padding, Math.min(height - padding, this.networkY[pitch]));
        this.networkVelocityY[pitch] *= -0.45;
      }
    }
  }

  private drawFountain(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const cx = width * 0.5;
    const baseY = height * 0.88;
    const bass = this.bands.sub / 100;
    const mids = this.bands.mids / 100;
    if (this.isPlaying) {
      const energy = this.bands.sub + this.bands.lows + this.bands.mids + this.bands.highMids + this.bands.air;
      const spawnCount = energy > 1 ? 1 + Math.floor(mids * 5 + bass * 8 + this.bands.air * 0.04) : 0;
      for (let index = 0; index < spawnCount; index++) this.spawnParticle(cx, baseY, width);
    }

    const ringWidth = width * (0.38 + bass * 0.12);
    ctx.save();
    ctx.strokeStyle = `${this.theme.ink}ee`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(cx, baseY, ringWidth, height * 0.035, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = `${this.theme.accent}c9`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, baseY - 2, ringWidth * 0.8, height * 0.021, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    for (let index = this.particles.length - 1; index >= 0; index--) {
      const particle = this.particles[index];
      particle.age += 1;
      if (this.isPlaying) {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vy *= 0.998;
      }
      const opacity = Math.max(0, 1 - particle.age / particle.life);
      ctx.globalAlpha = opacity * (particle.hue > 0 ? 0.82 : 0.92);
      ctx.fillStyle = particle.hue > 0 ? this.theme.secondary : this.theme.particle;
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = this.darkMode ? 11 : 0;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
      ctx.globalAlpha = 1;
      if (particle.age >= particle.life || particle.y < 0 || particle.x < 0 || particle.x > width) {
        this.particles.splice(index, 1);
      }
    }
    this.sparkCount = this.particles.length;
  }

  private spawnParticle(cx: number, baseY: number, width: number): void {
    const highFrequency = Math.random() < this.bands.air / 100;
    this.particles.push({
      x: cx + (Math.random() - 0.5) * width * 0.32,
      y: baseY - Math.random() * 6,
      vx: (Math.random() - 0.5) * (highFrequency ? 1.9 : 0.52),
      vy: -(1.2 + Math.random() * 2.2 + this.bands.mids * 0.035),
      life: 48 + Math.random() * 90,
      age: 0,
      size: 0.45 + Math.random() * (highFrequency ? 1.15 : 0.7),
      hue: highFrequency ? 1 : 0,
    });
    if (this.particles.length > 700) this.particles.splice(0, 40);
  }

  private drawOrbit(ctx: CanvasRenderingContext2D, width: number, height: number, now: number): void {
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.33;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = `${this.theme.ink}24`;
    ctx.lineWidth = 0.8;
    for (let ring = 1; ring <= 3; ring++) {
      ctx.beginPath(); ctx.arc(0, 0, radius * ring / 3, 0, Math.PI * 2); ctx.stroke();
    }
    for (let tick = 0; tick < 32; tick++) {
      const angle = (tick / 32) * Math.PI * 2 - Math.PI / 2;
      const outer = radius * 1.25;
      const inner = outer - (tick % 8 === 0 ? 8 : 3);
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
      ctx.stroke();
    }
    ctx.fillStyle = this.theme.muted;
    ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    for (let bar = 0; bar < 4; bar++) {
      const angle = (bar / 4) * Math.PI * 2 - Math.PI / 2;
      ctx.fillText(String(bar + 1), Math.cos(angle) * radius * 1.47, Math.sin(angle) * radius * 1.47 + 3);
    }
    const rotation = this.tempo ? this.currentTime * (Math.PI * 2 / (60 / this.tempo * 4)) : 0;
    ctx.strokeStyle = `${this.theme.accent}a8`;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.08, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, (this.bands.sub + this.bands.mids) / 180));
    ctx.stroke();
    ctx.strokeStyle = this.theme.ink;
    ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(rotation - Math.PI / 2) * radius * 1.35, Math.sin(rotation - Math.PI / 2) * radius * 1.35); ctx.stroke();
    ctx.fillStyle = this.theme.accent;
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = this.theme.muted;
    ctx.font = '8px "IBM Plex Mono", monospace';
    ctx.fillText('BAR', 0, -6);
    ctx.fillStyle = this.theme.ink;
    ctx.font = 'bold 15px "IBM Plex Mono", monospace';
    ctx.fillText(this.tempo ? String(Math.floor(this.currentTime / (60 / this.tempo * 4)) + 1) : '--', 0, 12);
    ctx.restore();
  }

  private drawGlyph(ctx: CanvasRenderingContext2D, width: number, height: number, now: number): void {
    const columns = 24;
    const rows = 9;
    const cellWidth = width / (columns + 1);
    const cellHeight = height / (rows + 1);
    const activeColumn = this.tempo ? Math.floor((this.currentTime * this.tempo / 60 * 4) % columns) : -1;
    ctx.fillStyle = `${this.theme.secondary}14`;
    ctx.fillRect(activeColumn * cellWidth, 0, cellWidth * 1.4, height);
    for (let column = 0; column < columns; column++) {
      for (let row = 0; row < rows; row++) {
        const frequency = 30 * Math.pow(16000 / 30, column / (columns - 1));
        const bin = Math.min(this.frequencyData.length - 1, Math.max(1, Math.round(frequency / ((this.audioContext?.sampleRate ?? 44100) / 8192))));
        const energy = this.frequencyData[bin];
        const active = energy > (rows - row) * 18;
        const bright = column === activeColumn;
        const radius = active ? 1.3 : 0.85;
        ctx.globalAlpha = active ? 0.28 + energy / 360 : 0.22;
        ctx.fillStyle = bright ? this.theme.secondary : this.theme.ink;
        ctx.beginPath();
        ctx.arc((column + 0.7) * cellWidth, (row + 0.7) * cellHeight, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    void now;
  }

  private restoreTheme(): void {
    try {
      const saved = localStorage.getItem('audiovis-theme');
      if (saved) Object.assign(this.theme, JSON.parse(saved) as Partial<Theme>);
      this.particleTrailsEnabled = localStorage.getItem('audiovis-particle-trails') !== 'false';
      this.darkMode = this.isDarkColor(this.theme.bg);
    } catch {
      Object.assign(this.theme, DEFAULT_THEME);
    }
    try {
      const savedCards: unknown = JSON.parse(localStorage.getItem('audiovis-card-options') ?? 'null');
      if (savedCards && typeof savedCards === 'object') {
        for (const id of VISUAL_CARD_IDS) {
          const saved = (savedCards as Partial<Record<VisualCardId, Partial<VisualCardOptions>>>)[id];
          if (!saved) continue;
          if (typeof saved.enabled === 'boolean') this.cardOptions[id].enabled = saved.enabled;
          if (typeof saved.intensity === 'number' && Number.isFinite(saved.intensity)) {
            this.cardOptions[id].intensity = Math.min(1.8, Math.max(0.4, saved.intensity));
          }
        }
      }
    } catch {
      this.statusMessage = 'Saved visual settings could not be read; defaults are active.';
    }
    try {
      const savedColors: unknown = JSON.parse(localStorage.getItem('audiovis-card-colors') ?? 'null');
      if (savedColors && typeof savedColors === 'object') {
        for (const id of VISUAL_CARD_IDS) {
          const colors = (savedColors as Partial<Record<VisualCardId, VisualCardColors>>)[id];
          if (!colors) continue;
          for (const { key } of VISUAL_COLOR_FIELDS) {
            const value = colors[key];
            if (typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)) {
              this.cardColors[id][key] = value;
            }
          }
        }
      }
    } catch {
      this.statusMessage = 'Saved card colors could not be read; the workspace palette is active.';
    }
  }

  private saveTheme(): void {
    localStorage.setItem('audiovis-theme', JSON.stringify(this.theme));
  }

  @HostListener('window:resize')
  onResize(): void {
    this.resizeCanvases();
  }

  @HostListener('document:click')
  closeCardMenu(): void {
    this.openCardMenu = null;
  }

  @HostListener('document:keydown.escape')
  closeCardMenuOnEscape(): void {
    this.openCardMenu = null;
  }
}
