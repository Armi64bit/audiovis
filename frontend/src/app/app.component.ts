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
  bg: '#0c0d18',
  surface: '#151728',
  ink: '#f0efff',
  muted: '#a2a1bc',
  accent: '#49f0d0',
  secondary: '#ff5fc8',
  particle: '#d5ff69',
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

interface YouTubePlayer {
  destroy(): void;
  getAvailablePlaybackRates(): number[];
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  getVideoData(): { title: string; isLiveContent?: boolean };
  isMuted(): boolean;
  mute(): void;
  pauseVideo(): void;
  playVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setPlaybackRate(rate: number): void;
  setVolume(volume: number): void;
  unMute(): void;
}

interface YouTubeNamespace {
  Player: new (
    target: HTMLElement,
    options: {
      videoId: string;
      width: string;
      height: string;
      playerVars: Record<string, number | string>;
      events: {
        onReady: (event: { target: YouTubePlayer }) => void;
        onStateChange: (event: { data: number }) => void;
        onError: (event: { data: number }) => void;
      };
    },
  ) => YouTubePlayer;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number };
}

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

type VisualCardId =
  | 'specimen'
  | 'prism'
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
  driver: AudioDriver;
}

type AudioDriver = 'mix' | 'sub' | 'lows' | 'mids' | 'highMids' | 'air' | 'beat' | 'stereo' | 'notes';
type VisualCardColorKey = 'ink' | 'accent' | 'secondary' | 'particle';
type VisualCardColors = Partial<Pick<Theme, VisualCardColorKey>>;

const VISUAL_COLOR_FIELDS: { key: VisualCardColorKey; label: string }[] = [
  { key: 'accent', label: 'Signal' },
  { key: 'secondary', label: 'Bloom' },
  { key: 'particle', label: 'Particles' },
  { key: 'ink', label: 'Lines' },
];

const VISUAL_CARD_IDS: VisualCardId[] = [
  'specimen', 'prism', 'roll', 'fountain', 'orbit', 'glyph',
  'waveform', 'scope', 'spectrum', 'spectrogram', 'network',
];
const AUDIO_DRIVERS: { value: AudioDriver; label: string }[] = [
  { value: 'mix', label: 'Full mix' },
  { value: 'sub', label: 'Sub (20-60 Hz)' },
  { value: 'lows', label: 'Bass (60-250 Hz)' },
  { value: 'mids', label: 'Mids (250 Hz-2 kHz)' },
  { value: 'highMids', label: 'High mids (2-6 kHz)' },
  { value: 'air', label: 'Air (6-20 kHz)' },
  { value: 'beat', label: 'Beat transients' },
  { value: 'stereo', label: 'Stereo width' },
  { value: 'notes', label: 'Detected notes' },
];
const FRAME_INTERVAL_MS = 1000 / 45;
const PRISM_FRAME_INTERVAL_MS = 1000 / 30;
const PRISM_DETAIL_THRESHOLD = 6.8;
type PrismVertex = readonly [number, number, number];
type PrismFace = readonly [number, number, number];
type PrismEdge = readonly [number, number];

interface PrismGeometry {
  vertices: readonly PrismVertex[];
  faces: readonly PrismFace[];
  edges: readonly PrismEdge[];
}

function createPrismGeometry(vertices: readonly PrismVertex[], faces: readonly PrismFace[]): PrismGeometry {
  const edgeKeys = new Set<string>();
  const edges: PrismEdge[] = [];
  for (const [a, b, c] of faces) {
    for (const [start, end] of [[a, b], [b, c], [c, a]] as const) {
      const low = Math.min(start, end);
      const high = Math.max(start, end);
      const key = `${low}:${high}`;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      edges.push([low, high]);
    }
  }
  return { vertices, faces, edges };
}

