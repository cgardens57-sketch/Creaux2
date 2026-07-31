import { getCurrentWindow } from '@tauri-apps/api/window';
import { Maximize2, Minus, X } from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FC,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

import './title-sequence.css';

export type TitleSequenceDestination = 'application' | 'interface';

export const TITLE_SEQUENCE_READY_MS = 10_800;
const TITLE_SEQUENCE_EXIT_MS = 620;
const TITLE_SEQUENCE_REDUCED_EXIT_MS = 100;

const appWindow = getCurrentWindow();

const TitleWindowControls: FC = () => (
  <div className="cx-title-window-controls">
    <button
      aria-label="Minimize Creaux2"
      data-interface-sound="custom"
      onClick={() => void appWindow.minimize()}
    >
      <Minus size={14} />
    </button>
    <button
      aria-label="Maximize Creaux2"
      data-interface-sound="custom"
      onClick={() => void appWindow.toggleMaximize()}
    >
      <Maximize2 size={12} />
    </button>
    <button
      aria-label="Close Creaux2"
      data-interface-sound="custom"
      onClick={() => void appWindow.close()}
    >
      <X size={15} />
    </button>
  </div>
);

export const TitleLoadingScreen: FC<{
  exiting?: boolean;
  isWarming?: boolean;
  progressSeconds?: number;
  targetSeconds?: number;
}> = ({
  exiting = false,
  isWarming = false,
  progressSeconds = 0,
  targetSeconds = 5,
}) => {
  const boundedProgress = Math.max(
    0,
    Math.min(1, progressSeconds / targetSeconds),
  );

  return (
    <div
      className={`cx-title-loading${isWarming ? ' is-warming' : ''}${exiting ? ' is-exiting' : ''}`}
      role="status"
      aria-label={
        isWarming
          ? 'Silently preparing the opening song'
          : 'Preparing the last played song'
      }
      aria-live="polite"
      style={
        {
          '--cx-title-warmup-progress': boundedProgress,
        } as CSSProperties
      }
    >
      <TitleWindowControls />
      <div className="cx-title-loading-field" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="cx-title-loading-lockup">
        <span className="cx-title-loading-index">02</span>
        <span className="cx-title-loading-mark" aria-hidden="true">
          <i />
        </span>
        <div>
          <strong>Synchronizing last signal</strong>
        </div>
      </div>
      <div className="cx-title-loading-progress" aria-hidden="true">
        <i />
      </div>
      <footer className="cx-title-loading-footer">
        <span>CREAUX2 / AUDIO MEMORY</span>
        <span>
          {isWarming
            ? `SILENT PREROLL ${Math.min(progressSeconds, targetSeconds).toFixed(1)} / ${targetSeconds.toFixed(1)}`
            : 'BUFFERING SOURCE'}
        </span>
      </footer>
    </div>
  );
};

