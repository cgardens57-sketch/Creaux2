import { create } from 'zustand';

import { AudioSource, SoundStatus } from '@nuclearplayer/hifi';

import { eventBus } from '../services/eventBus';
import { Logger } from '../services/logger';
import { secondsToMs } from '../utils/time';

type SoundState = {
  src: AudioSource | null;
  srcItemId: string | null;
  status: SoundStatus;
  seek: number;
  duration: number;
  transitioning: boolean;
  playbackRequestId: number;
  crossfadeMs: number;
  preload: 'none' | 'metadata' | 'auto';
  crossOrigin: '' | 'anonymous' | 'use-credentials';
};

type SoundActions = {
  setSrc: (src: AudioSource | null, itemId?: string | null) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  beginTransition: () => void;
  toggle: () => void;
  seekTo: (seconds: number) => void;
  updatePlayback: (position: number, duration: number) => void;
  setCrossfadeMs: (ms: number) => void;
  setPreload: (mode: 'none' | 'metadata' | 'auto') => void;
  setCrossOrigin: (v: '' | 'anonymous' | 'use-credentials') => void;
};

export const useSoundStore = create<SoundState & SoundActions>((set, get) => ({
  src: null,
  srcItemId: null,
  status: 'stopped',
  seek: 0,
  duration: 0,
  transitioning: false,
  playbackRequestId: 0,
  crossfadeMs: 0,
  preload: 'auto',
  crossOrigin: '',
  setSrc: (src, itemId = null) => {
    set({ src, srcItemId: src ? itemId : null, seek: 0, duration: 0 });
    Logger.playback.debug(`Set source: ${src?.url ?? 'null'}`);
  },
  play: () => {
    set((state) => ({
      status: 'playing',
      transitioning: false,
      playbackRequestId: state.playbackRequestId + 1,
    }));
    Logger.playback.debug('Play');
  },
  pause: () => {
    set({ status: 'paused', transitioning: false });
    Logger.playback.debug('Pause');
  },
  stop: () => {
    set({ status: 'stopped', seek: 0, transitioning: false });
    Logger.playback.debug('Stop');
  },
  beginTransition: () => {
    set({ status: 'playing', seek: 0, transitioning: true });
    Logger.playback.debug('Begin silent track transition');
  },
  toggle: () => {
    const { status } = get();
    if (status === 'playing') {
      get().pause();
    } else {
      get().play();
    }
  },
  seekTo: (seconds) => {
    eventBus.emit('playbackSeeked', {
      fromMs: secondsToMs(get().seek),
      toMs: secondsToMs(seconds),
    });
    set({ seek: seconds });
  },
  updatePlayback: (position, duration) => set({ seek: position, duration }),
  setCrossfadeMs: (ms) => set({ crossfadeMs: ms }),
  setPreload: (mode) => set({ preload: mode }),
  setCrossOrigin: (v) => set({ crossOrigin: v }),
}));