const PRISM_GEOMETRIES: readonly PrismGeometry[] = [
  createPrismGeometry(
    [[0, -1, 0], [0, 0.35, 0.95], [-0.9, 0.35, -0.48], [0.9, 0.35, -0.48]],
    [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]],
  ),
  createPrismGeometry(
    [[0, -1, 0], [0, 1, 0], [-1, 0, 0], [1, 0, 0], [0, 0, -1], [0, 0, 1]],
    [[0, 2, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2], [1, 4, 2], [1, 3, 4], [1, 5, 3], [1, 2, 5]],
  ),
  createPrismGeometry(
    [
      [-0.65, -0.65, -0.65], [0.65, -0.65, -0.65], [0.65, 0.65, -0.65], [-0.65, 0.65, -0.65],
      [-0.65, -0.65, 0.65], [0.65, -0.65, 0.65], [0.65, 0.65, 0.65], [-0.65, 0.65, 0.65],
    ],
    [
      [0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6],
      [0, 4, 5], [0, 5, 1], [1, 5, 6], [1, 6, 2],
      [2, 6, 7], [2, 7, 3], [3, 7, 4], [3, 4, 0],
    ],
  ),
];
const PRISM_SILHOUETTES: readonly (readonly PrismVertex[])[] = [
  [[-0.72, -0.42, 0], [0, -1, 0], [0.82, -0.34, 0], [0.08, 0.9, 0]],
  [[0, -1, 0], [0.72, 0, 0], [0, 1, 0], [-0.72, 0, 0]],
  [[-0.72, -0.72, 0], [0.72, -0.72, 0], [0.72, 0.72, 0], [-0.72, 0.72, 0]],
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
  @ViewChild('studio') private studioElement!: ElementRef<HTMLElement>;
  @ViewChild('youtubePlayerHost') private youtubePlayerHost?: ElementRef<HTMLDivElement>;

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
    specimen: {}, prism: {}, roll: {}, fountain: {}, orbit: {}, glyph: {},
    waveform: {}, scope: {}, spectrum: {}, spectrogram: {}, network: {},
  };
  readonly theme = new Proxy({ ...DARK_THEME }, {
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
  readonly audioDrivers = AUDIO_DRIVERS;
  readonly cardOptions: Record<VisualCardId, VisualCardOptions> = {
    specimen: { enabled: true, intensity: 1.35, driver: 'sub' },
    prism: { enabled: true, intensity: 1.5, driver: 'sub' },
    roll: { enabled: true, intensity: 1.35, driver: 'mids' },
    fountain: { enabled: true, intensity: 1.35, driver: 'highMids' },
    orbit: { enabled: true, intensity: 1.35, driver: 'beat' },
    glyph: { enabled: true, intensity: 1.35, driver: 'air' },
    waveform: { enabled: true, intensity: 1.35, driver: 'mix' },
    scope: { enabled: true, intensity: 1.35, driver: 'stereo' },
    spectrum: { enabled: true, intensity: 1.35, driver: 'mix' },
    spectrogram: { enabled: true, intensity: 1.35, driver: 'mix' },
    network: { enabled: true, intensity: 1.35, driver: 'notes' },
  };

  trackId = '--';
  trackName = 'No audio loaded';
  tempo: number | null = null;
  musicalKey = '--';
  loudness = '--';
  duration = 0;
  currentTime = 0;
  isLiveStream = false;
  isPlaying = false;
  youtubeUrl = '';
  youtubeVideoId = '';
  youtubeReady = false;
  youtubeLoading = false;
  youtubeInputOpen = false;
  volume = 80;
  muted = false;
  playbackRate = 1;
  chaosMode = false;
  themeOpen = false;
  darkMode = true;
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
  private youtubePlayer?: YouTubePlayer;
  private youtubeApiPromise?: Promise<YouTubeNamespace>;
  private youtubeRequestId = 0;
  private youtubePositionTimer = 0;
  private audioContext?: AudioContext;
  private analyser?: AnalyserNode;
  private leftAnalyser?: AnalyserNode;
  private rightAnalyser?: AnalyserNode;
  private gainNode?: GainNode;
  private animationFrame = 0;
  private lastFrameTime = 0;
  private lastPrismRenderTime = 0;
  private lastChaosStyleUpdate = 0;
  private chaosEnergy = 0;
  private reducedMotionQuery?: MediaQueryList;
  private beatPulse = 0;
  private prismBeatPulse = 0;
  private prismWaveAge = 1;
  private prismBassEnvelope = 0;
  private prismBassAverage = 0;
  private lastPrismTransient = 0;
  private prismBassInitialized = false;
  private readonly prismEdgeBuffer = new Float32Array(13_000);
  private readonly prismObjectX = new Float32Array(501);
  private readonly prismObjectY = new Float32Array(501);
  private readonly prismObjectSize = new Float32Array(501);
  private readonly prismObjectAngle = new Float32Array(501);
  private readonly prismObjectSeed = new Float32Array(501);
  private readonly prismObjectWave = new Float32Array(501);
  private readonly prismCollisionX = new Float32Array(501);
  private readonly prismCollisionY = new Float32Array(501);
  private readonly prismCollisionTargetX = new Float32Array(501);
  private readonly prismCollisionTargetY = new Float32Array(501);
  private readonly prismCellHeads = new Int16Array(256);
  private readonly prismCellX = new Uint8Array(167);
  private readonly prismCellY = new Uint8Array(167);
  private readonly prismProjectedX = new Float32Array(8);
  private readonly prismProjectedY = new Float32Array(8);
  private readonly prismCellNext = new Int16Array(167);
  private readonly cardDrive: Record<VisualCardId, number> = {
    specimen: 0, prism: 0, roll: 0, fountain: 0, orbit: 0, glyph: 0,
    waveform: 0, scope: 0, spectrum: 0, spectrogram: 0, network: 0,
  };
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
    return Boolean(this.audioUrl || this.youtubeVideoId);
  }

  get isYouTubeSource(): boolean {
    return Boolean(this.youtubeVideoId);
  }

  get canSeek(): boolean {
    return this.hasAudio && !this.isLiveStream && Number.isFinite(this.duration) && this.duration > 0;
  }

  get durationLabel(): string {
    if (this.isLiveStream) return 'LIVE';
    return this.canSeek ? this.formatTime(this.duration) : '--:--';
  }

  get revolution(): string {
    return this.tempo ? (240 / this.tempo).toFixed(2) : '--';
  }

  get prismFieldEnergy(): number {
    return this.cardDrive.prism * 100;
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
    return cardId ? this.cardOptions[cardId] : { enabled: false, intensity: 1, driver: 'mix' };
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
    this.invalidateCardFrame(cardId);
    this.saveCardOptions();
  }

  setCardDriver(id: string, event: Event): void {
    const cardId = VISUAL_CARD_IDS.find((candidate) => candidate === id);
    const driver = AUDIO_DRIVERS.find(({ value }) => value === (event.target as HTMLSelectElement).value)?.value;
    if (!cardId || !driver) return;
    this.cardOptions[cardId].driver = driver;
    this.cardDrive[cardId] = 0;
    this.invalidateCardFrame(cardId);
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

  private invalidateCardFrame(id: VisualCardId): void {
    this.canvases?.forEach(({ nativeElement }) => {
      if (nativeElement.dataset['visual'] === id) {
        this.renderedStaticFrames.delete(nativeElement);
      }
    });
  }

  ngAfterViewInit(): void {
    this.reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
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
    this.zone.runOutsideAngular(() => {
      this.animationFrame = requestAnimationFrame(this.drawLoop);
    });
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver?.disconnect();
    this.visibilityObserver?.disconnect();
    this.destroyYouTubePlayer();
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
    this.destroyYouTubePlayer();
    this.youtubeVideoId = '';
    this.youtubeReady = false;
    this.youtubeLoading = false;
    this.isLiveStream = false;
    if (this.audioUrl.startsWith('blob:')) URL.revokeObjectURL(this.audioUrl);
    this.audioUrl = URL.createObjectURL(file);
    this.trackName = file.name;
    this.trackId = 'LOCAL';
    this.duration = 0;
    this.currentTime = 0;
    this.resetAnalysis();
    this.statusMessage = 'Local audio ready. Press play to start the analysis.';
    const player = this.audioElement.nativeElement;
    player.volume = this.volume / 100;
    player.muted = this.muted;
    player.playbackRate = this.playbackRate;
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
    if (this.isYouTubeSource) {
      if (!this.youtubeReady || !this.youtubePlayer) {
        this.statusMessage = 'The YouTube player is still loading.';
        return;
      }
      if (this.isPlaying) this.youtubePlayer.pauseVideo();
      else this.youtubePlayer.playVideo();
      return;
    }
    const player = this.audioElement.nativeElement;
    if (!this.audioUrl) return;
    try {
      if (player.paused) {
        const audioContext = this.ensureAudioContext();
        if (player.ended) player.currentTime = 0;
        const resumePromise = audioContext.state !== 'running' && audioContext.state !== 'closed'
          ? audioContext.resume().then(() => true, () => false)
          : Promise.resolve(true);
        const playPromise = player.play();
        await playPromise;
        this.errorMessage = '';
        this.statusMessage = await resumePromise
          ? ''
          : 'Audio is playing, but live analysis could not start. Try playing again.';
      } else {
        player.pause();
      }
    } catch (error) {
      const errorName = error instanceof Error ? error.name : '';
      this.errorMessage = errorName === 'NotAllowedError'
        ? 'Playback was blocked by the browser. Tap play again to allow audio.'
        : errorName === 'NotSupportedError'
          ? 'This audio file could not be decoded. Try an MP3, WAV, or FLAC file.'
          : 'Audio playback failed. Try selecting the file again.';
    }
  }

  seek(event: Event): void {
    if (!this.canSeek) return;
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) return;
    if (this.isYouTubeSource) this.youtubePlayer?.seekTo(value, true);
    else this.audioElement.nativeElement.currentTime = value;
  }

  skip(seconds: number): void {
    const target = Math.max(0, this.currentTime + seconds);
    const bounded = this.canSeek ? Math.min(target, this.duration) : target;
    if (this.isYouTubeSource) this.youtubePlayer?.seekTo(bounded, true);
    else if (this.audioUrl) this.audioElement.nativeElement.currentTime = bounded;
  }

  setVolume(event: Event): void {
    this.volume = Number((event.target as HTMLInputElement).value);
    this.muted = this.volume === 0;
    if (this.isYouTubeSource) {
      this.youtubePlayer?.setVolume(this.volume);
      if (this.volume > 0) this.youtubePlayer?.unMute();
    } else {
      this.audioElement.nativeElement.volume = this.volume / 100;
      this.audioElement.nativeElement.muted = this.muted;
    }
  }

  toggleMute(): void {
    this.muted = !this.muted;
    if (this.isYouTubeSource) {
      if (this.muted) this.youtubePlayer?.mute();
      else {
        if (this.volume === 0) this.volume = 80;
        this.youtubePlayer?.setVolume(this.volume);
        this.youtubePlayer?.unMute();
      }
      return;
    }
    const player = this.audioElement.nativeElement;
    if (this.muted) {
      if (player.volume > 0) this.volume = Math.round(player.volume * 100);
      player.muted = true;
    } else {
      if (this.volume === 0) this.volume = 80;
      player.volume = this.volume / 100;
      player.muted = false;
    }
  }

  toggleChaosMode(): void {
    this.chaosMode = !this.chaosMode;
    this.chaosEnergy = 0;
    this.lastChaosStyleUpdate = 0;
    if (!this.chaosMode) {
      const style = this.studioElement.nativeElement.style;
      style.removeProperty('--chaos-hue');
      style.removeProperty('--chaos-energy');
      style.removeProperty('--chaos-glow');
      style.removeProperty('--chaos-overlay-opacity');
      style.removeProperty('--chaos-drift');
      style.removeProperty('--chaos-rotation');
    }
  }

  setPlaybackRate(event: Event): void {
    const rate = Number((event.target as HTMLSelectElement).value);
    if (![0.5, 0.75, 1, 1.25, 1.5, 2].includes(rate)) return;
    if (this.isYouTubeSource && this.youtubePlayer) {
      const supported = this.youtubePlayer.getAvailablePlaybackRates();
      if (!supported.includes(rate)) {
        this.errorMessage = 'That playback speed is not available for this YouTube video.';
        return;
      }
      this.youtubePlayer.setPlaybackRate(rate);
    } else {
      this.audioElement.nativeElement.playbackRate = rate;
    }
    this.playbackRate = rate;
    this.errorMessage = '';
  }

  toggleYouTubeInput(): void {
    this.youtubeInputOpen = !this.youtubeInputOpen;
    if (!this.youtubeInputOpen) this.youtubeUrl = '';
  }

  onYouTubeUrlInput(event: Event): void {
    this.youtubeUrl = (event.target as HTMLInputElement).value;
  }

  loadYouTubeLink(event: Event): void {
    event.preventDefault();
    const videoId = this.parseYouTubeVideoId(this.youtubeUrl);
    if (!videoId) {
      this.errorMessage = 'Enter a valid YouTube video, Shorts, or live link.';
      return;
    }

    this.stopPlayback();
    this.destroyYouTubePlayer();
    const player = this.audioElement.nativeElement;
    player.removeAttribute('src');
    player.load();
    if (this.audioUrl.startsWith('blob:')) URL.revokeObjectURL(this.audioUrl);
    this.audioUrl = '';
    this.youtubeVideoId = videoId;
    this.youtubeReady = false;
    this.youtubeLoading = true;
    this.youtubeInputOpen = false;
    this.isLiveStream = false;
    this.trackId = 'YOUTUBE';
    this.trackName = `YouTube video ${videoId}`;
    this.duration = 0;
    this.currentTime = 0;
    this.resetAnalysis();
    this.errorMessage = '';
    this.statusMessage = 'Connecting to the official YouTube player. Audio analysis is available for uploaded files.';
    const requestId = ++this.youtubeRequestId;
    window.setTimeout(() => void this.initializeYouTubePlayer(videoId, requestId), 0);
  }

  onLocalPlay(): void {
    if (!this.isYouTubeSource) this.isPlaying = true;
  }

  onLocalPause(): void {
    if (!this.isYouTubeSource) this.isPlaying = false;
  }

  onLocalAudioError(): void {
    const player = this.audioElement.nativeElement;
    if (!this.audioUrl || !player.error || player.currentSrc !== this.audioUrl) return;
    this.isPlaying = false;
    this.errorMessage = player.error.code === 3
      ? 'The selected audio could not be decoded. Try a different MP3, WAV, or FLAC file.'
      : player.error.code === 4
        ? 'This audio format is not supported by your browser. Try an MP3 or WAV file.'
        : 'The audio file stopped loading. Select it again to retry.';
  }

  onDurationChange(): void {
    const duration = this.audioElement.nativeElement.duration;
    this.isLiveStream = duration === Infinity;
    this.duration = Number.isFinite(duration) ? duration : 0;
  }

  onTimeUpdate(): void {
    const currentTime = this.audioElement.nativeElement.currentTime;
    this.currentTime = Number.isFinite(currentTime) ? currentTime : 0;
  }

  onMetadataLoaded(): void {
    this.onDurationChange();
  }

  private parseYouTubeVideoId(value: string): string | null {
    try {
      const url = new URL(value.trim());
      const host = url.hostname.toLowerCase().replace(/^www\./, '');
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

      let videoId = '';
      if (host === 'youtu.be') {
        videoId = url.pathname.split('/').filter(Boolean)[0] ?? '';
      } else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
        const segments = url.pathname.split('/').filter(Boolean);
        if (url.pathname === '/watch') videoId = url.searchParams.get('v') ?? '';
        else if (['embed', 'shorts', 'live'].includes(segments[0] ?? '')) videoId = segments[1] ?? '';
      } else if (host === 'youtube-nocookie.com') {
        const segments = url.pathname.split('/').filter(Boolean);
        if (segments[0] === 'embed') videoId = segments[1] ?? '';
      }
      return /^[\w-]{11}$/.test(videoId) ? videoId : null;
    } catch {
      return null;
    }
  }

  private loadYouTubeApi(): Promise<YouTubeNamespace> {
    if (window.YT) return Promise.resolve(window.YT);
    if (this.youtubeApiPromise) return this.youtubeApiPromise;

    this.youtubeApiPromise = new Promise<YouTubeNamespace>((resolve, reject) => {
      const scriptUrl = 'https://www.youtube.com/iframe_api';
      const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${scriptUrl}"]`);
      const timeout = window.setTimeout(() => reject(new Error('YouTube player API timed out.')), 15000);
      const previousCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previousCallback?.();
        window.clearTimeout(timeout);
        if (window.YT) resolve(window.YT);
        else reject(new Error('YouTube player API did not initialize.'));
      };
      if (!existingScript) {
        const script = document.createElement('script');
        script.src = scriptUrl;
        script.async = true;
        script.onerror = () => {
          window.clearTimeout(timeout);
          reject(new Error('YouTube player API could not be loaded.'));
        };
        document.head.appendChild(script);
      }
    });
    return this.youtubeApiPromise;
  }

  private async initializeYouTubePlayer(videoId: string, requestId: number): Promise<void> {
    try {
      const youtube = await this.loadYouTubeApi();
      if (requestId !== this.youtubeRequestId || !this.youtubePlayerHost) return;

      this.youtubePlayer = new youtube.Player(this.youtubePlayerHost.nativeElement, {
        videoId,
        width: '640',
        height: '360',
        playerVars: {
          autoplay: 0,
          controls: 0,
          enablejsapi: 1,
          playsinline: 1,
          rel: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: ({ target }) => {
            if (requestId !== this.youtubeRequestId) {
              target.destroy();
              return;
            }
            this.zone.run(() => {
              this.youtubeReady = true;
              this.youtubeLoading = false;
              const videoData = target.getVideoData();
              this.trackName = videoData.title || `YouTube video ${videoId}`;
              this.isLiveStream = Boolean(videoData.isLiveContent);
              this.volume = this.muted ? 0 : this.volume;
              target.setVolume(this.volume);
              if (this.muted) target.mute();
              const rates = target.getAvailablePlaybackRates();
              if (rates.includes(this.playbackRate)) target.setPlaybackRate(this.playbackRate);
              this.updateYouTubePosition();
              this.startYouTubePositionPolling();
              this.statusMessage = 'YouTube player ready. Upload an audio file to enable live audio analysis.';
            });
          },
          onStateChange: ({ data }) => this.onYouTubeStateChange(data),
          onError: ({ data }) => this.onYouTubeError(data),
        },
      });
    } catch {
      if (requestId !== this.youtubeRequestId) return;
      this.youtubeApiPromise = undefined;
      this.zone.run(() => {
        this.youtubeLoading = false;
        this.errorMessage = 'YouTube could not load this video. Check the link or try another video.';
      });
    }
  }

  private onYouTubeStateChange(state: number): void {
    const youtube = window.YT;
    this.zone.run(() => {
      if (state === youtube?.PlayerState.PLAYING) {
        this.isPlaying = true;
        this.statusMessage = 'Playing from YouTube. Upload audio for live visual analysis.';
      } else if (state === youtube?.PlayerState.PAUSED) {
        this.isPlaying = false;
      } else if (state === youtube?.PlayerState.ENDED) {
        this.onEnded();
      }
    });
  }

  private onYouTubeError(code: number): void {
    this.zone.run(() => {
      this.youtubeLoading = false;
      this.isPlaying = false;
      this.errorMessage = code === 101 || code === 150
        ? 'This video owner does not allow playback here. Try another YouTube video.'
        : 'YouTube could not play this video. Check the link or try another video.';
    });
  }

  private startYouTubePositionPolling(): void {
    window.clearInterval(this.youtubePositionTimer);
    this.zone.runOutsideAngular(() => {
      this.youtubePositionTimer = window.setInterval(() => this.updateYouTubePosition(), 250);
    });
  }

  private updateYouTubePosition(): void {
    if (!this.youtubePlayer || !this.youtubeReady) return;
    const currentTime = this.youtubePlayer.getCurrentTime();
    const duration = this.youtubePlayer.getDuration();
    const safeCurrentTime = Number.isFinite(currentTime) ? currentTime : 0;
    const finiteDuration = Number.isFinite(duration) && duration > 0;
    const safeDuration = finiteDuration ? duration : 0;
    const live = Boolean(this.youtubePlayer.getVideoData().isLiveContent)
      || (!finiteDuration && this.youtubePlayer.getPlayerState() === window.YT?.PlayerState.PLAYING);
    if (Math.abs(safeCurrentTime - this.currentTime) < 0.2
      && Math.abs(safeDuration - this.duration) < 0.2
      && this.isLiveStream === live) return;

    this.zone.run(() => {
      this.currentTime = safeCurrentTime;
      this.duration = safeDuration;
      this.isLiveStream = live;
    });
  }

  private destroyYouTubePlayer(): void {
    this.youtubeRequestId++;
    window.clearInterval(this.youtubePositionTimer);
    this.youtubePositionTimer = 0;
    this.youtubePlayer?.destroy();
    this.youtubePlayer = undefined;
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

  private stopPlayback(): void {
    this.audioElement.nativeElement.pause();
    this.youtubePlayer?.pauseVideo();
    this.isPlaying = false;
  }

  private resetAnalysis(): void {
    this.tempo = null;
    this.tempoSource = null;
    this.prismBeatPulse = 0;
    this.prismWaveAge = 1;
    this.prismBassEnvelope = 0;
    this.prismBassAverage = 0;
    this.lastPrismTransient = 0;
    this.prismBassInitialized = false;
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
    if (now - this.lastFrameTime < FRAME_INTERVAL_MS) {
      this.animationFrame = requestAnimationFrame(this.drawLoop);
      return;
    }
    const delta = this.lastFrameTime ? Math.min((now - this.lastFrameTime) / 1000, 0.1) : 1 / 45;
    this.lastFrameTime = now;
    this.beatPulse *= Math.exp(-delta / 0.34);
    this.prismBeatPulse *= Math.exp(-delta / 0.16);
    this.prismWaveAge += delta;
    const hasLiveAnalysis = this.isPlaying && !this.isYouTubeSource;
    if (hasLiveAnalysis) this.updateAudioLevels(now);
    if (this.chaosMode && now - this.lastChaosStyleUpdate >= 1000 / 30) {
      this.updateChaosEffects(now, delta, hasLiveAnalysis);
    }
    this.canvases?.forEach(({ nativeElement }) => {
      const canvas = nativeElement;
      const cardId = VISUAL_CARD_IDS.find((id) => id === canvas.dataset['visual']);
      if (!cardId) return;
      if (!this.cardOptions[cardId].enabled || !this.visibleCanvases.has(canvas)) return;
      const drive = this.updateCardDrive(cardId, delta);
      const size = this.canvasSizes.get(canvas);
      if (!size || !size.width || !size.height) return;
      if (cardId === 'prism' && now - this.lastPrismRenderTime < PRISM_FRAME_INTERVAL_MS) return;
      const isSpectrogram = cardId === 'spectrogram';
      const networkFading = cardId === 'network' && this.networkLevels.some((level) => level > 0.01);
      const canHoldFrame = (!hasLiveAnalysis || isSpectrogram)
        && cardId !== 'prism'
        && !(cardId === 'fountain' && this.particles.length > 0)
        && !networkFading;
      let renderKey = '';
      if (canHoldFrame) {
        const colors = this.cardColors[cardId];
        const paletteKey = `${colors.ink ?? this.theme.ink}:${colors.accent ?? this.theme.accent}:${colors.secondary ?? this.theme.secondary}:${colors.particle ?? this.theme.particle}`;
        const dataKey = isSpectrogram
          ? this.lastSpectrogramFrame
          : `${this.currentTime}:${this.bands.sub}:${this.bands.lows}:${this.bands.mids}:${this.bands.highMids}:${this.bands.air}:${this.soundingNotes}`;
        renderKey = `${size.width}:${size.height}:${dataKey}:${this.darkMode}:${paletteKey}:${this.cardOptions[cardId].driver}:${this.cardOptions[cardId].intensity}:${Math.round(drive * 100)}`;
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
      const scale = 1 + drive * this.cardOptions[cardId].intensity * 0.11;
      context.save();
      context.translate(size.width / 2, size.height / 2);
      context.scale(scale, scale);
      context.translate(-size.width / 2, -size.height / 2);
      this.activeVisualCard = cardId;
      try {
        switch (canvas.dataset['visual']) {
          case 'specimen': this.drawSpecimen(context, size.width, size.height, now); break;
          case 'prism': this.drawPrismField(context, size.width, size.height, now); break;
          case 'roll': this.drawRoll(context, size.width, size.height, now); break;
          case 'fountain': this.drawFountain(context, size.width, size.height); break;
          case 'orbit': this.drawOrbit(context, size.width, size.height); break;
          case 'glyph': this.drawGlyph(context, size.width, size.height, now); break;
          case 'waveform': this.drawWaveform(context, size.width, size.height); break;
          case 'scope': this.drawStereoScope(context, size.width, size.height); break;
          case 'spectrum': this.drawSpectrum(context, size.width, size.height); break;
          case 'spectrogram': this.drawSpectrogram(context, size.width, size.height); break;
          case 'network': this.drawNoteNetwork(context, size.width, size.height, now); break;
        }
      } finally {
        context.restore();
        this.activeVisualCard = null;
      }
      if (cardId === 'prism') this.lastPrismRenderTime = now;
      if (canHoldFrame) this.renderedStaticFrames.set(canvas, renderKey);
    });
    this.animationFrame = requestAnimationFrame(this.drawLoop);
  };

  private updateChaosEffects(now: number, delta: number, hasLiveAnalysis: boolean): void {
    this.lastChaosStyleUpdate = now;
    const reducedMotion = this.reducedMotionQuery?.matches ?? false;
    const bandEnergy = Math.min(
      1,
      (this.bands.sub * 0.38 + this.bands.lows * 0.27 + this.bands.mids * 0.2
        + this.bands.highMids * 0.1 + this.bands.air * 0.05) / 100,
    );
    const spectralEnergy = Math.sqrt(bandEnergy);
    const fallbackBeat = this.tempo
      ? (Math.cos((this.currentTime * this.tempo / 60) * Math.PI * 2) + 1) * 0.5
      : 0;
    const targetEnergy = hasLiveAnalysis
      ? Math.max(spectralEnergy, this.beatPulse * 0.9)
      : this.isYouTubeSource && this.isPlaying ? fallbackBeat * 0.55 : 0;
    const smoothing = 1 - Math.exp(-delta / (targetEnergy > this.chaosEnergy ? 0.045 : 0.2));
    this.chaosEnergy += (targetEnergy - this.chaosEnergy) * smoothing;

    const motionScale = reducedMotion ? 0 : 1;
    const audioHue = this.bands.sub * 1.15 + this.bands.mids * 0.75 + this.bands.air * 0.6;
    const hue = ((reducedMotion || !this.isPlaying ? 0 : now * 0.008) + audioHue) % 360;
    const pulse = this.chaosEnergy;
    const style = this.studioElement.nativeElement.style;
    style.setProperty('--chaos-hue', `${hue.toFixed(1)}deg`);
    style.setProperty('--chaos-energy', pulse.toFixed(3));
    style.setProperty('--chaos-glow', (0.08 + pulse * 0.3).toFixed(3));
    style.setProperty('--chaos-overlay-opacity', (0.1 + pulse * 0.55).toFixed(3));
    style.setProperty('--chaos-drift', `${(Math.sin(now / 260) * pulse * motionScale * 3).toFixed(2)}px`);
    style.setProperty('--chaos-rotation', `${(Math.sin(now / 1800) * pulse * motionScale * 1.7).toFixed(2)}deg`);
  }

  private updateCardDrive(id: VisualCardId, delta: number): number {
    const { driver } = this.cardOptions[id];
    const raw = driver === 'mix'
      ? (this.bands.sub + this.bands.lows + this.bands.mids + this.bands.highMids + this.bands.air) / 5
      : driver === 'beat'
        ? this.beatPulse * 100
        : driver === 'stereo'
          ? (this.widthValue ?? 0)
          : driver === 'notes'
            ? Math.max(...this.networkTargets) * 100
            : this.bands[driver];
    const target = id === 'prism'
      ? Math.min(0.55, Math.sqrt(Math.max(0, raw) / 100) * 0.58)
      : Math.min(1, Math.sqrt(Math.max(0, raw) / 100) * 1.45);
    const current = this.cardDrive[id];
    const timeConstant = target > current ? 0.045 : 0.2;
    const smoothing = 1 - Math.exp(-delta / timeConstant);
    this.cardDrive[id] = current + (target - current) * smoothing;
    return this.cardDrive[id];
  }

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
    if (this.cardOptions.prism.enabled) {
      this.updatePrismBeat(bass, now);
    }
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

  private updatePrismBeat(bass: number, now: number): void {
    if (!this.prismBassInitialized) {
      this.prismBassEnvelope = bass;
      this.prismBassAverage = bass;
      this.prismBassInitialized = true;
      return;
    }

    this.prismBassEnvelope += (bass - this.prismBassEnvelope) * (bass > this.prismBassEnvelope ? 0.55 : 0.2);
    this.prismBassAverage += (bass - this.prismBassAverage) * (bass > this.prismBassAverage ? 0.035 : 0.012);
    const onset = this.prismBassEnvelope - this.prismBassAverage;
    const threshold = Math.max(3, this.prismBassAverage * 0.08);
    if (onset > threshold && now - this.lastPrismTransient > 130) {
      this.prismBeatPulse = Math.max(this.prismBeatPulse, Math.min(1, onset / Math.max(12, this.prismBassAverage * 0.38)));
      this.prismWaveAge = 0;
      this.lastPrismTransient = now;
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
    this.beatPulse = 1;
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
    const ratio = Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.25 : 1.5);
    const pixelWidth = Math.max(1, Math.round(rect.width * ratio));
    const pixelHeight = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    this.canvasSizes.set(canvas, { width: rect.width, height: rect.height });
    this.renderedStaticFrames.delete(canvas);
  }

  private drawPrismField(ctx: CanvasRenderingContext2D, width: number, height: number, now: number): void {
    const hasLiveAudio = this.isPlaying && !this.isYouTubeSource;
    const driverEnergy = hasLiveAudio ? this.cardDrive.prism : 0;
    const kick = hasLiveAudio ? Math.min(0.65, this.prismBeatPulse * 0.72) : 0;
    const intensity = Math.min(this.cardOptions.prism.intensity, 1.25);
    const compactLayout = width < 560;
    const clusterRadius = compactLayout
      ? Math.min(width * 0.43, height / 3 * 0.46)
      : Math.min(width / 6, height * 0.48);
    const verticalRadius = compactLayout ? clusterRadius : height * 0.46;
    const formColors = [this.theme.accent, this.theme.secondary, this.theme.particle] as const;
    const formSignals = hasLiveAudio
      ? [this.bands.sub, this.bands.mids, this.bands.highMids].map((band) => Math.sqrt(band / 100))
      : [0, 0, 0];
    const copiesPerForm = [167, 167, 166] as const;
    const waveRadius = Math.min(1.15, this.prismWaveAge / 0.58);
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const projectedX = this.prismProjectedX;
    const projectedY = this.prismProjectedY;

    for (let form = 0; form < PRISM_GEOMETRIES.length; form++) {
      const geometry = PRISM_GEOMETRIES[form];
      const centerX = compactLayout ? width / 2 : width * ((form + 0.5) / 3);
      const centerY = compactLayout ? height * ((form + 0.5) / 3) : height / 2;
      const tone = formSignals[form];
      const formColor = formColors[form];
      const count = copiesPerForm[form];
      const objectOffset = form * 167;
      const cellWidth = Math.max(1, (clusterRadius * 2) / 16);
      const cellHeight = Math.max(1, (verticalRadius * 2) / 16);

      this.prismCellHeads.fill(-1);
      this.prismCollisionTargetX.fill(0, objectOffset, objectOffset + count);
      this.prismCollisionTargetY.fill(0, objectOffset, objectOffset + count);
      for (let instance = 0; instance < count; instance++) {
        const objectIndex = objectOffset + instance;
        const spread = Math.sqrt((instance + 0.5) / count);
        const angle = instance * goldenAngle + form * 0.72 + now * (0.00004 + tone * 0.00012);
        const sizeSeed = ((instance * 37 + form * 19) % 101) / 100;
        const kickSensitivity = 0.45 + sizeSeed * 1.05;
        const wave = hasLiveAudio
          ? kick * kickSensitivity * Math.exp(-Math.pow((spread - waveRadius) / 0.14, 2))
          : 0;
        const size = (2.4 + sizeSeed * 1.6) * (0.8 + sizeSeed * 0.4)
          * (0.88 + driverEnergy * 0.2 * intensity + tone * 0.04
            + wave * (0.75 + sizeSeed * 0.55));
        const radialOffset = wave * (2 + spread * 14);
        const driftPhase = instance * 2.399 + form * 1.7;
        const driftX = Math.sin(now * 0.00047 + driftPhase) * (1.25 + tone * 1.4);
        const driftY = Math.cos(now * 0.00039 + driftPhase * 1.13) * (0.9 + tone * 1.1);
        const x = centerX + Math.cos(angle) * (clusterRadius * spread + radialOffset) + driftX;
        const y = centerY + Math.sin(angle) * (verticalRadius * spread + radialOffset) + driftY;

        this.prismObjectX[objectIndex] = x;
        this.prismObjectY[objectIndex] = y;
        this.prismObjectSize[objectIndex] = size;
        this.prismObjectAngle[objectIndex] = angle;
        this.prismObjectSeed[objectIndex] = sizeSeed;
        this.prismObjectWave[objectIndex] = wave;

        const cellX = Math.max(0, Math.min(15, Math.floor((x - (centerX - clusterRadius)) / cellWidth)));
        const cellY = Math.max(0, Math.min(15, Math.floor((y - (centerY - verticalRadius)) / cellHeight)));
        const cell = cellY * 16 + cellX;
        this.prismCellX[instance] = cellX;
        this.prismCellY[instance] = cellY;
        this.prismCellNext[instance] = this.prismCellHeads[cell];
        this.prismCellHeads[cell] = instance;
      }

      for (let instance = 0; instance < count; instance++) {
        const objectIndex = objectOffset + instance;
        const cellX = this.prismCellX[instance];
        const cellY = this.prismCellY[instance];
        const x = this.prismObjectX[objectIndex];
        const y = this.prismObjectY[objectIndex];
        for (let offsetY = -1; offsetY <= 1; offsetY++) {
          const neighborY = cellY + offsetY;
          if (neighborY < 0 || neighborY > 15) continue;
          for (let offsetX = -1; offsetX <= 1; offsetX++) {
            const neighborX = cellX + offsetX;
            if (neighborX < 0 || neighborX > 15) continue;
            let other = this.prismCellHeads[neighborY * 16 + neighborX];
            while (other !== -1) {
              if (other > instance) {
                const otherIndex = objectOffset + other;
                const dx = x - this.prismObjectX[otherIndex];
                const dy = y - this.prismObjectY[otherIndex];
                const distanceSquared = dx * dx + dy * dy;
                const minimumDistance = (this.prismObjectSize[objectIndex]
                  + this.prismObjectSize[otherIndex]) * 0.62 + 1.2;
                if (distanceSquared < minimumDistance * minimumDistance) {
                  const distance = Math.sqrt(distanceSquared) || 0.001;
                  const push = Math.min(2.5, (minimumDistance - distance) * 0.28);
                  const pushX = dx / distance * push;
                  const pushY = dy / distance * push;
                  this.prismCollisionTargetX[objectIndex] += pushX;
                  this.prismCollisionTargetY[objectIndex] += pushY;
                  this.prismCollisionTargetX[otherIndex] -= pushX;
                  this.prismCollisionTargetY[otherIndex] -= pushY;
                }
              }
              other = this.prismCellNext[other];
            }
          }
        }
      }

      for (let instance = 0; instance < count; instance++) {
        const objectIndex = objectOffset + instance;
        let targetX = this.prismCollisionTargetX[objectIndex];
        let targetY = this.prismCollisionTargetY[objectIndex];
        const targetLength = Math.hypot(targetX, targetY);
        if (targetLength > 4) {
          targetX = targetX / targetLength * 4;
          targetY = targetY / targetLength * 4;
        }
        this.prismCollisionX[objectIndex] += (targetX - this.prismCollisionX[objectIndex]) * 0.32;
        this.prismCollisionY[objectIndex] += (targetY - this.prismCollisionY[objectIndex]) * 0.32;
      }

      if (!compactLayout) {
        const glow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, clusterRadius * 1.8);
        glow.addColorStop(0, `${formColor}12`);
        glow.addColorStop(0.58, `${formColor}08`);
        glow.addColorStop(1, `${formColor}00`);
        ctx.fillStyle = glow;
        ctx.fillRect(centerX - clusterRadius, centerY - verticalRadius, clusterRadius * 2, verticalRadius * 2);
      }

      let edgeOffset = 0;
      ctx.beginPath();
      for (let instance = 0; instance < count; instance++) {
        const objectIndex = objectOffset + instance;
        const angle = this.prismObjectAngle[objectIndex];
        const sizeSeed = this.prismObjectSeed[objectIndex];
        const wave = this.prismObjectWave[objectIndex];
        const size = this.prismObjectSize[objectIndex];
        const x = this.prismObjectX[objectIndex] + this.prismCollisionX[objectIndex];
        const y = this.prismObjectY[objectIndex] + this.prismCollisionY[objectIndex];
        if (size < PRISM_DETAIL_THRESHOLD) {
          const silhouette = PRISM_SILHOUETTES[form];
          const silhouetteScale = size * (form === 2 ? 0.78 : 1);
          for (let point = 0; point < silhouette.length; point++) {
            const [vx, vy] = silhouette[point];
            projectedX[point] = x + vx * silhouetteScale;
            projectedY[point] = y + vy * silhouetteScale;
          }
          ctx.moveTo(projectedX[0], projectedY[0]);
          for (let point = 1; point < silhouette.length; point++) {
            ctx.lineTo(projectedX[point], projectedY[point]);
          }
          ctx.closePath();
          for (let point = 0; point < silhouette.length; point++) {
            const next = (point + 1) % silhouette.length;
            this.prismEdgeBuffer[edgeOffset++] = projectedX[point];
            this.prismEdgeBuffer[edgeOffset++] = projectedY[point];
            this.prismEdgeBuffer[edgeOffset++] = projectedX[next];
            this.prismEdgeBuffer[edgeOffset++] = projectedY[next];
          }
          continue;
        }
        const wobble = Math.sin(now * 0.001 + instance * 1.7 + form) * (0.6 + tone * 2);
        const particleX = x + Math.cos(angle + 1.2) * wobble;
        const particleY = y + Math.sin(angle + 1.2) * wobble;
        const rotationY = now * (0.00035 + tone * 0.00055 + wave * 0.00035) + instance * 0.61 + form;
        const rotationX = Math.sin(now * (0.0003 + tone * 0.00025) + instance + form) * 0.85;
        const sinY = Math.sin(rotationY);
        const cosY = Math.cos(rotationY);
        const sinX = Math.sin(rotationX);
        const cosX = Math.cos(rotationX);
        const perspective = 3 / (3.2 + Math.sin(instance * 2.4 + form) * 0.55);
        for (let vertex = 0; vertex < geometry.vertices.length; vertex++) {
          const [vx, vy, vz] = geometry.vertices[vertex];
          const rotatedX = vx * cosY - vz * sinY;
          const rotatedZ = vx * sinY + vz * cosY;
          const rotatedY = vy * cosX - rotatedZ * sinX;
          projectedX[vertex] = particleX + rotatedX * size * perspective;
          projectedY[vertex] = particleY + rotatedY * size * perspective;
        }
        for (const [a, b, c] of geometry.faces) {
          const winding = (projectedX[b] - projectedX[a]) * (projectedY[c] - projectedY[a])
            - (projectedY[b] - projectedY[a]) * (projectedX[c] - projectedX[a]);
          ctx.moveTo(projectedX[a], projectedY[a]);
          ctx.lineTo(projectedX[winding < 0 ? c : b], projectedY[winding < 0 ? c : b]);
          ctx.lineTo(projectedX[winding < 0 ? b : c], projectedY[winding < 0 ? b : c]);
          ctx.closePath();
        }
        for (const [a, b] of geometry.edges) {
          this.prismEdgeBuffer[edgeOffset++] = projectedX[a];
          this.prismEdgeBuffer[edgeOffset++] = projectedY[a];
          this.prismEdgeBuffer[edgeOffset++] = projectedX[b];
          this.prismEdgeBuffer[edgeOffset++] = projectedY[b];
        }
      }

      const formAlpha = Math.min(0.98, 0.84 + tone * 0.08 + kick * 0.06);
      ctx.save();
      ctx.globalAlpha = formAlpha;
      ctx.fillStyle = formColor;
      ctx.fill();
      ctx.beginPath();
      for (let offset = 0; offset < edgeOffset; offset += 4) {
        ctx.moveTo(this.prismEdgeBuffer[offset], this.prismEdgeBuffer[offset + 1]);
        ctx.lineTo(this.prismEdgeBuffer[offset + 2], this.prismEdgeBuffer[offset + 3]);
      }
      ctx.globalAlpha = 0.38 + tone * 0.15 + kick * 0.2;
      ctx.strokeStyle = formColor;
      ctx.lineWidth = 0.42 + kick * 0.8;
      ctx.stroke();
      ctx.restore();

      if (hasLiveAudio && kick > 0.035) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.shadowColor = formColor;
        ctx.shadowBlur = 7 + kick * 20;

        ctx.beginPath();
        for (let instance = 0; instance < count; instance++) {
          const objectIndex = objectOffset + instance;
          const wave = this.prismObjectWave[objectIndex];
          if (wave < 0.045) continue;
          const x = this.prismObjectX[objectIndex] + this.prismCollisionX[objectIndex];
          const y = this.prismObjectY[objectIndex] + this.prismCollisionY[objectIndex];
          const glowRadius = this.prismObjectSize[objectIndex] * (0.34 + wave * 0.3);
          ctx.moveTo(x + glowRadius, y);
          ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
        }
        ctx.globalAlpha = 0.13 + kick * 0.2;
        ctx.fillStyle = formColor;
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.beginPath();
        for (let instance = 0; instance < count; instance++) {
          const objectIndex = objectOffset + instance;
          if (this.prismObjectWave[objectIndex] < 0.045) continue;
          const x = this.prismObjectX[objectIndex] + this.prismCollisionX[objectIndex];
          const y = this.prismObjectY[objectIndex] + this.prismCollisionY[objectIndex];
          const coreRadius = this.prismObjectSize[objectIndex] * 0.19;
          ctx.moveTo(x + coreRadius, y);
          ctx.arc(x, y, coreRadius, 0, Math.PI * 2);
        }
        ctx.globalAlpha = 0.28 + kick * 0.3;
        ctx.fillStyle = formColor;
        ctx.fill();
        ctx.restore();
      }
    }
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
    const barDuration = this.tempo
      ? 240 / this.tempo
      : Math.max(0.25, Math.min(this.duration || 30, 30) / 4);
    const firstVisibleBar = this.tempo
      ? Math.max(0, Math.floor(this.currentTime / barDuration) - 3)
      : Math.max(0, Math.ceil(this.currentTime / barDuration) - 4);
    const windowStart = firstVisibleBar * barDuration;
    for (let column = 0; column < 4; column++) {
      ctx.fillStyle = this.theme.muted;
      ctx.font = '9px "IBM Plex Mono", monospace';
      ctx.fillText(String(firstVisibleBar + column + 1), left + column * columnWidth + 5, top + 11);
    }
    for (const event of this.noteEvents) {
      if (event.time < windowStart || event.time > this.currentTime) continue;
      const x = left + ((event.time - windowStart) / (barDuration * 4)) * gridWidth;
      const row = Math.max(0, Math.min(6, 6 - Math.floor((event.midi - 24) / 12)));
      ctx.globalAlpha = 0.3 + event.strength / 510;
      ctx.fillStyle = this.theme.accent;
      ctx.fillRect(x, top + row * rowHeight + rowHeight * 0.4, Math.max(4, gridWidth / 48), 3);
    }
    ctx.globalAlpha = 1;
    const playhead = left + Math.max(0, Math.min(gridWidth,
      ((this.currentTime - windowStart) / (barDuration * 4)) * gridWidth));
    ctx.strokeStyle = this.theme.ink;
    ctx.lineWidth = 1.35;
    ctx.beginPath(); ctx.moveTo(playhead, 0); ctx.lineTo(playhead, height); ctx.stroke();
    ctx.fillStyle = this.theme.ink;
    ctx.fillRect(playhead - 3, 0, 6, 3);
    if (this.isPlaying && this.chordNotes.length) {
      ctx.fillStyle = this.theme.accent;
      for (const note of this.chordNotes) {
        const pitchClass = PITCH_CLASSES.indexOf(note.replace(/\d+$/, ''));
        const octave = Number(note.match(/\d+$/)?.[0] ?? 3);
        const midi = pitchClass + (octave + 1) * 12;
        const y = bottom - ((midi - 24) / 72) * gridHeight;
        const noteX = Math.min(right - 18, playhead + 4);
        ctx.fillRect(noteX, y - 2, 14 + this.bands.mids * 0.12, 3);
      }
    }
    void now;
  }

  private drawWaveform(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const left = 10;
    const right = width - 10;
    const top = 8;
    const bottom = height - 8;
    const rowCount = 6;
    const rowGap = Math.max(5, height * 0.035);
    const rowHeight = (bottom - top - rowGap * (rowCount - 1)) / rowCount;
    const bands = [
      [6000, 16000],
      [2000, 6000],
      [700, 2000],
      [250, 700],
      [60, 250],
      [30, 60],
    ] as const;
    const frames = this.spectrogramFrames;
    const sampleCount = Math.max(1, frames.length);
    const visualScale = 0.62 + Math.min(1.3, this.cardDrive.waveform * this.cardOptions.waveform.intensity);
    const bandColors = [
      this.theme.particle,
      this.theme.secondary,
      this.theme.accent,
      this.theme.particle,
      this.theme.secondary,
      this.theme.accent,
    ];

    for (let row = 0; row < rowCount; row++) {
      const y = top + row * (rowHeight + rowGap);
      const centerY = y + rowHeight * 0.5;
      const lowerFrequency = bands[row][0];
      const upperFrequency = bands[row][1];
      const lowerBin = Math.max(0, Math.floor(
        (Math.log(lowerFrequency / 35) / Math.log(16000 / 35)) * 64,
      ));
      const upperBin = Math.min(63, Math.ceil(
        (Math.log(upperFrequency / 35) / Math.log(16000 / 35)) * 64,
      ));
      const upper: number[] = [];
      const lower: number[] = [];

      for (let column = 0; column < sampleCount; column++) {
        const frame = frames[column];
        let energy = 0;
        let count = 0;
        if (frame) {
          for (let bin = lowerBin; bin <= upperBin; bin++) {
            energy += frame[bin] ?? 0;
            count++;
          }
        }
        const normalized = count ? Math.sqrt((energy / count) / 255) : 0;
        const envelope = normalized * rowHeight * 0.47 * visualScale;
        const x = left + (column / Math.max(1, sampleCount - 1)) * (right - left);
        upper.push(centerY - envelope);
        lower.push(centerY + envelope);
        if (column === 0 || column % 16 === 0) {
          ctx.fillStyle = `${this.theme.ink}0e`;
          ctx.fillRect(x, y, 1, rowHeight);
        }
      }

      ctx.beginPath();
      ctx.moveTo(left, centerY);
      for (let column = 0; column < sampleCount; column++) {
        const x = left + (column / Math.max(1, sampleCount - 1)) * (right - left);
        ctx.lineTo(x, upper[column]);
      }
      for (let column = sampleCount - 1; column >= 0; column--) {
        const x = left + (column / Math.max(1, sampleCount - 1)) * (right - left);
        ctx.lineTo(x, lower[column]);
      }
      ctx.closePath();
      ctx.fillStyle = `${bandColors[row]}20`;
      ctx.fill();

      ctx.beginPath();
      for (let column = 0; column < sampleCount; column++) {
        const x = left + (column / Math.max(1, sampleCount - 1)) * (right - left);
        if (column === 0) ctx.moveTo(x, upper[column]);
        else ctx.lineTo(x, upper[column]);
      }
      ctx.strokeStyle = `${bandColors[row]}c2`;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.beginPath();
      for (let column = 0; column < sampleCount; column++) {
        const x = left + (column / Math.max(1, sampleCount - 1)) * (right - left);
        if (column === 0) ctx.moveTo(x, lower[column]);
        else ctx.lineTo(x, lower[column]);
      }
      ctx.strokeStyle = `${bandColors[row]}66`;
      ctx.lineWidth = 0.65;
      ctx.stroke();
    }

    const cursorX = right - 1;
    ctx.strokeStyle = `${this.theme.accent}b8`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cursorX, top - 2);
    ctx.lineTo(cursorX, bottom + 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cursorX, top + 2 * (rowHeight + rowGap) + rowHeight / 2, 5, 0, Math.PI * 2);
    ctx.fillStyle = this.theme.surface;
    ctx.fill();
    ctx.strokeStyle = this.theme.accent;
    ctx.lineWidth = 1.5;
    ctx.stroke();
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
    if (this.particles.length > 520) this.particles.splice(0, 24);
  }

  private drawOrbit(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width * 0.35, height * 0.37);
    const beatDuration = this.tempo ? 60 / this.tempo : 0;
    const barDuration = beatDuration * 4;
    const barPhase = barDuration ? (this.currentTime % barDuration) / barDuration : 0;
    const activeStep = beatDuration ? Math.floor(barPhase * 16) : -1;
    const barNumber = barDuration ? Math.floor(this.currentTime / barDuration) + 1 : '--';
    const pulse = this.isPlaying ? this.beatPulse : 0;
    ctx.save();
    ctx.translate(cx, cy);

    ctx.strokeStyle = `${this.theme.ink}1c`;
    ctx.lineWidth = 1;
    for (const ringScale of [0.34, 0.58, 0.82, 1]) {
      ctx.beginPath();
      ctx.arc(0, 0, radius * ringScale, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (let tick = 0; tick < 48; tick++) {
      const angle = (tick / 48) * Math.PI * 2 - Math.PI / 2;
      const majorTick = tick % 12 === 0;
      const outer = radius * 1.17;
      const inner = outer - (majorTick ? 8 : tick % 3 === 0 ? 4 : 2);
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
      ctx.strokeStyle = majorTick ? `${this.theme.ink}66` : `${this.theme.ink}26`;
      ctx.lineWidth = majorTick ? 1.2 : 0.8;
      ctx.stroke();
    }

    ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let bar = 0; bar < 4; bar++) {
      const angle = (bar / 4) * Math.PI * 2 - Math.PI / 2;
      ctx.fillStyle = bar === (activeStep < 0 ? -1 : Math.floor(activeStep / 4))
        ? this.theme.accent
        : `${this.theme.ink}ad`;
      ctx.fillText(String(bar + 1), Math.cos(angle) * radius * 1.37, Math.sin(angle) * radius * 1.37);
    }

    const segmentAngle = (Math.PI * 2) / 16;
    for (let step = 0; step < 16; step++) {
      const start = -Math.PI / 2 + step * segmentAngle + 0.045;
      const end = -Math.PI / 2 + (step + 1) * segmentAngle - 0.045;
      const isActive = step === activeStep;
      const hasPassed = activeStep >= 0 && step < activeStep;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.91, start, end);
      ctx.strokeStyle = isActive
        ? this.theme.accent
        : hasPassed
          ? `${this.theme.accent}6b`
          : `${this.theme.accent}1a`;
      ctx.lineWidth = isActive ? 3 + pulse * 1.5 : 2.5;
      ctx.lineCap = 'round';
      ctx.shadowColor = this.theme.accent;
      ctx.shadowBlur = isActive && this.darkMode ? 7 + pulse * 8 : 0;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    const handAngle = -Math.PI / 2 + barPhase * Math.PI * 2;
    const handLength = radius * 1.17;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(handAngle) * handLength, Math.sin(handAngle) * handLength);
    ctx.strokeStyle = `${this.theme.ink}e0`;
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    ctx.shadowColor = `${this.theme.ink}a6`;
    ctx.shadowBlur = 4;
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = this.theme.surface;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `${this.theme.muted}b8`;
    ctx.font = '8px "IBM Plex Mono", monospace';
    ctx.fillText('BAR', 0, -radius * 0.08);
    ctx.fillStyle = this.theme.ink;
    ctx.font = 'bold 15px "IBM Plex Mono", monospace';
    ctx.fillText(String(barNumber), 0, radius * 0.14);
    ctx.fillStyle = this.theme.particle;
    ctx.shadowColor = this.theme.particle;
    ctx.shadowBlur = 6 + pulse * 8;
    ctx.beginPath();
    ctx.arc(0, 0, 3.5 + pulse * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
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
      Object.assign(this.theme, DARK_THEME);
      this.darkMode = true;
    }
    try {
      const savedCards: unknown = JSON.parse(localStorage.getItem('audiovis-card-options') ?? 'null');
      if (savedCards && typeof savedCards === 'object') {
        for (const id of VISUAL_CARD_IDS) {
          const saved = (savedCards as Partial<Record<VisualCardId, Partial<VisualCardOptions>>>)[id];
          if (!saved) continue;
          if (typeof saved.enabled === 'boolean') this.cardOptions[id].enabled = saved.enabled;
          if (typeof saved.intensity === 'number' && Number.isFinite(saved.intensity)) {
            this.cardOptions[id].intensity = Math.min(2.2, Math.max(0.4, saved.intensity));
          }
          const driver = AUDIO_DRIVERS.find(({ value }) => value === saved.driver)?.value;
          if (driver) this.cardOptions[id].driver = driver;
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