const CrystalBloom: FC = () => (
  <svg className="cx-title-bloom" viewBox="0 0 560 520" aria-hidden="true">
    <defs>
      <linearGradient id="cx-bloom-a" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#9bd8dc" stopOpacity="0.12" />
        <stop offset="0.42" stopColor="#379ab1" stopOpacity="0.88" />
        <stop offset="0.72" stopColor="#7b8dca" stopOpacity="0.58" />
        <stop offset="1" stopColor="#b18ac8" stopOpacity="0.06" />
      </linearGradient>
      <linearGradient id="cx-bloom-b" x1="0.2" y1="1" x2="0.8" y2="0">
        <stop offset="0" stopColor="#166f8e" stopOpacity="0.8" />
        <stop offset="0.5" stopColor="#77c9c1" stopOpacity="0.72" />
        <stop offset="1" stopColor="#d9cbe5" stopOpacity="0.18" />
      </linearGradient>
      <linearGradient id="cx-bloom-c" x1="0" y1="0.5" x2="1" y2="0.5">
        <stop offset="0" stopColor="#fbfdff" stopOpacity="0" />
        <stop offset="0.48" stopColor="#b5e3df" stopOpacity="0.8" />
        <stop offset="1" stopColor="#659ab6" stopOpacity="0" />
      </linearGradient>
      <radialGradient id="cx-bloom-core">
        <stop offset="0" stopColor="#f8ffff" />
        <stop offset="0.14" stopColor="#afe6e2" stopOpacity="0.94" />
        <stop offset="0.48" stopColor="#4e9eb2" stopOpacity="0.44" />
        <stop offset="1" stopColor="#4e9eb2" stopOpacity="0" />
      </radialGradient>
      <filter id="cx-bloom-soft" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="7" />
      </filter>
      <filter id="cx-bloom-glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="2.2" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>

    <g className="cx-bloom-mist" filter="url(#cx-bloom-soft)">
      <path
        d="M91 241C144 118 296 71 428 151c-79-4-128 29-177 78-55 55-105 66-160 12Z"
        fill="url(#cx-bloom-a)"
      />
      <path
        d="M148 332c46-20 92-12 129 16 36 27 73 25 120 1-57 89-190 98-249-17Z"
        fill="#78b9b8"
        opacity=".24"
      />
    </g>

    <g className="cx-bloom-wings" fill="none" strokeLinecap="round">
      <path
        d="M271 251C177 210 113 135 94 46"
        stroke="url(#cx-bloom-a)"
        strokeWidth="13"
      />
      <path
        d="M265 253C173 241 91 195 32 124"
        stroke="url(#cx-bloom-a)"
        strokeWidth="8"
      />
      <path
        d="M263 259C162 273 88 260 18 221"
        stroke="url(#cx-bloom-b)"
        strokeWidth="6"
      />
      <path
        d="M277 246C333 166 403 119 516 94"
        stroke="url(#cx-bloom-a)"
        strokeWidth="11"
      />
      <path
        d="M280 252C359 205 436 198 544 226"
        stroke="url(#cx-bloom-b)"
        strokeWidth="7"
      />
      <path
        d="M278 258C362 258 434 287 499 350"
        stroke="url(#cx-bloom-a)"
        strokeWidth="5"
      />
      <path
        d="M272 266C326 309 349 371 347 469"
        stroke="url(#cx-bloom-b)"
        strokeWidth="9"
      />
      <path
        d="M264 267C239 331 230 401 246 508"
        stroke="url(#cx-bloom-a)"
        strokeWidth="7"
      />
    </g>

    <g className="cx-bloom-filaments" fill="none">
      <path d="M271 252C209 162 190 100 199 29" />
      <path d="M267 253C175 189 111 167 49 171" />
      <path d="M265 258C163 301 97 328 42 391" />
      <path d="M274 250C348 141 416 79 500 42" />
      <path d="M278 254C391 217 462 218 548 255" />
      <path d="M277 261C385 289 430 333 470 409" />
      <path d="M271 266C291 358 288 423 276 516" />
      <path d="M274 255C333 218 369 174 387 120" />
      <path d="M266 255C216 221 186 184 166 135" />
    </g>

    <g className="cx-bloom-shards">
      <path d="m100 50 34 102-57-58Z" />
      <path d="m45 137 91 63-81-12Z" />
      <path d="m28 230 105 15-72 31Z" />
      <path d="m69 368 74-74-35 88Z" />
      <path d="m197 39 27 113-46-62Z" />
      <path d="m415 76-51 95 84-72Z" />
      <path d="m511 118-95 83 112-41Z" />
      <path d="m526 239-105 5 92 42Z" />
      <path d="m467 377-83-76 47 105Z" />
      <path d="m343 458-44-119 10 144Z" />
      <path d="m247 502 4-137 31 92Z" />
    </g>

    <g className="cx-bloom-rings" fill="none">
      <ellipse
        cx="270"
        cy="255"
        rx="87"
        ry="37"
        transform="rotate(-21 270 255)"
      />
      <ellipse
        cx="270"
        cy="255"
        rx="56"
        ry="118"
        transform="rotate(62 270 255)"
      />
      <path d="M190 257c27-62 113-75 158-24 41 47 13 110-42 122" />
    </g>

    <circle
      className="cx-bloom-core"
      cx="270"
      cy="255"
      r="72"
      fill="url(#cx-bloom-core)"
    />
    <g className="cx-bloom-diamond" filter="url(#cx-bloom-glow)">
      <path d="m270 217 28 38-28 40-28-40Z" fill="rgba(236,255,255,.2)" />
      <path d="m270 217 28 38-28 40-28-40Z" fill="none" />
      <path d="M242 255h56M270 217v78" />
      <circle cx="270" cy="255" r="4.5" />
    </g>
    <path
      className="cx-bloom-sweep"
      d="M47 255H516"
      stroke="url(#cx-bloom-c)"
    />
  </svg>
);

