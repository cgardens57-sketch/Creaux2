import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  ArrowLeft,
  AudioLines,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Database,
  Disc3,
  GalleryHorizontalEnd,
  Heart,
  Home,
  ImagePlus,
  LayoutList,
  LibraryBig,
  ListMusic,
  ListPlus,
  LoaderCircle,
  Maximize2,
  Minus,
  Orbit,
  PanelRight,
  Pause,
  Play,
  PlugZap,
  Plus,
  Repeat,
  Repeat1,
  Search,
  Settings2,
  SkipBack,
  SkipForward,
  TriangleAlert,
  Undo2,
  Volume2,
  VolumeX,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FC,
  type FormEvent,
  type KeyboardEvent,
  type WheelEvent,
} from 'react';
import { I18nextProvider } from 'react-i18next';
import { toast, Toaster } from 'sonner';

import { i18n } from '@nuclearplayer/i18n';
import {
  formatArtistNames,
  pickArtwork,
  stripResolutionState,
  type AlbumRef,
  type ArtistRef,
  type PlaylistIndexEntry,
  type PlaylistRef,
  type SearchResults,
  type Track,
} from '@nuclearplayer/model';
import type { ProviderKind, RepeatMode } from '@nuclearplayer/plugin-sdk';

import {
  SoundProvider,
  type SoundPresentation,
} from '../components/SoundProvider';
import { StreamResolver } from '../components/StreamResolver';
import { useCoreSetting } from '../hooks/useCoreSetting';
import { useInstallPlugin } from '../hooks/useInstallPlugin';
import { useMarketplacePlugins } from '../hooks/useMarketplacePlugins';
import { useProviders } from '../hooks/useProviders';
import { dashboardHost } from '../services/dashboardHost';
import {
  cacheLastPlayedTrack,
  clearLastPlayedTrackCache,
} from '../services/lastPlayedTrackCache';
import { Logger } from '../services/logger';
import { metadataHost } from '../services/metadataHost';
import { isCreauxPluginSupported } from '../services/plugins/creauxPluginPolicy';
import { providersHost } from '../services/providersHost';
import {
  applyWaveformReactivity,
  clampWaveformReactivity,
  clampWaveformSegments,
  MAX_WAVEFORM_REACTIVITY,
  MAX_WAVEFORM_SEGMENTS,
  MIN_WAVEFORM_REACTIVITY,
  MIN_WAVEFORM_SEGMENTS,
  selectWaveformSegments,
  useAudioVisualizerStore,
} from '../stores/audioVisualizerStore';
import { useFavoritesStore } from '../stores/favoritesStore';
import { usePlaylistStore } from '../stores/playlistStore';
import { usePluginStore } from '../stores/pluginStore';
import { useProvidersStore } from '../stores/providersStore';
import { useQueueStore } from '../stores/queueStore';
import { useSoundStore } from '../stores/soundStore';
import { useStartupStore } from '../stores/startupStore';
import { RemiliaBossSequence } from './RemiliaBossSequence';
import {
  TitleLoadingScreen,
  TitleSequence,
  type TitleSequenceDestination,
} from './TitleSequence';
import {
  artistCreditContext,
  TrackArtistLinks,
  type TrackArtistSelection,
} from './TrackArtistLinks';

import './creaux-app.css';

type ViewId = 'home' | 'search' | 'library' | 'now';
type TrackPresentation = 'precision' | 'carousel';
type SystemTab = 'interface' | 'sources' | 'catalog';
type TitleAudioPhase =
  | 'full'
  | 'silent'
  | 'warming'
  | 'ambient'
  | 'releasing'
  | 'settings-exit';

const appWindow = getCurrentWindow();
const queryClient = new QueryClient();
const TRACK_PRESENTATION_KEY = 'creaux2-track-presentation';
const PLAYLIST_ARTWORK_SIZE = 1024;
const CAROUSEL_VISIBLE_RADIUS = 3;
const TITLE_SILENT_PREROLL_SECONDS = 5;
const TITLE_LOADER_DISSOLVE_MS = 720;
const CIRNO_FUMO_URL = new URL('./assets/cirno-fumo.png', import.meta.url).href;
const CIRNO_INTRO_URL = new URL('./assets/cirno-intro.mp3', import.meta.url)
  .href;
const CIRNO_DROPLET_URL = new URL('./assets/cirno-droplet.wav', import.meta.url)
  .href;
const CIRNO_DIALOGUE =
  'あたいはチルノ！幻想郷でいちばん最高で、クールで、最強の氷の妖精だよ！';

const navItems: Array<{
  id: ViewId;
  label: string;
  note: string;
  icon: LucideIcon;
}> = [
  { id: 'home', label: 'Home', note: 'Return', icon: Home },
  { id: 'search', label: 'Search', note: 'Find', icon: Search },
  { id: 'library', label: 'Library', note: 'Keep', icon: LibraryBig },
  { id: 'now', label: 'Now Playing', note: 'Listen', icon: Disc3 },
];