const useTitleSound = () => {
  const contextRef = useRef<AudioContext | null>(null);

  const context = () => {
    const AudioContextClass =
      window.AudioContext ??
      (
        window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;

    if (!AudioContextClass) {
      return null;
    }
    contextRef.current ??= new AudioContextClass();
    if (contextRef.current.state === 'suspended') {
      void contextRef.current.resume();
    }
    return contextRef.current;
  };

  const tone = (
    frequency: number,
    duration: number,
    volume: number,
    offset = 0,
  ) => {
    const audio = context();
    if (
      !audio ||
      typeof audio.createOscillator !== 'function' ||
      typeof audio.createGain !== 'function'
    ) {
      return;
    }
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const start = audio.currentTime + offset;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(
      frequency * 1.035,
      start + duration,
    );
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  };

  return {
    reveal: () => {
      tone(293.66, 1.8, 0.016);
      tone(440, 1.9, 0.012, 0.7);
      tone(659.25, 2.4, 0.009, 1.45);
    },
    move: () => {
      tone(987.77, 0.08, 0.018);
      tone(1318.51, 0.11, 0.008, 0.025);
    },
    accept: () => {
      tone(659.25, 0.34, 0.026);
      tone(987.77, 0.42, 0.018, 0.055);
      tone(1318.51, 0.55, 0.012, 0.11);
    },
    dispose: () => {
      void contextRef.current?.close();
      contextRef.current = null;
    },
  };
};

export const TitleSequence: FC<{
  onReady?: () => void;
  onPrepare?: (destination: TitleSequenceDestination) => void;
  onEnter: (destination: TitleSequenceDestination) => void;
}> = ({ onReady, onPrepare, onEnter }) => {
  const reducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [ready, setReady] = useState(reducedMotion);
  const [fastForwarded, setFastForwarded] = useState(reducedMotion);
  const [selected, setSelected] =
    useState<TitleSequenceDestination>('application');
  const [leaving, setLeaving] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const readyAnnouncedRef = useRef(false);
  const sound = useTitleSound();

  useEffect(() => {
    if (ready) {
      return;
    }
    const timer = window.setTimeout(
      () => setReady(true),
      TITLE_SEQUENCE_READY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [ready]);

  useEffect(() => {
    if (!ready || readyAnnouncedRef.current) {
      return;
    }
    readyAnnouncedRef.current = true;
    onReady?.();
  }, [onReady, ready]);

  useEffect(
    () => () => {
      sound.dispose();
    },
    [],
  );

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  const revealMenu = () => {
    if (ready) {
      return;
    }
    setFastForwarded(true);
    setReady(true);
    sound.reveal();
  };

  const choose = (destination: TitleSequenceDestination) => {
    if (leaving) {
      return;
    }
    if (!ready) {
      revealMenu();
      return;
    }
    setSelected(destination);
    onPrepare?.(destination);
    setLeaving(true);
    sound.accept();
    window.setTimeout(
      () => onEnter(destination),
      reducedMotion ? TITLE_SEQUENCE_REDUCED_EXIT_MS : TITLE_SEQUENCE_EXIT_MS,
    );
  };

  const moveSelection = (destination: TitleSequenceDestination) => {
    if (selected !== destination) {
      setSelected(destination);
      sound.move();
    }
  };

  const handleKeys = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!ready) {
      return;
    }
    if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') {
      event.preventDefault();
      moveSelection('application');
    }
    if (
      event.key === 'ArrowDown' ||
      event.key.toLowerCase() === 's' ||
      event.key === 'Tab'
    ) {
      event.preventDefault();
      moveSelection(selected === 'application' ? 'interface' : 'application');
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(selected);
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      choose('application');
    }
  };

  return (
    <div
      className={`cx-title-sequence ${ready ? 'is-ready' : ''} ${
        fastForwarded ? 'is-fast-forwarded' : ''
      } ${leaving ? 'is-leaving' : ''}`}
      role="application"
      aria-label="Creaux2 title screen"
      tabIndex={0}
      ref={rootRef}
      onKeyDown={handleKeys}
      onPointerDown={(event) => {
        if (!ready && !(event.target as Element).closest('button')) {
          revealMenu();
        }
      }}
    >
      <TitleWindowControls />

      <div className="cx-title-blackout" aria-hidden="true" />
      <div className="cx-title-field" aria-hidden="true">
        <i className="cx-title-field-line" />
        <i className="cx-title-field-line" />
        <i className="cx-title-field-line" />
        <i className="cx-title-field-line" />
        <i className="cx-title-particle" />
        <i className="cx-title-particle" />
        <i className="cx-title-particle" />
        <i className="cx-title-particle" />
      </div>

      <div className="cx-title-sequence-lockup" aria-hidden="true">
        <div className="cx-title-streak">
          <i />
          <i />
          <i />
        </div>
        <div className="cx-title-wordmark">
          <span>CREAUX</span>
          <b>2</b>
          <i />
        </div>
        <CrystalBloom />
      </div>

      <div className="cx-title-menu" aria-label="Title menu">
        <span className="cx-title-menu-label">LISTENING SYSTEM</span>
        <button
          className={selected === 'application' ? 'is-selected' : undefined}
          data-interface-sound="custom"
          onPointerEnter={() => moveSelection('application')}
          onFocus={() => moveSelection('application')}
          onClick={() => choose('application')}
        >
          <span className="cx-title-cursor" aria-hidden="true">
            <i />
          </span>
          Enter observatory
        </button>
        <button
          className={selected === 'interface' ? 'is-selected' : undefined}
          data-interface-sound="custom"
          onPointerEnter={() => moveSelection('interface')}
          onFocus={() => moveSelection('interface')}
          onClick={() => choose('interface')}
        >
          <span className="cx-title-cursor" aria-hidden="true">
            <i />
          </span>
          System settings
        </button>
      </div>

      <footer className="cx-title-footer">
        <span>CREAUX2 / SOURCE-INDEPENDENT LISTENING OBSERVATORY</span>
        <span>NUCLEAR ENGINE / LOCAL LIBRARY STATE</span>
      </footer>
    </div>
  );
};