const durationLabel = (durationMs?: number): string => {
  if (!durationMs) {
    return '—';
  }
  const seconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(seconds / 3600);
  if (hours > 0) {
    return `${hours}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

const secondsLabel = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

const artworkUrl = (
  item: { artwork?: Parameters<typeof pickArtwork>[0] },
  size = 400,
): string | undefined => pickArtwork(item.artwork, 'cover', size)?.url;

const readTrackPresentation = (): TrackPresentation =>
  localStorage.getItem(TRACK_PRESENTATION_KEY) === 'carousel'
    ? 'carousel'
    : 'precision';

const resizePlaylistArtwork = async (file: File): Promise<string> => {
  const source = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () =>
        reject(new Error('The selected image is invalid.'));
      element.src = source;
    });
    const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
    const sourceX = (image.naturalWidth - sourceSize) / 2;
    const sourceY = (image.naturalHeight - sourceSize) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = PLAYLIST_ARTWORK_SIZE;
    canvas.height = PLAYLIST_ARTWORK_SIZE;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Artwork processing is unavailable.');
    }
    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      PLAYLIST_ARTWORK_SIZE,
      PLAYLIST_ARTWORK_SIZE,
    );
    return canvas.toDataURL('image/webp', 0.9);
  } finally {
    URL.revokeObjectURL(source);
  }
};

type MediaRef = AlbumRef | ArtistRef | PlaylistRef;

const mediaLabel = (item: MediaRef): string =>
  'title' in item ? item.title : item.name;

const mediaSubtitle = (item: MediaRef, fallback: string): string =>
  'artists' in item && item.artists?.length
    ? item.artists.map((artist) => artist.name).join(', ')
    : fallback;

const CatalogPlate: FC<{ index?: string }> = ({ index = '00' }) => (
  <div className="cx-catalog-plate" aria-hidden="true">
    <span />
    <i>{index}</i>
  </div>
);

const Artwork: FC<{
  item: { artwork?: Parameters<typeof pickArtwork>[0] };
  alt: string;
  index?: string;
}> = ({ item, alt, index }) => {
  const source = artworkUrl(item);
  return source ? (
    <img src={source} alt={alt} />
  ) : (
    <CatalogPlate index={index} />
  );
};

const PlaylistArtwork: FC<{
  playlist: PlaylistIndexEntry;
  index: number;
}> = ({ playlist, index }) => {
  const customArtwork = artworkUrl(playlist);
  const tiles = customArtwork
    ? [customArtwork]
    : playlist.thumbnails.slice(0, 4);
  if (tiles.length === 0) {
    return <CatalogPlate index={String(index + 1).padStart(2, '0')} />;
  }
  return (
    <span
      className={`cx-playlist-mosaic cx-playlist-mosaic-${tiles.length}`}
      aria-hidden="true"
    >
      {tiles.map((source, tileIndex) => (
        <img
          src={source}
          alt=""
          key={`${source}:${tileIndex}`}
          loading="lazy"
        />
      ))}
    </span>
  );
};

const useInterfaceSound = (playbackStatus: string): void => {
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const handlePointer = (event: PointerEvent) => {
      if (playbackStatus === 'playing') {
        return;
      }
      const target = (event.target as HTMLElement).closest(
        'button,[role="button"],select',
      );
      if (!target || target.matches('[data-interface-sound="custom"]')) {
        return;
      }
      const AudioContextClass =
        window.AudioContext ??
        (
          window as typeof window & {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;
      if (!AudioContextClass) {
        return;
      }
      const context = audioRef.current ?? new AudioContextClass();
      audioRef.current = context;
      const oscillator = context.createOscillator();
      const overtone = context.createOscillator();
      const gain = context.createGain();
      const overtoneGain = context.createGain();
      const now = context.currentTime;
      oscillator.type = 'triangle';
      overtone.type = 'sine';
      oscillator.frequency.setValueAtTime(660, now);
      oscillator.frequency.exponentialRampToValueAtTime(520, now + 0.06);
      overtone.frequency.setValueAtTime(1320, now);
      overtone.frequency.exponentialRampToValueAtTime(1040, now + 0.045);
      gain.gain.setValueAtTime(0.012, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.085);
      overtoneGain.gain.setValueAtTime(0.0045, now);
      overtoneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
      oscillator.connect(gain).connect(context.destination);
      overtone.connect(overtoneGain).connect(context.destination);
      oscillator.start(now);
      overtone.start(now);
      oscillator.stop(now + 0.09);
      overtone.stop(now + 0.055);
    };
    document.addEventListener('pointerdown', handlePointer);
    return () => document.removeEventListener('pointerdown', handlePointer);
  }, [playbackStatus]);
};

const TitleBar: FC = () => (
  <header className="cx-titlebar" data-tauri-drag-region>
    <div className="cx-title-lockup" data-tauri-drag-region>
      <span className="cx-title-sigil" />
      <span>CREAUX2</span>
      <small>LISTENING SYSTEM</small>
    </div>
    <div className="cx-title-center" data-tauri-drag-region>
      <span>CRYSTALLINE AUDIO INTERFACE</span>
      <b>02</b>
    </div>
    <div className="cx-window-actions">
      <button
        aria-label="Minimize Creaux2"
        onClick={() => appWindow.minimize()}
      >
        <Minus size={15} />
      </button>
      <button
        aria-label="Maximize Creaux2"
        onClick={() => appWindow.toggleMaximize()}
      >
        <Maximize2 size={14} />
      </button>
      <button aria-label="Close Creaux2" onClick={() => appWindow.close()}>
        <X size={16} />
      </button>
    </div>
  </header>
);

const Navigation: FC<{
  active: ViewId;
  onNavigate: (view: ViewId) => void;
  onSettings: () => void;
}> = ({ active, onNavigate, onSettings }) => (
  <nav className="cx-navigation" aria-label="Primary">
    <div className="cx-nav-axis">
      <span>01</span>
      <i />
      <span>04</span>
    </div>
    <div className="cx-nav-list">
      {navItems.map((item, index) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            className={active === item.id ? 'is-active' : undefined}
            aria-current={active === item.id ? 'page' : undefined}
            onClick={() => onNavigate(item.id)}
          >
            <span className="cx-nav-index">
              {String(index + 1).padStart(2, '0')}
            </span>
            <Icon size={20} />
            <span className="cx-nav-copy">
              <b>{item.label}</b>
              <small>{item.note}</small>
            </span>
            <ChevronRight className="cx-nav-arrow" size={16} />
          </button>
        );
      })}
    </div>
    <button className="cx-settings-trigger" onClick={onSettings}>
      <Settings2 size={19} />
      <span>System</span>
    </button>
  </nav>
);

const CommandBar: FC<{
  query: string;
  onQuery: (query: string) => void;
  onSubmit: () => void;
  onQueue: () => void;
  onBack: () => void;
  onForward: () => void;
  metadataName?: string;
  streamingName?: string;
}> = ({
  query,
  onQuery,
  onSubmit,
  onQueue,
  onBack,
  onForward,
  metadataName,
  streamingName,
}) => {
  return (
    <div className="cx-commandbar">
      <div className="cx-command-lead">
        <div className="cx-help-ribbon">
          <span>HELP</span>
          <small>Search connected music sources.</small>
        </div>
        <div className="cx-history-actions">
          <button aria-label="Back" onClick={onBack}>
            <ChevronLeft size={18} />
          </button>
          <button aria-label="Forward" onClick={onForward}>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <form
        className="cx-search-command"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <Search size={18} />
        <input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Search across the active metadata source"
          aria-label="Search music"
        />
        <button type="submit" aria-label="Submit music search">
          <span>Search</span>
          <ChevronRight size={14} />
        </button>
      </form>
      <div className="cx-source-readout">
        <span>
          <Database size={13} />
          <small>Metadata</small>
          <b>{metadataName ?? 'Not connected'}</b>
        </span>
        <span>
          <AudioLines size={13} />
          <small>Streaming</small>
          <b>{streamingName ?? 'Not connected'}</b>
        </span>
      </div>
      <button className="cx-queue-trigger" onClick={onQueue}>
        <PanelRight size={18} />
        <span>Queue</span>
      </button>
    </div>
  );
};

const PageHeading: FC<{
  index: string;
  eyebrow: string;
  title: string;
  detail: string;
}> = ({ index, eyebrow, title, detail }) => (
  <div className="cx-page-heading">
    <div className="cx-heading-index">{index}</div>
    <div>
      <span>{eyebrow}</span>
      <h1>{title}</h1>
      <p>{detail}</p>
    </div>
    <div className="cx-heading-measure">
      <i />
      <i />
      <i />
      <i />
    </div>
  </div>
);

const EmptyState: FC<{
  icon: LucideIcon;
  title: string;
  text: string;
  action?: string;
  onAction?: () => void;
}> = ({ icon: Icon, title, text, action, onAction }) => (
  <div className="cx-empty">
    <div className="cx-empty-orbit">
      <Icon size={34} />
      <i />
      <i />
    </div>
    <h2>{title}</h2>
    <p>{text}</p>
    {action && onAction && <button onClick={onAction}>{action}</button>}
  </div>
);

const TrackList: FC<{
  tracks: Track[];
  onPlay: (track: Track) => void;
  onQueue: (track: Track) => void;
  onPlaylist: (track: Track) => void;
  onArtist: (selection: TrackArtistSelection) => void;
  onFavorite: (track: Track) => void;
  isFavorite: (track: Track) => boolean;
}> = ({
  tracks,
  onPlay,
  onQueue,
  onPlaylist,
  onArtist,
  onFavorite,
  isFavorite,
}) => (
  <div className="cx-track-list" role="list">
    {tracks.map((track, index) => (
      <div
        className="cx-track-row"
        role="listitem"
        key={`${track.source.provider}:${track.source.id}:${index}`}
      >
        <button
          className="cx-track-play"
          onClick={() => onPlay(track)}
          aria-label={`Play ${track.title}`}
        >
          <span>{String(index + 1).padStart(2, '0')}</span>
          <Play size={14} fill="currentColor" />
        </button>
        <div className="cx-track-art">
          <Artwork
            item={track}
            alt={`Album cover for ${track.album?.title ?? track.title}`}
            index={String(index + 1).padStart(2, '0')}
          />
        </div>
        <div className="cx-track-primary">
          <b>{track.title}</b>
          <TrackArtistLinks track={track} onSelect={onArtist} />
        </div>
        <div className="cx-track-album">{track.album?.title ?? 'Single'}</div>
        <div className="cx-track-source">{track.source.provider}</div>
        <time>{durationLabel(track.durationMs)}</time>
        <button
          className={isFavorite(track) ? 'is-owned' : undefined}
          onClick={() => onFavorite(track)}
          aria-label={
            isFavorite(track) ? 'Remove from library' : 'Add to library'
          }
        >
          <Heart size={16} fill={isFavorite(track) ? 'currentColor' : 'none'} />
        </button>
        <button
          onClick={() => onQueue(track)}
          aria-label={`Add ${track.title} to queue`}
        >
          <Plus size={17} />
        </button>
        <button
          onClick={() => onPlaylist(track)}
          aria-label={`Add ${track.title} to playlist`}
        >
          <ListPlus size={17} />
        </button>
      </div>
    ))}
  </div>
);

const TrackCarousel: FC<{
  tracks: Track[];
  onPlay: (track: Track) => void;
  onQueue: (track: Track) => void;
  onPlaylist: (track: Track) => void;
  onArtist: (selection: TrackArtistSelection) => void;
  onFavorite: (track: Track) => void;
  isFavorite: (track: Track) => boolean;
}> = ({
  tracks,
  onPlay,
  onQueue,
  onPlaylist,
  onArtist,
  onFavorite,
  isFavorite,
}) => {
  const [selected, setSelected] = useState(0);
  const [recognized, setRecognized] = useState<number | null>(null);
  const wheelLock = useRef(false);
  const recognitionTimer = useRef<number | null>(null);
  const recognitionFrame = useRef<number | null>(null);
  const recognitionAudio = useRef<AudioContext | null>(null);
  const safeSelected = Math.min(selected, Math.max(0, tracks.length - 1));
  const activeTrack = tracks[safeSelected];
  const visibleTracks = useMemo(
    () =>
      tracks
        .map((track, index) => ({ track, index }))
        .filter(
          ({ index }) =>
            Math.abs(index - safeSelected) <= CAROUSEL_VISIBLE_RADIUS,
        ),
    [safeSelected, tracks],
  );

  useEffect(() => {
    if (selected !== safeSelected) {
      setSelected(safeSelected);
    }
  }, [safeSelected, selected]);

  useEffect(
    () => () => {
      if (recognitionTimer.current !== null) {
        window.clearTimeout(recognitionTimer.current);
      }
      if (recognitionFrame.current !== null) {
        window.cancelAnimationFrame(recognitionFrame.current);
      }
      void recognitionAudio.current?.close();
    },
    [],
  );

  const playRecognitionCue = (kind: 'select' | 'confirm') => {
    const AudioContextClass =
      window.AudioContext ??
      (
        window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }

    const context = recognitionAudio.current ?? new AudioContextClass();
    recognitionAudio.current = context;
    const primary = context.createOscillator();
    const crystal = context.createOscillator();
    const primaryGain = context.createGain();
    const crystalGain = context.createGain();
    const now = context.currentTime;
    const duration = kind === 'confirm' ? 0.12 : 0.075;

    primary.type = 'sine';
    crystal.type = 'triangle';
    primary.frequency.setValueAtTime(kind === 'confirm' ? 610 : 760, now);
    primary.frequency.exponentialRampToValueAtTime(
      kind === 'confirm' ? 1120 : 930,
      now + duration,
    );
    crystal.frequency.setValueAtTime(kind === 'confirm' ? 1520 : 1380, now);
    crystal.frequency.exponentialRampToValueAtTime(
      kind === 'confirm' ? 1900 : 1580,
      now + duration * 0.72,
    );
    primaryGain.gain.setValueAtTime(kind === 'confirm' ? 0.012 : 0.008, now);
    primaryGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    crystalGain.gain.setValueAtTime(kind === 'confirm' ? 0.0045 : 0.003, now);
    crystalGain.gain.exponentialRampToValueAtTime(
      0.0001,
      now + duration * 0.78,
    );
    primary.connect(primaryGain).connect(context.destination);
    crystal.connect(crystalGain).connect(context.destination);
    primary.start(now);
    crystal.start(now);
    primary.stop(now + duration);
    crystal.stop(now + duration);
  };

  const recognize = (index: number, kind: 'select' | 'confirm') => {
    if (recognitionTimer.current !== null) {
      window.clearTimeout(recognitionTimer.current);
    }
    if (recognitionFrame.current !== null) {
      window.cancelAnimationFrame(recognitionFrame.current);
    }
    setRecognized(null);
    recognitionFrame.current = window.requestAnimationFrame(() => {
      setRecognized(index);
      recognitionTimer.current = window.setTimeout(() => {
        setRecognized(null);
      }, 420);
    });
    playRecognitionCue(kind);
  };

  const move = (direction: -1 | 1) => {
    setSelected((current) =>
      Math.min(Math.max(current + direction, 0), tracks.length - 1),
    );
  };

  const handleKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      move(-1);
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      move(1);
    }
    if (event.key === 'Home') {
      event.preventDefault();
      setSelected(0);
    }
    if (event.key === 'End') {
      event.preventDefault();
      setSelected(tracks.length - 1);
    }
    if ((event.key === 'Enter' || event.key === ' ') && activeTrack) {
      event.preventDefault();
      onPlay(activeTrack);
    }
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (wheelLock.current) {
      return;
    }
    const movement =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
    if (Math.abs(movement) < 8) {
      return;
    }
    wheelLock.current = true;
    move(movement > 0 ? 1 : -1);
    window.setTimeout(() => {
      wheelLock.current = false;
    }, 120);
  };

  if (!activeTrack) {
    return null;
  }

  return (
    <section
      className="cx-track-carousel"
      aria-label="Song card carousel"
      tabIndex={0}
      onKeyDown={handleKeys}
      onWheel={handleWheel}
    >
      <div className="cx-carousel-vectors" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="cx-carousel-counter">
        <span>Sequence</span>
        <b>{String(safeSelected + 1).padStart(2, '0')}</b>
        <small>/ {String(tracks.length).padStart(2, '0')}</small>
      </div>
      <div className="cx-carousel-jumps">
        <button
          onClick={() => {
            setSelected(0);
            recognize(0, 'select');
          }}
          disabled={safeSelected === 0}
          aria-label="Jump to first song"
        >
          <ChevronsLeft size={14} />
          Start
        </button>
        <button
          onClick={() => {
            const lastIndex = tracks.length - 1;
            setSelected(lastIndex);
            recognize(lastIndex, 'select');
          }}
          disabled={safeSelected === tracks.length - 1}
          aria-label="Jump to end of playlist"
        >
          End
          <ChevronsRight size={14} />
        </button>
      </div>
      <button
        className="cx-carousel-arrow cx-carousel-arrow-left"
        onClick={() => move(-1)}
        disabled={safeSelected === 0}
        aria-label="Previous song card"
      >
        <ChevronLeft size={24} />
      </button>
      <div className="cx-carousel-stage">
        {visibleTracks.map(({ track, index }) => {
          const offset = index - safeSelected;
          const style = {
            '--cx-card-offset': offset,
            '--cx-card-distance': Math.abs(offset),
            '--cx-card-rotation': `${offset * -7}deg`,
          } as CSSProperties;
          return (
            <button
              className={`cx-song-card ${offset === 0 ? 'is-selected' : ''} ${recognized === index ? 'is-recognized' : ''}`}
              key={`${track.source.provider}:${track.source.id}:${index}`}
              style={style}
              data-interface-sound="custom"
              onClick={() => {
                if (offset === 0) {
                  recognize(index, 'confirm');
                  onPlay(track);
                } else {
                  recognize(index, 'select');
                  setSelected(index);
                }
              }}
              aria-label={
                offset === 0 ? `Play ${track.title}` : `Select ${track.title}`
              }
              aria-current={offset === 0 ? 'true' : undefined}
            >
              <span className="cx-song-card-art">
                <Artwork
                  item={track}
                  alt={`Album cover for ${track.album?.title ?? track.title}`}
                  index={String(index + 1).padStart(2, '0')}
                />
              </span>
              <span className="cx-song-card-glass" />
              <span className="cx-song-card-index">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="cx-song-card-copy">
                <b>{track.title}</b>
                <small>{formatArtistNames(track.artists)}</small>
              </span>
            </button>
          );
        })}
      </div>
      <button
        className="cx-carousel-arrow cx-carousel-arrow-right"
        onClick={() => move(1)}
        disabled={safeSelected === tracks.length - 1}
        aria-label="Next song card"
      >
        <ChevronRight size={24} />
      </button>
      <div className="cx-carousel-readout" aria-live="polite">
        <span>
          <small>Selected recording</small>
          <b>{activeTrack.title}</b>
          <TrackArtistLinks
            className="cx-carousel-artist-links"
            track={activeTrack}
            onSelect={onArtist}
          />
        </span>
        <span>
          <small>Release</small>
          <b>{activeTrack.album?.title ?? 'Single'}</b>
          <em>{durationLabel(activeTrack.durationMs)}</em>
        </span>
        <div className="cx-carousel-actions">
          <button onClick={() => onPlay(activeTrack)}>
            <Play size={16} fill="currentColor" />
            Play
          </button>
          <button onClick={() => onQueue(activeTrack)}>
            <Plus size={17} />
            Queue
          </button>
          <button onClick={() => onPlaylist(activeTrack)}>
            <ListPlus size={16} />
            Playlist
          </button>
          <button
            className={isFavorite(activeTrack) ? 'is-owned' : undefined}
            onClick={() => onFavorite(activeTrack)}
            aria-label={
              isFavorite(activeTrack)
                ? 'Remove selected song from library'
                : 'Add selected song to library'
            }
          >
            <Heart
              size={16}
              fill={isFavorite(activeTrack) ? 'currentColor' : 'none'}
            />
            Keep
          </button>
        </div>
      </div>
      <div className="cx-carousel-hint">
        <span>Mouse wheel</span>
        <span>Arrow keys</span>
        <span>Enter to play</span>
      </div>
    </section>
  );
};

const PlaylistPicker: FC<{
  track: Track;
  playlists: PlaylistIndexEntry[];
  onClose: () => void;
  onSelect: (playlistId: string) => Promise<boolean>;
  onCreate: (name: string) => Promise<boolean>;
}> = ({ track, playlists, onClose, onSelect, onCreate }) => {
  const [newName, setNewName] = useState('');
  const [pending, setPending] = useState<string | null>(null);

  const selectPlaylist = async (playlistId: string) => {
    setPending(playlistId);
    try {
      await onSelect(playlistId);
    } finally {
      setPending(null);
    }
  };

  const createAndAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) {
      return;
    }
    setPending('new');
    try {
      await onCreate(name);
    } finally {
      setPending(null);
    }
  };

  return (
    <div
      className="cx-playlist-picker-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className="cx-playlist-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cx-playlist-picker-title"
      >
        <header className="cx-playlist-picker-head">
          <div>
            <span>Archive / Route recording</span>
            <h2 id="cx-playlist-picker-title">Add to playlist</h2>
            <p>
              <b>{track.title}</b>
              <small>{formatArtistNames(track.artists)}</small>
            </p>
          </div>
          <button onClick={onClose} aria-label="Close playlist picker">
            <X size={18} />
          </button>
        </header>
        <div className="cx-playlist-picker-body">
          {playlists.length > 0 ? (
            <div className="cx-playlist-picker-list">
              {playlists.map((playlist, index) => (
                <button
                  key={playlist.id}
                  disabled={pending !== null}
                  onClick={() => void selectPlaylist(playlist.id)}
                  aria-label={`Add ${track.title} to ${playlist.name}`}
                >
                  <span className="cx-playlist-picker-index">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <PlaylistArtwork playlist={playlist} index={index} />
                  <span>
                    <b>{playlist.name}</b>
                    <small>
                      {playlist.itemCount} recordings /{' '}
                      {durationLabel(playlist.totalDurationMs)}
                    </small>
                  </span>
                  {pending === playlist.id ? (
                    <LoaderCircle className="cx-spin" size={17} />
                  ) : (
                    <ChevronRight size={17} />
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="cx-playlist-picker-empty">
              <ListMusic size={28} />
              <b>No playlists yet</b>
              <span>
                Create one below and this recording will be added to it.
              </span>
            </div>
          )}
        </div>
        <form className="cx-playlist-picker-create" onSubmit={createAndAdd}>
          <label htmlFor="cx-new-playlist-name">New playlist</label>
          <div>
            <input
              id="cx-new-playlist-name"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Playlist name"
              maxLength={80}
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={!newName.trim() || pending !== null}
            >
              {pending === 'new' ? (
                <LoaderCircle className="cx-spin" size={16} />
              ) : (
                <Plus size={16} />
              )}
              Create and add
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};

const CardRail: FC<{
  title: string;
  source: string;
  items: MediaRef[];
  onSelect: (item: MediaRef) => void;
  onKeep?: (item: MediaRef) => void;
  isKept?: (item: MediaRef) => boolean;
}> = ({ title, source, items, onSelect, onKeep, isKept }) => (
  <section className="cx-content-section">
    <div className="cx-section-heading">
      <div>
        <span>Source / {source}</span>
        <h2>{title}</h2>
      </div>
      <span className="cx-section-count">
        {String(items.length).padStart(2, '0')}
      </span>
    </div>
    <div className="cx-card-rail">
      {items.slice(0, 6).map((item, index) => {
        const label = mediaLabel(item);
        const sub = mediaSubtitle(item, source);
        const kept = isKept?.(item) ?? false;
        return (
          <article
            className="cx-media-card"
            key={`${item.source.provider}:${item.source.id}`}
          >
            <button
              className="cx-media-card-open"
              onClick={() => onSelect(item)}
              aria-label={`Open ${label}`}
            >
              <span className="cx-media-art">
                <Artwork
                  item={item}
                  alt={`Artwork for ${label}`}
                  index={String(index + 1).padStart(2, '0')}
                />
                <span className="cx-card-play">
                  <Search size={18} />
                </span>
              </span>
              <b>{label}</b>
              <small>{sub}</small>
            </button>
            {onKeep && (
              <button
                className={`cx-media-card-keep ${kept ? 'is-owned' : ''}`}
                onClick={() => onKeep(item)}
                aria-label={
                  kept ? `Remove ${label} from library` : `Keep ${label}`
                }
                title={kept ? 'Remove from Library' : 'Keep in Library'}
              >
                <Heart size={15} fill={kept ? 'currentColor' : 'none'} />
              </button>
            )}
          </article>
        );
      })}
    </div>
  </section>
);

const CrystalDeck: FC<{
  title: string;
  source: string;
  items: MediaRef[];
  onSelect: (item: MediaRef) => void;
}> = ({ title, source, items, onSelect }) => {
  const visibleItems = items.slice(0, 5);
  const [selected, setSelected] = useState(
    Math.min(3, visibleItems.length - 1),
  );
  const selectedItem = visibleItems[selected] ?? visibleItems[0];

  return (
    <section className="cx-crystal-deck" aria-label={title}>
      <div className="cx-deck-filament" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="cx-deck-cards">
        {visibleItems.map((item, index) => {
          const label = mediaLabel(item);
          return (
            <button
              key={`${item.source.provider}:${item.source.id}`}
              className={selected === index ? 'is-selected' : undefined}
              aria-pressed={selected === index}
              aria-label={
                selected === index ? `Search for ${label}` : `Select ${label}`
              }
              onClick={() => {
                if (selected === index) {
                  onSelect(item);
                } else {
                  setSelected(index);
                }
              }}
            >
              <Artwork
                item={item}
                alt={`Artwork for ${label}`}
                index={String(index + 1).padStart(2, '0')}
              />
              <span className="cx-deck-card-shade" />
              <span className="cx-deck-card-index">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="cx-deck-card-copy">
                <b>{label}</b>
                <small>{mediaSubtitle(item, source)}</small>
              </span>
            </button>
          );
        })}
      </div>
      <div className="cx-deck-status">
        <span>
          <small>Index</small>
          <b>{title}</b>
        </span>
        <span>
          <small>Selected</small>
          <b>{selectedItem ? mediaLabel(selectedItem) : '—'}</b>
        </span>
        <span>
          <small>Source</small>
          <b>{source}</b>
        </span>
      </div>
    </section>
  );
};

const HomeView: FC<{
  onOpenSources: () => void;
  onExploreMedia: (item: MediaRef) => void;
  onPlay: (track: Track) => void;
  onQueue: (track: Track) => void;
  onPlaylist: (track: Track) => void;
  onArtist: (selection: TrackArtistSelection) => void;
  onFavorite: (track: Track) => void;
  isFavorite: (track: Track) => boolean;
}> = ({
  onOpenSources,
  onExploreMedia,
  onPlay,
  onQueue,
  onPlaylist,
  onArtist,
  onFavorite,
  isFavorite,
}) => {
  const dashboardProviders = useProviders('dashboard');
  const playlists = usePlaylistStore((state) => state.index);
  const favorites = useFavoritesStore((state) => state.tracks);
  const enabled = dashboardProviders.length > 0;
  const { data, isLoading } = useQuery({
    queryKey: [
      'creaux-home',
      dashboardProviders.map((provider) => provider.id),
    ],
    enabled,
    queryFn: async () => {
      const [tracks, albums, editorial, releases] = await Promise.all([
        dashboardHost.fetchTopTracks(),
        dashboardHost.fetchTopAlbums(),
        dashboardHost.fetchEditorialPlaylists(),
        dashboardHost.fetchNewReleases(),
      ]);
      return { tracks, albums, editorial, releases };
    },
  });
  const topTracks = data?.tracks.flatMap((group) => group.items) ?? [];
  const topAlbums = data?.albums.flatMap((group) => group.items) ?? [];
  const editorial = data?.editorial.flatMap((group) => group.items) ?? [];
  const releases = data?.releases.flatMap((group) => group.items) ?? [];
  const hasRealContent =
    favorites.length > 0 ||
    playlists.length > 0 ||
    topTracks.length > 0 ||
    topAlbums.length > 0 ||
    editorial.length > 0 ||
    releases.length > 0;

  return (
    <div className="cx-page">
      <PageHeading
        index="01"
        eyebrow="Return / Continue"
        title="Home"
        detail="Your listening state, kept without a feed."
      />
      {isLoading && (
        <div className="cx-loading">
          <LoaderCircle size={24} />
          <span>Reading connected sources</span>
        </div>
      )}
      {!isLoading && !hasRealContent && (
        <EmptyState
          icon={Orbit}
          title="The field is clear"
          text="Connect providers or keep music in your library. Creaux2 does not manufacture playlists to fill this page."
          action="Configure sources"
          onAction={onOpenSources}
        />
      )}
      {topAlbums.length > 0 && (
        <CrystalDeck
          title="Album Index"
          source={data?.albums[0]?.providerName ?? 'Dashboard'}
          items={topAlbums}
          onSelect={onExploreMedia}
        />
      )}
      {topAlbums.length === 0 && releases.length > 0 && (
        <CrystalDeck
          title="Release Index"
          source={data?.releases[0]?.providerName ?? 'Dashboard'}
          items={releases}
          onSelect={onExploreMedia}
        />
      )}
      {favorites.length > 0 && (
        <section className="cx-content-section">
          <div className="cx-section-heading">
            <div>
              <span>Archive / Kept</span>
              <h2>Recently added to Library</h2>
            </div>
          </div>
          <TrackList
            tracks={favorites.slice(0, 8).map((entry) => entry.ref)}
            onPlay={onPlay}
            onQueue={onQueue}
            onPlaylist={onPlaylist}
            onArtist={onArtist}
            onFavorite={onFavorite}
            isFavorite={isFavorite}
          />
        </section>
      )}
      {topTracks.length > 0 && (
        <section className="cx-content-section">
          <div className="cx-section-heading">
            <div>
              <span>Source / {data?.tracks[0]?.providerName}</span>
              <h2>From your connected source</h2>
            </div>
          </div>
          <TrackList
            tracks={topTracks.slice(0, 8)}
            onPlay={onPlay}
            onQueue={onQueue}
            onPlaylist={onPlaylist}
            onArtist={onArtist}
            onFavorite={onFavorite}
            isFavorite={isFavorite}
          />
        </section>
      )}
      {releases.length > 0 && (
        <CardRail
          title="New releases"
          source={data?.releases[0]?.providerName ?? 'Dashboard'}
          items={releases}
          onSelect={onExploreMedia}
        />
      )}
      {editorial.length > 0 && (
        <CardRail
          title="Editorial paths"
          source={data?.editorial[0]?.providerName ?? 'Dashboard'}
          items={editorial}
          onSelect={onExploreMedia}
        />
      )}
    </div>
  );
};

const SearchView: FC<{
  query: string;
  submittedQuery: string;
  artistContext: TrackArtistSelection | null;
  onOpenSources: () => void;
  onExploreMedia: (item: MediaRef) => void;
  onPlay: (track: Track) => void;
  onQueue: (track: Track) => void;
  onPlaylist: (track: Track) => void;
  onArtist: (selection: TrackArtistSelection) => void;
  onFavorite: (track: Track) => void;
  isFavorite: (track: Track) => boolean;
  onKeepMedia: (item: MediaRef) => void;
  isMediaKept: (item: MediaRef) => boolean;
}> = ({
  query,
  submittedQuery,
  artistContext,
  onOpenSources,
  onExploreMedia,
  onPlay,
  onQueue,
  onPlaylist,
  onArtist,
  onFavorite,
  isFavorite,
  onKeepMedia,
  isMediaKept,
}) => {
  const metadataProviders = useProviders('metadata');
  const activeId = useProvidersStore((state) => state.active.metadata);
  const activeProvider = metadataProviders.find((item) => item.id === activeId);
  const artistProvider = artistContext?.artist.source
    ? metadataProviders.find(
        (item) => item.id === artistContext.artist.source?.provider,
      )
    : undefined;
  const trackProvider = artistContext
    ? metadataProviders.find(
        (item) => item.id === artistContext.track.source.provider,
      )
    : undefined;
  const provider = artistProvider ?? trackProvider ?? activeProvider;
  const { data, isFetching, isError, refetch } = useQuery<SearchResults>({
    queryKey: [
      'creaux-search',
      provider?.id,
      submittedQuery,
      artistContext?.artist.source?.id,
    ],
    queryFn: () =>
      metadataHost.search({ query: submittedQuery, limit: 30 }, provider?.id),
    enabled: Boolean(provider && submittedQuery),
  });
  const contextDescription = artistContext
    ? `${artistCreditContext(artistContext.artist)} on “${artistContext.track.title}”. ${
        artistProvider
          ? `Using the linked ${artistProvider.name} artist identity.`
          : trackProvider
            ? `Using the recording's ${trackProvider.name} metadata context; the credit did not expose a direct artist identity.`
            : `Using ${provider?.name ?? 'the active metadata source'}; the original credit did not expose an installed provider identity.`
      }`
    : provider
      ? `Results are supplied by ${provider.name}.`
      : 'Choose a metadata provider before searching.';

  return (
    <div className="cx-page">
      <PageHeading
        index="02"
        eyebrow="Resolve / Compare"
        title={
          artistContext
            ? `Artist: ${artistContext.artist.name}`
            : submittedQuery
              ? `Search: ${submittedQuery}`
              : 'Search'
        }
        detail={contextDescription}
      />
      {!provider && (
        <EmptyState
          icon={Search}
          title="No metadata source"
          text="Install and select a metadata provider. Search results will remain attributable to that source."
          action="Configure sources"
          onAction={onOpenSources}
        />
      )}
      {provider && !submittedQuery && (
        <EmptyState
          icon={Search}
          title="Name what you are looking for"
          text="Search tracks, releases, artists, and playlists. Press Ctrl K from anywhere."
        />
      )}
      {isFetching && (
        <div className="cx-loading">
          <LoaderCircle size={24} />
          <span>{`Searching ${provider?.name ?? 'source'} for “${query}”`}</span>
        </div>
      )}
      {isError && (
        <div className="cx-error">
          <b>{provider?.name} could not complete the search.</b>
          <span>Your queue and library are unchanged.</span>
          <button onClick={() => void refetch()}>Retry</button>
        </div>
      )}
      {data?.tracks && data.tracks.length > 0 && (
        <section className="cx-content-section">
          <div className="cx-section-heading">
            <div>
              <span>Matches / Tracks</span>
              <h2>{data.tracks.length} recordings</h2>
            </div>
          </div>
          <TrackList
            tracks={data.tracks}
            onPlay={onPlay}
            onQueue={onQueue}
            onPlaylist={onPlaylist}
            onArtist={onArtist}
            onFavorite={onFavorite}
            isFavorite={isFavorite}
          />
        </section>
      )}
      {data?.albums && data.albums.length > 0 && (
        <CardRail
          title="Releases"
          source={provider?.name ?? 'Metadata'}
          items={data.albums}
          onSelect={onExploreMedia}
          onKeep={onKeepMedia}
          isKept={isMediaKept}
        />
      )}
      {data?.artists && data.artists.length > 0 && (
        <CardRail
          title="Artists"
          source={provider?.name ?? 'Metadata'}
          items={data.artists}
          onSelect={onExploreMedia}
          onKeep={onKeepMedia}
          isKept={isMediaKept}
        />
      )}
      {data?.playlists && data.playlists.length > 0 && (
        <CardRail
          title="Playlists"
          source={provider?.name ?? 'Metadata'}
          items={data.playlists}
          onSelect={onExploreMedia}
        />
      )}
      {submittedQuery &&
        !isFetching &&
        data &&
        !data.tracks?.length &&
        !data.albums?.length &&
        !data.artists?.length &&
        !data.playlists?.length && (
          <EmptyState
            icon={Search}
            title={`No matches from ${provider?.name}`}
            text="Try a different spelling or choose another metadata source. Other providers were not queried silently."
          />
        )}
    </div>
  );
};

const LibraryView: FC<{
  onPlay: (track: Track) => void;
  onQueue: (track: Track) => void;
  onPlaylist: (track: Track) => void;
  onArtist: (selection: TrackArtistSelection) => void;
  onFavorite: (track: Track) => void;
  isFavorite: (track: Track) => boolean;
  trackPresentation: TrackPresentation;
  onOpenSettings: () => void;
}> = ({
  onPlay,
  onQueue,
  onPlaylist,
  onArtist,
  onFavorite,
  isFavorite,
  trackPresentation,
  onOpenSettings,
}) => {
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(
    null,
  );
  const [artworkTargetId, setArtworkTargetId] = useState<string | null>(null);
  const [artworkError, setArtworkError] = useState<string | null>(null);
  const artworkInput = useRef<HTMLInputElement>(null);
  const playlists = usePlaylistStore((state) => state.index);
  const selectedPlaylist = usePlaylistStore((state) =>
    selectedPlaylistId ? state.playlists.get(selectedPlaylistId) : undefined,
  );
  const loadPlaylist = usePlaylistStore((state) => state.loadPlaylist);
  const updatePlaylist = usePlaylistStore((state) => state.updatePlaylist);
  useEffect(() => {
    if (selectedPlaylistId) {
      void loadPlaylist(selectedPlaylistId);
    }
  }, [loadPlaylist, selectedPlaylistId]);

  const requestArtwork = (playlistId: string) => {
    setArtworkError(null);
    setArtworkTargetId(playlistId);
    artworkInput.current?.click();
  };

  const changeArtwork = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !artworkTargetId) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      setArtworkError('Choose a PNG, JPEG, WebP, or other image file.');
      return;
    }
    try {
      const url = await resizePlaylistArtwork(file);
      await updatePlaylist(artworkTargetId, {
        artwork: {
          items: [
            {
              url,
              width: PLAYLIST_ARTWORK_SIZE,
              height: PLAYLIST_ARTWORK_SIZE,
              purpose: 'cover',
            },
          ],
        },
      });
      setArtworkTargetId(null);
    } catch (error) {
      setArtworkError(
        error instanceof Error ? error.message : 'Artwork could not be saved.',
      );
    }
  };

  const resetArtwork = async (playlistId: string) => {
    setArtworkError(null);
    await updatePlaylist(playlistId, { artwork: undefined });
  };

  if (selectedPlaylistId) {
    const playlistIndex = playlists.find(
      (playlist) => playlist.id === selectedPlaylistId,
    );
    return (
      <div className="cx-page cx-playlist-detail">
        <button
          className="cx-library-back"
          onClick={() => setSelectedPlaylistId(null)}
        >
          <ArrowLeft size={17} />
          Playlist index
        </button>
        {playlistIndex && (
          <div className="cx-playlist-hero">
            <div className="cx-playlist-hero-art">
              <PlaylistArtwork
                playlist={playlistIndex}
                index={playlists.indexOf(playlistIndex)}
              />
              <button
                onClick={() => requestArtwork(playlistIndex.id)}
                aria-label={`Change artwork for ${playlistIndex.name}`}
              >
                <ImagePlus size={17} />
                Change artwork
              </button>
            </div>
            <div className="cx-playlist-hero-copy">
              <span>Archive / Playlist</span>
              <h1>{playlistIndex.name}</h1>
              <p>
                {playlistIndex.itemCount} recordings /{' '}
                {durationLabel(playlistIndex.totalDurationMs)}
              </p>
              <div className="cx-playlist-hero-actions">
                {playlistIndex.artwork && (
                  <button onClick={() => void resetArtwork(playlistIndex.id)}>
                    <Undo2 size={16} />
                    Use track mosaic
                  </button>
                )}
                <button onClick={onOpenSettings}>
                  {trackPresentation === 'carousel' ? (
                    <GalleryHorizontalEnd size={16} />
                  ) : (
                    <LayoutList size={16} />
                  )}
                  {trackPresentation === 'carousel'
                    ? 'Card carousel'
                    : 'Precision list'}
                </button>
              </div>
            </div>
            <div className="cx-playlist-hero-index">
              {String(playlists.indexOf(playlistIndex) + 1).padStart(2, '0')}
            </div>
          </div>
        )}
        {!selectedPlaylist && (
          <div className="cx-loading">
            <LoaderCircle size={22} />
            Loading playlist
          </div>
        )}
        {selectedPlaylist && selectedPlaylist.items.length > 0 && (
          <>
            <div className="cx-playlist-sequence-head">
              <div>
                <span>
                  Display /{' '}
                  {trackPresentation === 'carousel'
                    ? 'Card carousel'
                    : 'Precision list'}
                </span>
                <h2>Song sequence</h2>
              </div>
              <button onClick={onOpenSettings}>Change in System</button>
            </div>
            {trackPresentation === 'carousel' ? (
              <TrackCarousel
                tracks={selectedPlaylist.items.map((item) => item.track)}
                onPlay={onPlay}
                onQueue={onQueue}
                onPlaylist={onPlaylist}
                onArtist={onArtist}
                onFavorite={onFavorite}
                isFavorite={isFavorite}
              />
            ) : (
              <TrackList
                tracks={selectedPlaylist.items.map((item) => item.track)}
                onPlay={onPlay}
                onQueue={onQueue}
                onPlaylist={onPlaylist}
                onArtist={onArtist}
                onFavorite={onFavorite}
                isFavorite={isFavorite}
              />
            )}
          </>
        )}
        {selectedPlaylist && selectedPlaylist.items.length === 0 && (
          <EmptyState
            icon={ListMusic}
            title="This playlist is empty"
            text="Add recordings from Search or the queue to begin its sequence."
          />
        )}
        {artworkError && (
          <div className="cx-artwork-error" role="alert">
            {artworkError}
          </div>
        )}
        <input
          ref={artworkInput}
          className="cx-visually-hidden"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
          onChange={(event) => void changeArtwork(event)}
          tabIndex={-1}
        />
      </div>
    );
  }

  return (
    <div className="cx-page">
      <PageHeading
        index="03"
        eyebrow="Archive / Ownership"
        title="Library"
        detail="Your playlists remain entirely under your control."
      />
      <div className="cx-tabs" role="tablist">
        <button role="tab" aria-selected={true} className="is-active">
          Playlists
          <span>{playlists.length}</span>
        </button>
      </div>
      {playlists.length > 0 && (
        <div className="cx-playlist-gallery">
          {playlists.map((playlist, index) => (
            <article className="cx-playlist-card" key={playlist.id}>
              <button
                className="cx-playlist-open"
                onClick={() => setSelectedPlaylistId(playlist.id)}
              >
                <span className="cx-playlist-card-art">
                  <PlaylistArtwork playlist={playlist} index={index} />
                  <span className="cx-playlist-card-sheen" />
                  <span className="cx-playlist-card-number">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                </span>
                <span className="cx-playlist-card-copy">
                  <b>{playlist.name}</b>
                  <small>
                    {playlist.itemCount} recordings /{' '}
                    {durationLabel(playlist.totalDurationMs)}
                  </small>
                </span>
                <ChevronRight size={17} />
              </button>
              <button
                className="cx-playlist-artwork-action"
                onClick={() => requestArtwork(playlist.id)}
                aria-label={`Change artwork for ${playlist.name}`}
              >
                <ImagePlus size={16} />
                Change image
              </button>
              {playlist.artwork && (
                <button
                  className="cx-playlist-artwork-reset"
                  onClick={() => void resetArtwork(playlist.id)}
                  aria-label={`Restore track mosaic for ${playlist.name}`}
                >
                  <Undo2 size={15} />
                </button>
              )}
            </article>
          ))}
        </div>
      )}
      {playlists.length === 0 && (
        <EmptyState
          icon={LibraryBig}
          title="No playlists"
          text="Create or import a playlist to begin. Nothing is generated to make the library look occupied."
        />
      )}
      {artworkError && (
        <div className="cx-artwork-error" role="alert">
          {artworkError}
        </div>
      )}
      <input
        ref={artworkInput}
        className="cx-visually-hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        onChange={(event) => void changeArtwork(event)}
        tabIndex={-1}
      />
    </div>
  );
};

const NowPlayingView: FC<{
  onArtist: (selection: TrackArtistSelection) => void;
}> = ({ onArtist }) => {
  const queue = useQueueStore();
  const sound = useSoundStore();
  const item = queue.getCurrentItem();
  if (!item) {
    return (
      <div className="cx-page">
        <PageHeading
          index="04"
          eyebrow="Playback / Focus"
          title="Now Playing"
          detail="The listening chamber is waiting."
        />
        <EmptyState
          icon={Disc3}
          title="Nothing is playing"
          text="Choose a recording from Search, Home, or Library. Playback will remain active while you navigate."
        />
      </div>
    );
  }
  return (
    <div className="cx-page cx-now-page">
      <PageHeading
        index="04"
        eyebrow={`Playback / ${item.status ?? 'Ready'}`}
        title="Now Playing"
        detail={`Resolved from ${item.track.source.provider}.`}
      />
      <div className="cx-now-stage">
        <div className="cx-now-field" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="cx-now-art">
          <Artwork
            item={item.track}
            alt={`Album cover for ${item.track.album?.title ?? item.track.title}`}
          />
          <div className="cx-now-orbit" />
        </div>
        <div className="cx-now-meta">
          <span>{item.track.album?.title ?? 'Single'}</span>
          <h2>{item.track.title}</h2>
          <h3>
            <TrackArtistLinks track={item.track} onSelect={onArtist} />
          </h3>
          <div className="cx-now-facts">
            <span>
              <small>Artist</small>
              <b>
                <TrackArtistLinks track={item.track} onSelect={onArtist} />
              </b>
            </span>
            <span>
              <small>Release</small>
              <b>{item.track.album?.title ?? 'Single'}</b>
            </span>
            <span>
              <small>Duration</small>
              <b>{durationLabel(item.track.durationMs)}</b>
            </span>
            <span>
              <small>Source</small>
              <b>{item.track.source.provider}</b>
            </span>
          </div>
          <div className="cx-now-status">
            <b>
              {item.status === 'loading' ? 'Finding source…' : sound.status}
            </b>
            <span>{item.track.source.provider}</span>
          </div>
          <div className="cx-now-progress">
            <span
              style={{
                width: `${sound.duration ? (sound.seek / sound.duration) * 100 : 0}%`,
              }}
            />
          </div>
          <div className="cx-now-times">
            <time>{secondsLabel(sound.seek)}</time>
            <time>{secondsLabel(sound.duration)}</time>
          </div>
        </div>
      </div>
    </div>
  );
};

const QueuePanel: FC<{ onClose: () => void }> = ({ onClose }) => {
  const queue = useQueueStore();
  return (
    <aside className="cx-context-panel" aria-label="Queue">
      <div className="cx-context-head">
        <div>
          <span>Authored timeline</span>
          <h2>Queue</h2>
        </div>
        <button onClick={onClose} aria-label="Close queue">
          <X size={18} />
        </button>
      </div>
      {queue.items.length === 0 ? (
        <EmptyState
          icon={ListMusic}
          title="Queue is empty"
          text="Add music without replacing what is already playing."
        />
      ) : (
        <div className="cx-queue-items">
          {queue.items.map((item, index) => (
            <button
              key={item.id}
              className={
                index === queue.currentIndex ? 'is-current' : undefined
              }
              onClick={() => queue.goToIndex(index)}
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div>
                <b>{item.track.title}</b>
                <small>{formatArtistNames(item.track.artists)}</small>
              </div>
              <time>{durationLabel(item.track.durationMs)}</time>
            </button>
          ))}
        </div>
      )}
      {queue.items.length > 0 && (
        <button className="cx-clear-queue" onClick={queue.clearQueue}>
          Clear queue
        </button>
      )}
    </aside>
  );
};

const PlayerDock: FC<{ onExpand: () => void }> = ({ onExpand }) => {
  const queue = useQueueStore();
  const sound = useSoundStore();
  const visualizationLevels = useAudioVisualizerStore((state) => state.levels);
  const [waveformReactivity] = useCoreSetting<number>(
    'appearance.waveformReactivity',
  );
  const [waveformSegments] = useCoreSetting<number>(
    'appearance.waveformSegments',
  );
  const [volume, setVolume] = useCoreSetting<number>('playback.volume');
  const [muted, setMuted] = useCoreSetting<boolean>('playback.muted');
  const [repeatMode, setRepeatMode] =
    useCoreSetting<RepeatMode>('playback.repeat');
  const item = queue.getCurrentItem();
  const progress = sound.duration ? (sound.seek / sound.duration) * 100 : 0;
  const volumePercent = Math.round((volume ?? 1) * 100);
  const audibleVolumePercent = muted ? 0 : volumePercent;
  const activeRepeatMode = repeatMode ?? 'off';
  const repeatLabel =
    activeRepeatMode === 'all'
      ? 'Loop queue infinitely'
      : activeRepeatMode === 'one'
        ? 'Loop current song infinitely'
        : 'Loop off';
  const nextRepeatLabel =
    activeRepeatMode === 'off'
      ? 'Enable infinite queue loop'
      : activeRepeatMode === 'all'
        ? 'Enable infinite current-song loop'
        : 'Turn looping off';
  const renderedVisualizationLevels = useMemo(
    () =>
      selectWaveformSegments(visualizationLevels, waveformSegments).map(
        (level) => applyWaveformReactivity(level, waveformReactivity),
      ),
    [visualizationLevels, waveformReactivity, waveformSegments],
  );
  const toggle = () => {
    if (sound.status === 'playing') {
      sound.pause();
    } else {
      sound.play();
    }
  };
  const cycleRepeatMode = () => {
    const nextMode: RepeatMode =
      activeRepeatMode === 'off'
        ? 'all'
        : activeRepeatMode === 'all'
          ? 'one'
          : 'off';
    setRepeatMode(nextMode);
  };
  return (
    <footer className="cx-player">
      <button className="cx-player-track" onClick={onExpand}>
        <div className="cx-player-art">
          {item ? (
            <Artwork item={item.track} alt="" />
          ) : (
            <CatalogPlate index="—" />
          )}
        </div>
        <div>
          <b>{item?.track.title ?? 'No track selected'}</b>
          <span>
            {item ? formatArtistNames(item.track.artists) : 'Creaux2 is ready'}
          </span>
        </div>
      </button>
      <div
        className={`cx-player-waveform ${
          sound.status === 'playing' && !sound.transitioning ? 'is-playing' : ''
        }`}
        aria-hidden="true"
      >
        {renderedVisualizationLevels.map((level, index) => (
          <i
            key={index}
            style={
              {
                '--cx-wave-level': level,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div className="cx-transport">
        <button aria-label="Previous" onClick={queue.goToPrevious}>
          <SkipBack size={18} fill="currentColor" />
        </button>
        <button
          className="cx-play-main"
          aria-label={sound.status === 'playing' ? 'Pause' : 'Play'}
          onClick={toggle}
        >
          {sound.status === 'playing' ? (
            <Pause size={20} fill="currentColor" />
          ) : (
            <Play size={20} fill="currentColor" />
          )}
        </button>
        <button aria-label="Next" onClick={queue.goToNext}>
          <SkipForward size={18} fill="currentColor" />
        </button>
        <button
          className={`cx-loop-control ${activeRepeatMode !== 'off' ? 'is-active' : ''}`}
          aria-label={`${repeatLabel}. ${nextRepeatLabel}.`}
          aria-pressed={activeRepeatMode !== 'off'}
          data-loop-mode={activeRepeatMode}
          title={`${repeatLabel} · Click to change`}
          onClick={cycleRepeatMode}
        >
          {activeRepeatMode === 'one' ? (
            <Repeat1 size={18} />
          ) : (
            <Repeat size={18} />
          )}
          <span aria-hidden="true">
            {activeRepeatMode === 'all'
              ? '∞'
              : activeRepeatMode === 'one'
                ? '1'
                : 'Off'}
          </span>
        </button>
      </div>
      <div className="cx-player-progress">
        <time>{secondsLabel(sound.seek)}</time>
        <button
          className="cx-progress-rail"
          aria-label="Seek"
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            sound.seekTo(
              ((event.clientX - box.left) / box.width) * sound.duration,
            );
          }}
        >
          <span style={{ width: `${progress}%` }} />
        </button>
        <time>{secondsLabel(sound.duration)}</time>
      </div>
      <div className="cx-player-volume">
        <button
          aria-label={muted ? 'Unmute' : 'Mute'}
          title={muted ? 'Unmute' : 'Mute'}
          onClick={() => setMuted(!muted)}
        >
          {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
        </button>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={audibleVolumePercent}
          aria-label="Playback volume"
          aria-valuetext={`${audibleVolumePercent}%`}
          style={
            {
              '--cx-volume': `${audibleVolumePercent}%`,
            } as CSSProperties
          }
          onChange={(event) => {
            const nextVolume = Number(event.target.value);
            setVolume(nextVolume / 100);
            if (muted && nextVolume > 0) {
              setMuted(false);
            }
          }}
        />
        <output>{audibleVolumePercent}</output>
      </div>
    </footer>
  );
};

export const CirnoEasterEgg: FC<{
  introduced: boolean;
  onIntroduce: () => void;
  pokeCount?: number;
  onPoke?: (count: number) => void;
  onBossTrigger?: () => void;
  bossResolved?: boolean;
}> = ({
  introduced,
  onIntroduce,
  pokeCount = 0,
  onPoke,
  onBossTrigger,
  bossResolved = false,
}) => {
  const voiceRef = useRef<HTMLAudioElement>(null);
  const dropletRef = useRef<HTMLAudioElement>(null);
  const pokeCountRef = useRef(pokeCount);
  const bossTriggeredRef = useRef(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceDuration, setVoiceDuration] = useState(4);
  const [reaction, setReaction] = useState(0);

  useEffect(() => {
    pokeCountRef.current = Math.max(pokeCountRef.current, pokeCount);
  }, [pokeCount]);

  const interact = async () => {
    if (!introduced) {
      const voice = voiceRef.current;
      if (!voice) {
        return;
      }
      voice.currentTime = 0;
      try {
        await voice.play();
      } catch {
        setSpeaking(false);
      }
      return;
    }

    if (bossTriggeredRef.current && !bossResolved) {
      return;
    }
    pokeCountRef.current += 1;
    const nextPokeCount = pokeCountRef.current;
    onPoke?.(nextPokeCount);
    setReaction((value) => value + 1);
    if (nextPokeCount === 20 && !bossResolved) {
      bossTriggeredRef.current = true;
      onBossTrigger?.();
      return;
    }

    const droplet = dropletRef.current;
    if (droplet) {
      const deepeningStep = Math.min(9, Math.max(0, nextPokeCount - 10));
      droplet.playbackRate = Math.max(0.5, 1 - deepeningStep * 0.055);
      droplet.preservesPitch = false;
      droplet.currentTime = 0;
      try {
        await droplet.play();
      } catch {
        // A blocked effect should not prevent the visual response.
      }
    }
  };

  return (
    <div
      className={`cx-cirno-corner ${speaking ? 'is-speaking' : ''}`}
      data-testid="cirno-easter-egg"
    >
      {speaking && (
        <div
          className="cx-cirno-dialogue"
          role="status"
          aria-live="polite"
          style={
            {
              '--cx-cirno-line-duration': `${Math.max(1, voiceDuration - 0.2)}s`,
            } as CSSProperties
          }
        >
          <span>チルノ</span>
          <p>{CIRNO_DIALOGUE}</p>
        </div>
      )}
      <button
        className="cx-cirno-button"
        type="button"
        data-interface-sound="custom"
        aria-label={introduced ? 'Poke Cirno' : 'Meet the hidden Cirno'}
        onClick={() => void interact()}
      >
        <span
          key={reaction}
          className={`cx-cirno-sprite ${reaction > 0 ? 'is-reacting' : ''}`}
        >
          <img src={CIRNO_FUMO_URL} alt="" draggable={false} />
        </span>
        {reaction > 0 && (
          <i
            key={`pulse-${reaction}`}
            className="cx-cirno-click-pulse"
            aria-hidden="true"
          />
        )}
      </button>
      <audio
        ref={voiceRef}
        data-cirno-audio="introduction"
        src={CIRNO_INTRO_URL}
        preload="auto"
        onLoadedMetadata={(event) => {
          const duration = event.currentTarget.duration;
          if (Number.isFinite(duration) && duration > 0) {
            setVoiceDuration(duration);
          }
        }}
        onPlaying={() => {
          setSpeaking(true);
          onIntroduce();
        }}
        onEnded={() => setSpeaking(false)}
        onError={() => setSpeaking(false)}
      />
      <audio
        ref={dropletRef}
        data-cirno-audio="droplet"
        src={CIRNO_DROPLET_URL}
        preload="auto"
      />
    </div>
  );
};

const SourcesPanel: FC<{
  onClose: () => void;
  trackPresentation: TrackPresentation;
  onTrackPresentation: (presentation: TrackPresentation) => void;
  initialTab: SystemTab;
  cirnoIntroduced: boolean;
  onCirnoIntroduce: () => void;
  cirnoPokeCount: number;
  onCirnoPoke: (count: number) => void;
  onRemiliaTrigger: () => void;
  remiliaResolved: boolean;
}> = ({
  onClose,
  trackPresentation,
  onTrackPresentation,
  initialTab,
  cirnoIntroduced,
  onCirnoIntroduce,
  cirnoPokeCount,
  onCirnoPoke,
  onRemiliaTrigger,
  remiliaResolved,
}) => {
  const [tab, setTab] = useState<SystemTab>(initialTab);
  const [filter, setFilter] = useState('');
  const [exceedVolumeLimit, setExceedVolumeLimit] = useCoreSetting<boolean>(
    'playback.exceedVolumeLimit',
  );
  const [volumeBoost, setVolumeBoost] = useCoreSetting<number>(
    'playback.volumeBoost',
  );
  const [playTitleSequence, setPlayTitleSequence] = useCoreSetting<boolean>(
    'appearance.titleSequence',
  );
  const [waveformReactivity, setWaveformReactivity] = useCoreSetting<number>(
    'appearance.waveformReactivity',
  );
  const [waveformSegments, setWaveformSegments] = useCoreSetting<number>(
    'appearance.waveformSegments',
  );
  const boostPercent = Math.round((volumeBoost ?? 1.25) * 100);
  const safeWaveformReactivity = clampWaveformReactivity(waveformReactivity);
  const waveformReactivityPercent = Math.round(safeWaveformReactivity * 100);
  const safeWaveformSegments = clampWaveformSegments(waveformSegments);
  const active = useProvidersStore((state) => state.active);
  const metadata = useProviders('metadata');
  const streaming = useProviders('streaming');
  const dashboard = useProviders('dashboard');
  const installed = usePluginStore((state) => state.plugins);
  const { data: marketplace, isLoading, isError } = useMarketplacePlugins();
  const { mutate: install, isPending, variables } = useInstallPlugin();
  const groups: Array<{
    kind: ProviderKind;
    label: string;
    providers: ReturnType<typeof useProviders>;
  }> = [
    { kind: 'metadata', label: 'Metadata', providers: metadata },
    { kind: 'streaming', label: 'Streaming', providers: streaming },
    { kind: 'dashboard', label: 'Home feed', providers: dashboard },
  ];
  const relevant = (marketplace ?? []).filter((plugin) => {
    const categories =
      plugin.categories ?? (plugin.category ? [plugin.category] : []);
    return (
      isCreauxPluginSupported(plugin.id) &&
      categories.some((category) =>
        ['metadata', 'streaming', 'dashboard', 'playlists'].includes(category),
      ) &&
      `${plugin.name} ${plugin.description} ${plugin.author}`
        .toLowerCase()
        .includes(filter.toLowerCase())
    );
  });

  return (
    <div className="cx-modal-backdrop" role="presentation">
      <section
        className="cx-system-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Sources and providers"
      >
        <div className="cx-system-head">
          <div>
            <span>
              System /{' '}
              {tab === 'interface' ? 'Interaction layer' : 'Provider layer'}
            </span>
            <h2>{tab === 'interface' ? 'Interface' : 'Sources'}</h2>
          </div>
          <button onClick={onClose} aria-label="Close system settings">
            <X size={20} />
          </button>
        </div>
        <div className="cx-system-tabs">
          <button
            className={tab === 'interface' ? 'is-active' : undefined}
            onClick={() => setTab('interface')}
          >
            Interface
          </button>
          <button
            className={tab === 'sources' ? 'is-active' : undefined}
            onClick={() => setTab('sources')}
          >
            Active sources
          </button>
          <button
            className={tab === 'catalog' ? 'is-active' : undefined}
            onClick={() => setTab('catalog')}
          >
            Provider catalog
          </button>
        </div>
        {tab === 'interface' && (
          <div className="cx-interface-settings">
            <div className="cx-setting-intro">
              <span>Library / Song sequence</span>
              <h3>Choose the movement language</h3>
              <p>
                This changes how recordings inside your playlists are presented.
                It does not alter playlist order or playback.
              </p>
            </div>
            <div className="cx-presentation-options" role="radiogroup">
              <button
                className={
                  trackPresentation === 'precision' ? 'is-active' : undefined
                }
                role="radio"
                aria-checked={trackPresentation === 'precision'}
                onClick={() => onTrackPresentation('precision')}
              >
                <span className="cx-setting-preview cx-setting-preview-list">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                <span>
                  <LayoutList size={18} />
                  <b>Precision list</b>
                  <small>
                    Dense, exact, and fast for managing long sequences.
                  </small>
                </span>
                <em>
                  {trackPresentation === 'precision' ? 'Active' : 'Select'}
                </em>
              </button>
              <button
                className={
                  trackPresentation === 'carousel' ? 'is-active' : undefined
                }
                role="radio"
                aria-checked={trackPresentation === 'carousel'}
                onClick={() => onTrackPresentation('carousel')}
              >
                <span className="cx-setting-preview cx-setting-preview-cards">
                  <i />
                  <i />
                  <i />
                </span>
                <span>
                  <GalleryHorizontalEnd size={18} />
                  <b>Card carousel</b>
                  <small>
                    A spatial, controller-like sequence navigated by wheel or
                    arrow keys.
                  </small>
                </span>
                <em>
                  {trackPresentation === 'carousel' ? 'Active' : 'Select'}
                </em>
              </button>
            </div>
            <div className="cx-setting-note">
              <b>Navigation</b>
              <span>
                Mouse wheel or left/right arrows move one recording. Enter plays
                the selected card.
              </span>
            </div>
            <section className="cx-volume-boost-setting cx-title-sequence-setting">
              <div className="cx-volume-boost-head">
                <div>
                  <span>Launch / Title presentation</span>
                  <h3>Play title sequence</h3>
                  <p>
                    Begin each launch at the crystalline Creaux2 title screen.
                    The reveal can always be fast-forwarded with a click.
                  </p>
                </div>
                <button
                  role="switch"
                  aria-checked={playTitleSequence ?? true}
                  className={
                    playTitleSequence !== false ? 'is-active' : undefined
                  }
                  onClick={() =>
                    setPlayTitleSequence(!(playTitleSequence ?? true))
                  }
                >
                  <span />
                  {playTitleSequence !== false ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            </section>
            <section className="cx-volume-boost-setting cx-waveform-setting">
              <div className="cx-volume-boost-head">
                <div>
                  <span>Player / Live spectrum</span>
                  <h3>Waveform response</h3>
                  <p>
                    Tune the energy and spectral detail of the live waveform
                    beneath the player glass. These controls never alter the
                    audio itself.
                  </p>
                </div>
                <div className="cx-waveform-setting-readout" aria-hidden="true">
                  <AudioLines size={18} />
                  <span>Live signal</span>
                </div>
              </div>
              <div className="cx-volume-boost-control is-enabled cx-waveform-control">
                <label htmlFor="cx-waveform-reactivity">
                  <span>Reactivity</span>
                  <output>{waveformReactivityPercent}%</output>
                </label>
                <div className="cx-waveform-slider">
                  <input
                    id="cx-waveform-reactivity"
                    type="range"
                    min={MIN_WAVEFORM_REACTIVITY * 100}
                    max={MAX_WAVEFORM_REACTIVITY * 100}
                    step="5"
                    value={waveformReactivityPercent}
                    aria-label="Waveform reactivity"
                    style={
                      {
                        '--cx-boost': `${
                          ((waveformReactivityPercent -
                            MIN_WAVEFORM_REACTIVITY * 100) /
                            ((MAX_WAVEFORM_REACTIVITY -
                              MIN_WAVEFORM_REACTIVITY) *
                              100)) *
                          100
                        }%`,
                      } as CSSProperties
                    }
                    onChange={(event) =>
                      setWaveformReactivity(
                        clampWaveformReactivity(
                          Number(event.target.value) / 100,
                        ),
                      )
                    }
                  />
                  <span className="cx-waveform-scale" aria-hidden="true">
                    <i>Restrained</i>
                    <i>Balanced</i>
                    <i>Expressive</i>
                  </span>
                </div>
              </div>
              <div className="cx-volume-boost-control is-enabled cx-waveform-control">
                <label htmlFor="cx-waveform-segments">
                  <span>Segments</span>
                  <output>{safeWaveformSegments}</output>
                </label>
                <div className="cx-waveform-slider">
                  <input
                    id="cx-waveform-segments"
                    type="range"
                    min={MIN_WAVEFORM_SEGMENTS}
                    max={MAX_WAVEFORM_SEGMENTS}
                    step={MIN_WAVEFORM_SEGMENTS}
                    value={safeWaveformSegments}
                    aria-label="Waveform segment detail"
                    style={
                      {
                        '--cx-boost': `${
                          ((safeWaveformSegments - MIN_WAVEFORM_SEGMENTS) /
                            (MAX_WAVEFORM_SEGMENTS - MIN_WAVEFORM_SEGMENTS)) *
                          100
                        }%`,
                      } as CSSProperties
                    }
                    onChange={(event) =>
                      setWaveformSegments(
                        clampWaveformSegments(Number(event.target.value)),
                      )
                    }
                  />
                  <span className="cx-waveform-scale" aria-hidden="true">
                    <i>32 / Broad</i>
                    <i>128 / Fine</i>
                    <i>256 / Ultra</i>
                  </span>
                </div>
              </div>
              <p className="cx-waveform-containment-note">
                Maximum response is hard-limited to the player envelope, so no
                segment can cross the glass boundary.
              </p>
            </section>
            <section className="cx-volume-boost-setting">
              <div className="cx-volume-boost-head">
                <div>
                  <span>Playback / Local gain</span>
                  <h3>Exceed volume limit</h3>
                  <p>
                    Amplify Creaux2 alone without lowering or changing the
                    volume of other applications.
                  </p>
                </div>
                <button
                  role="switch"
                  aria-checked={exceedVolumeLimit ?? false}
                  className={exceedVolumeLimit ? 'is-active' : undefined}
                  onClick={() =>
                    setExceedVolumeLimit(!(exceedVolumeLimit ?? false))
                  }
                >
                  <span />
                  {exceedVolumeLimit ? 'Enabled' : 'Disabled'}
                </button>
              </div>
              <div
                className={`cx-volume-boost-control ${
                  exceedVolumeLimit ? 'is-enabled' : ''
                }`}
              >
                <label htmlFor="cx-volume-boost">
                  <span>Creaux2 maximum</span>
                  <output>{boostPercent}%</output>
                </label>
                <input
                  id="cx-volume-boost"
                  type="range"
                  min="100"
                  max="200"
                  step="5"
                  value={boostPercent}
                  disabled={!exceedVolumeLimit}
                  aria-label="Maximum amplified volume"
                  style={
                    {
                      '--cx-boost': `${boostPercent - 100}%`,
                    } as CSSProperties
                  }
                  onChange={(event) =>
                    setVolumeBoost(Number(event.target.value) / 100)
                  }
                />
              </div>
              <p className="cx-volume-warning">
                <TriangleAlert size={15} />
                Higher gain can clip recordings and may damage your hearing.
                Begin low and raise it slowly.
              </p>
            </section>
          </div>
        )}
        {tab === 'sources' && (
          <div className="cx-provider-groups">
            {groups.map((group, index) => (
              <section key={group.kind}>
                <div className="cx-provider-label">
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <b>{group.label}</b>
                    <small>{group.providers.length} installed</small>
                  </div>
                </div>
                {group.providers.length === 0 ? (
                  <p>No provider installed for this capability.</p>
                ) : (
                  <div className="cx-provider-options">
                    {group.providers.map((provider) => (
                      <button
                        key={provider.id}
                        className={
                          active[group.kind] === provider.id
                            ? 'is-active'
                            : undefined
                        }
                        onClick={() =>
                          providersHost.setActive(group.kind, provider.id)
                        }
                      >
                        <span className="cx-provider-aperture" />
                        <div>
                          <b>{provider.name}</b>
                          <small>{provider.id}</small>
                        </div>
                        {active[group.kind] === provider.id && (
                          <span>Active</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
        {tab === 'catalog' && (
          <div className="cx-catalog">
            <label>
              <Search size={17} />
              <input
                value={filter}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setFilter(event.target.value)
                }
                placeholder="Filter provider catalog"
              />
            </label>
            {isLoading && (
              <div className="cx-loading">
                <LoaderCircle size={22} />
                Loading provider registry
              </div>
            )}
            {isError && (
              <div className="cx-error">
                <b>The provider registry could not be reached.</b>
              </div>
            )}
            <div className="cx-plugin-list">
              {relevant.map((plugin) => {
                const isInstalled = plugin.id in installed;
                const installing =
                  isPending && variables?.plugin.id === plugin.id;
                return (
                  <article key={plugin.id}>
                    <div className="cx-plugin-icon">
                      <PlugZap size={21} />
                    </div>
                    <div>
                      <b>{plugin.name}</b>
                      <span>{plugin.description}</span>
                      <small>
                        {plugin.author} / {plugin.version}
                      </small>
                    </div>
                    <button
                      disabled={isInstalled || installing}
                      onClick={() => install({ plugin })}
                    >
                      {isInstalled
                        ? 'Installed'
                        : installing
                          ? 'Installing…'
                          : 'Install'}
                    </button>
                  </article>
                );
              })}
            </div>
          </div>
        )}
        <CirnoEasterEgg
          introduced={cirnoIntroduced}
          onIntroduce={onCirnoIntroduce}
          pokeCount={cirnoPokeCount}
          onPoke={onCirnoPoke}
          onBossTrigger={onRemiliaTrigger}
          bossResolved={remiliaResolved}
        />
      </section>
    </div>
  );
};

const CreauxApplication: FC<{
  initialSystemTab?: SystemTab;
  concealedByTitle?: boolean;
  enteringFromTitle?: boolean;
  onTitleAudioCanPlay?: () => void;
  titleAudioPhase: TitleAudioPhase;
}> = ({
  initialSystemTab,
  concealedByTitle,
  enteringFromTitle,
  onTitleAudioCanPlay,
  titleAudioPhase,
}) => {
  const [view, setView] = useState<ViewId>('home');
  const [history, setHistory] = useState<ViewId[]>(['home']);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [artistContext, setArtistContext] =
    useState<TrackArtistSelection | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(Boolean(initialSystemTab));
  const [cirnoIntroduced, setCirnoIntroduced] = useState(false);
  const [cirnoPokeCount, setCirnoPokeCount] = useState(0);
  const [remiliaEncounterActive, setRemiliaEncounterActive] = useState(false);
  const [remiliaResolved, setRemiliaResolved] = useState(false);
  const [playlistTrack, setPlaylistTrack] = useState<Track | null>(null);
  const [systemTab, setSystemTab] = useState<SystemTab>(
    initialSystemTab ?? 'sources',
  );
  const [trackPresentation, setTrackPresentation] = useState<TrackPresentation>(
    readTrackPresentation,
  );
  const metadataProviders = useProviders('metadata');
  const streamingProviders = useProviders('streaming');
  const active = useProvidersStore((state) => state.active);
  const favorites = useFavoritesStore();
  const queue = useQueueStore();
  const sound = useSoundStore();
  const playlistIndex = usePlaylistStore((state) => state.index);
  const loadPlaylist = usePlaylistStore((state) => state.loadPlaylist);
  const addTracksToPlaylist = usePlaylistStore((state) => state.addTracks);
  const createPlaylist = usePlaylistStore((state) => state.createPlaylist);
  useInterfaceSound(sound.status);
  const titlePlaybackConfirmedRef = useRef(false);
  const titlePlaybackRequestedRef = useRef(false);
  const consumedIntroTrackRef = useRef<string | null>(null);
  const currentQueueItem = queue.getCurrentItem();
  const currentQueueItemId = currentQueueItem?.id;
  const soundSourceUrl = sound.src?.url;

  const triggerRemiliaEncounter = useCallback(() => {
    if (remiliaEncounterActive || remiliaResolved) {
      return;
    }
    sound.stop();
    setSourcesOpen(false);
    setQueueOpen(false);
    setPlaylistTrack(null);
    setRemiliaEncounterActive(true);
  }, [remiliaEncounterActive, remiliaResolved, sound]);

  const soundPresentation = useMemo<SoundPresentation>(() => {
    switch (titleAudioPhase) {
      case 'silent':
      case 'warming':
        return { gain: 0, lowpassFrequency: 680, transitionMs: 0 };
      case 'ambient':
        return { gain: 0.3, lowpassFrequency: 680, transitionMs: 1600 };
      case 'releasing':
        return { gain: 1, lowpassFrequency: 22_000, transitionMs: 620 };
      case 'settings-exit':
        return { gain: 0, lowpassFrequency: 680, transitionMs: 520 };
      default:
        return { gain: 1, lowpassFrequency: 22_000, transitionMs: 0 };
    }
  }, [titleAudioPhase]);

  useEffect(() => {
    if (titleAudioPhase !== 'silent' || sound.status !== 'playing') {
      return;
    }
    sound.pause();
  }, [sound, titleAudioPhase]);

  useEffect(() => {
    if (titleAudioPhase !== 'warming') {
      return;
    }
    void Logger.playback.info(
      `Silent intro warm-up started; cached intro item=${currentQueueItemId ? 'yes' : 'no'}, source=${soundSourceUrl ? 'yes' : 'no'}`,
    );
  }, [currentQueueItemId, soundSourceUrl, titleAudioPhase]);

  useEffect(() => {
    if (
      titleAudioPhase !== 'warming' ||
      !currentQueueItemId ||
      !soundSourceUrl
    ) {
      return;
    }
    if (titlePlaybackConfirmedRef.current) {
      return;
    }
    if (titlePlaybackRequestedRef.current) {
      return;
    }
    titlePlaybackRequestedRef.current = true;
    void Logger.playback.info(
      `Intro playback armed for queue item ${currentQueueItemId}`,
    );
    void Logger.playback.info('Intro playback request 1/1');
    useSoundStore.getState().play();
  }, [currentQueueItemId, soundSourceUrl, titleAudioPhase]);

  const handleTrackPlaying = useCallback(
    (track: Track) => {
      const trackKey = `${track.source.provider}:${track.source.id}`;
      if (titleAudioPhase === 'warming' || titleAudioPhase === 'ambient') {
        titlePlaybackConfirmedRef.current = true;
        if (consumedIntroTrackRef.current !== trackKey) {
          consumedIntroTrackRef.current = trackKey;
          void Logger.playback.info(
            `Intro playback confirmed for ${trackKey}; clearing one-track startup cache`,
          );
          void clearLastPlayedTrackCache();
        }
        return;
      }
      if (titleAudioPhase === 'full') {
        void cacheLastPlayedTrack(track);
      }
    },
    [titleAudioPhase],
  );

  useEffect(() => {
    if (
      (titleAudioPhase !== 'releasing' &&
        titleAudioPhase !== 'settings-exit') ||
      sound.status !== 'playing'
    ) {
      return;
    }
    const currentTrack = queue.getCurrentItem()?.track;
    if (currentTrack) {
      void cacheLastPlayedTrack(currentTrack);
    }
  }, [queue, sound.status, titleAudioPhase]);

  useEffect(() => {
    if (!initialSystemTab) {
      return;
    }
    setSystemTab(initialSystemTab);
    setSourcesOpen(true);
  }, [initialSystemTab]);

  const metadataName = metadataProviders.find(
    (item) => item.id === active.metadata,
  )?.name;
  const streamingName = streamingProviders.find(
    (item) => item.id === active.streaming,
  )?.name;

  const navigate = (next: ViewId) => {
    if (next === view) {
      return;
    }
    setView(next);
    setHistory((current) => [...current.slice(0, historyIndex + 1), next]);
    setHistoryIndex((current) => current + 1);
  };

  const submitSearch = () => {
    const normalized = query.trim();
    if (!normalized) {
      return;
    }
    setArtistContext(null);
    setSubmittedQuery(normalized);
    navigate('search');
  };

  const exploreMedia = (item: MediaRef) => {
    const nextQuery = mediaLabel(item);
    setArtistContext(null);
    setQuery(nextQuery);
    setSubmittedQuery(nextQuery);
    navigate('search');
  };

  const exploreTrackArtist = (selection: TrackArtistSelection) => {
    setArtistContext(selection);
    setQuery(selection.artist.name);
    setSubmittedQuery(selection.artist.name);
    navigate('search');
  };

  const playTrack = (track: Track) => {
    queue.clearQueue();
    sound.beginTransition();
    queue.addToQueue([track]);
  };

  const addTrack = (track: Track) => queue.addToQueue([track]);
  const addTrackToPlaylist = async (playlistId: string): Promise<boolean> => {
    if (!playlistTrack) {
      return false;
    }
    try {
      const playlist = await loadPlaylist(playlistId);
      if (!playlist) {
        toast.error('Playlist could not be opened.');
        return false;
      }
      if (playlist.isReadOnly) {
        toast.error(`${playlist.name} is read-only.`);
        return false;
      }
      const duplicate = playlist.items.some(
        ({ track }) =>
          track.source.provider === playlistTrack.source.provider &&
          track.source.id === playlistTrack.source.id,
      );
      if (duplicate) {
        toast.info(`Already in ${playlist.name}`, {
          description: playlistTrack.title,
        });
        return false;
      }
      await addTracksToPlaylist(playlistId, [
        stripResolutionState(playlistTrack),
      ]);
      toast.success(`Added to ${playlist.name}`, {
        description: playlistTrack.title,
      });
      setPlaylistTrack(null);
      return true;
    } catch (error) {
      toast.error('The recording could not be added.', {
        description:
          error instanceof Error ? error.message : 'Playlist save failed.',
      });
      return false;
    }
  };
  const createPlaylistWithTrack = async (name: string): Promise<boolean> => {
    if (!playlistTrack) {
      return false;
    }
    try {
      const track = playlistTrack;
      const playlistId = await createPlaylist(name);
      await addTracksToPlaylist(playlistId, [stripResolutionState(track)]);
      toast.success(`Created ${name}`, {
        description: `${track.title} was added as the first recording.`,
      });
      setPlaylistTrack(null);
      return true;
    } catch (error) {
      toast.error('The playlist could not be created.', {
        description:
          error instanceof Error ? error.message : 'Playlist save failed.',
      });
      return false;
    }
  };
  const toggleFavorite = (track: Track) => {
    if (favorites.isTrackFavorite(track.source)) {
      void favorites.removeTrack(track.source);
    } else {
      void favorites.addTrack(track);
    }
  };
  const toggleMediaFavorite = (item: MediaRef) => {
    if ('title' in item) {
      if (favorites.isAlbumFavorite(item.source)) {
        void favorites.removeAlbum(item.source);
      } else {
        void favorites.addAlbum(item);
      }
      return;
    }
    if (!('id' in item)) {
      if (favorites.isArtistFavorite(item.source)) {
        void favorites.removeArtist(item.source);
      } else {
        void favorites.addArtist(item);
      }
    }
  };
  const isMediaFavorite = (item: MediaRef) => {
    if ('title' in item) {
      return favorites.isAlbumFavorite(item.source);
    }
    if (!('id' in item)) {
      return favorites.isArtistFavorite(item.source);
    }
    return false;
  };
  const changeTrackPresentation = (presentation: TrackPresentation) => {
    localStorage.setItem(TRACK_PRESENTATION_KEY, presentation);
    setTrackPresentation(presentation);
  };
  const openSystem = (tab: SystemTab) => {
    setSystemTab(tab);
    setSourcesOpen(true);
  };

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        const input = document.querySelector<HTMLInputElement>(
          '.cx-search-command input',
        );
        input?.focus();
        input?.select();
      }
      if (event.key === 'Escape') {
        setSourcesOpen(false);
        setQueueOpen(false);
        setPlaylistTrack(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const commonTrackProps = {
    onPlay: playTrack,
    onQueue: addTrack,
    onPlaylist: setPlaylistTrack,
    onArtist: exploreTrackArtist,
    onFavorite: toggleFavorite,
    isFavorite: (track: Track) => favorites.isTrackFavorite(track.source),
  };

  return (
    <div
      className={`cx-app ${enteringFromTitle ? 'is-title-handoff' : ''}`}
      aria-hidden={concealedByTitle || undefined}
    >
      <div className="cx-quiet-field" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <TitleBar />
      <CommandBar
        query={query}
        onQuery={(value) => {
          setArtistContext(null);
          setQuery(value);
        }}
        onSubmit={submitSearch}
        onQueue={() => setQueueOpen((value) => !value)}
        onBack={() => {
          if (historyIndex > 0) {
            const nextIndex = historyIndex - 1;
            setHistoryIndex(nextIndex);
            setView(history[nextIndex]);
          }
        }}
        onForward={() => {
          if (historyIndex < history.length - 1) {
            const nextIndex = historyIndex + 1;
            setHistoryIndex(nextIndex);
            setView(history[nextIndex]);
          }
        }}
        metadataName={metadataName}
        streamingName={streamingName}
      />
      <div className="cx-workspace">
        <Navigation
          active={view}
          onNavigate={navigate}
          onSettings={() => openSystem('sources')}
        />
        <main key={view} className="cx-main">
          {view === 'home' && (
            <HomeView
              onOpenSources={() => openSystem('sources')}
              onExploreMedia={exploreMedia}
              {...commonTrackProps}
            />
          )}
          {view === 'search' && (
            <SearchView
              query={query}
              submittedQuery={submittedQuery}
              artistContext={artistContext}
              onOpenSources={() => openSystem('sources')}
              onExploreMedia={exploreMedia}
              onKeepMedia={toggleMediaFavorite}
              isMediaKept={isMediaFavorite}
              {...commonTrackProps}
            />
          )}
          {view === 'library' && (
            <LibraryView
              {...commonTrackProps}
              trackPresentation={trackPresentation}
              onOpenSettings={() => openSystem('interface')}
            />
          )}
          {view === 'now' && <NowPlayingView onArtist={exploreTrackArtist} />}
        </main>
        {queueOpen && <QueuePanel onClose={() => setQueueOpen(false)} />}
      </div>
      <PlayerDock onExpand={() => navigate('now')} />
      {sourcesOpen && (
        <SourcesPanel
          onClose={() => setSourcesOpen(false)}
          trackPresentation={trackPresentation}
          onTrackPresentation={changeTrackPresentation}
          initialTab={systemTab}
          cirnoIntroduced={cirnoIntroduced}
          onCirnoIntroduce={() => setCirnoIntroduced(true)}
          cirnoPokeCount={cirnoPokeCount}
          onCirnoPoke={setCirnoPokeCount}
          onRemiliaTrigger={triggerRemiliaEncounter}
          remiliaResolved={remiliaResolved}
        />
      )}
      {playlistTrack && (
        <PlaylistPicker
          track={playlistTrack}
          playlists={playlistIndex}
          onClose={() => setPlaylistTrack(null)}
          onSelect={addTrackToPlaylist}
          onCreate={createPlaylistWithTrack}
        />
      )}
      <StreamResolver />
      <SoundProvider
        lockSource={
          titleAudioPhase === 'warming' || titleAudioPhase === 'ambient'
        }
        presentation={soundPresentation}
        onCanPlay={onTitleAudioCanPlay}
        onTrackPlaying={handleTrackPlaying}
      >
        <span className="cx-audio-mount" aria-hidden="true" />
      </SoundProvider>
      <Toaster theme="dark" />
      {remiliaEncounterActive && (
        <RemiliaBossSequence
          onComplete={() => {
            setRemiliaEncounterActive(false);
            setRemiliaResolved(true);
          }}
          onDefeat={() => {
            void appWindow.close();
          }}
        />
      )}
    </div>
  );
};

const CreauxExperience: FC = () => {
  const [playTitleSequence] = useCoreSetting<boolean>(
    'appearance.titleSequence',
  );
  const [destination, setDestination] =
    useState<TitleSequenceDestination | null>(null);
  const [pendingDestination, setPendingDestination] =
    useState<TitleSequenceDestination | null>(null);
  const titleSequenceEnabled =
    import.meta.env.MODE !== 'test' && playTitleSequence !== false;
  const startupItem = useQueueStore((state) => state.getCurrentItem());
  const isStartingUp = useStartupStore((state) => state.isStartingUp);
  const startupPlaybackPosition = useSoundStore((state) => state.seek);
  const startupPlaybackStatus = useSoundStore((state) => state.status);
  const [titleAudioCanPlay, setTitleAudioCanPlay] = useState(false);
  const [titleAudioPhase, setTitleAudioPhase] = useState<TitleAudioPhase>(
    titleSequenceEnabled ? 'silent' : 'full',
  );
  const [titleSequenceStarted, setTitleSequenceStarted] = useState(
    !titleSequenceEnabled || !startupItem,
  );
  const [titleLoaderVisible, setTitleLoaderVisible] = useState(
    titleSequenceEnabled && Boolean(startupItem),
  );
  const [titleLoaderLeaving, setTitleLoaderLeaving] = useState(false);
  const titleWarmupCompletedRef = useRef(false);
  const titleVisible = titleSequenceEnabled && destination === null;
  const applicationDestination = destination ?? pendingDestination;

  const startTitleSequence = useCallback(() => {
    if (!titleSequenceEnabled || titleSequenceStarted) {
      return;
    }
    setTitleAudioPhase('ambient');
    setTitleSequenceStarted(true);
  }, [titleSequenceEnabled, titleSequenceStarted]);

  const markTitleAudioCanPlay = useCallback(() => {
    setTitleAudioCanPlay(true);
  }, []);

  useEffect(() => {
    if (!titleVisible || isStartingUp) {
      return;
    }
    if (!startupItem || startupItem.status === 'error') {
      startTitleSequence();
      return;
    }
    if (titleAudioCanPlay && titleAudioPhase === 'silent') {
      setTitleAudioPhase('warming');
    }
  }, [
    isStartingUp,
    startTitleSequence,
    startupItem,
    titleAudioCanPlay,
    titleAudioPhase,
    titleVisible,
  ]);

  useEffect(() => {
    if (
      titleVisible &&
      titleAudioPhase === 'warming' &&
      startupPlaybackStatus === 'playing' &&
      startupPlaybackPosition >= TITLE_SILENT_PREROLL_SECONDS &&
      !titleWarmupCompletedRef.current
    ) {
      titleWarmupCompletedRef.current = true;
      void Logger.playback.info(
        `Silent intro warm-up complete at ${startupPlaybackPosition.toFixed(2)}s; revealing title sequence`,
      );
      startTitleSequence();
    }
  }, [
    startTitleSequence,
    startupPlaybackPosition,
    startupPlaybackStatus,
    titleAudioPhase,
    titleVisible,
  ]);

  useEffect(() => {
    if (!titleSequenceStarted || !titleLoaderVisible) {
      return;
    }
    setTitleLoaderLeaving(true);
    const timer = window.setTimeout(
      () => setTitleLoaderVisible(false),
      TITLE_LOADER_DISSOLVE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [titleLoaderVisible, titleSequenceStarted]);

  const prepareDestination = (next: TitleSequenceDestination) => {
    setTitleAudioPhase(next === 'application' ? 'releasing' : 'settings-exit');
    setPendingDestination(next);
  };

  const enterDestination = (next: TitleSequenceDestination) => {
    if (next === 'interface') {
      useSoundStore.getState().pause();
    }
    setTitleAudioPhase('full');
    setDestination(next);
  };

  useEffect(() => {
    if (destination === null || pendingDestination === null) {
      return;
    }
    const timer = window.setTimeout(() => setPendingDestination(null), 400);
    return () => window.clearTimeout(timer);
  }, [destination, pendingDestination]);

  return (
    <div className={`cx-experience ${titleVisible ? 'is-title-visible' : ''}`}>
      <CreauxApplication
        initialSystemTab={
          applicationDestination === 'interface' ? 'interface' : undefined
        }
        concealedByTitle={titleVisible}
        enteringFromTitle={pendingDestination !== null}
        onTitleAudioCanPlay={markTitleAudioCanPlay}
        titleAudioPhase={titleAudioPhase}
      />
      {titleVisible && titleSequenceStarted && (
        <TitleSequence
          onPrepare={prepareDestination}
          onEnter={enterDestination}
        />
      )}
      {titleVisible && titleLoaderVisible && (
        <TitleLoadingScreen
          exiting={titleLoaderLeaving}
          isWarming={titleAudioPhase === 'warming'}
          progressSeconds={startupPlaybackPosition}
          targetSeconds={TITLE_SILENT_PREROLL_SECONDS}
        />
      )}
      {pendingDestination !== null && (
        <div className="cx-title-handoff-curtain" aria-hidden="true">
          <i />
          <i />
        </div>
      )}
    </div>
  );
};

export const CreauxApp: FC = () => (
  <I18nextProvider i18n={i18n}>
    <QueryClientProvider client={queryClient}>
      <CreauxExperience />
    </QueryClientProvider>
  </I18nextProvider>
);
