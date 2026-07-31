import { ScriptHTMLAttributes } from 'react';

export type AudioSource = {
  url: string;
  protocol: 'file' | 'http' | 'https' | 'hls' | 'mse';
  durationSeconds?: number;
  codec?: string;
  startPositionSeconds?: number;
};

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

export type HifiLogger = {
  [Level in LogLevel]: (message: string) => void | Promise<void>;
};

export type SoundStatus = 'playing' | 'paused' | 'stopped';
export type SoundProps = {
  src: AudioSource;
  status: SoundStatus;
  seek?: number;
  volume?: number;
  amplification?: number;
  presentationGain?: number;
  lowpassFrequency?: number;
  presentationTransitionMs?: number;
  transitioning?: boolean;
  playbackRequestId?: number;
  preload?: HTMLAudioElement['preload'];
  crossOrigin?: ScriptHTMLAttributes<HTMLAudioElement>['crossOrigin'];
  onTimeUpdate?: (args: { position: number; duration: number }) => void;
  onEnd?: () => void;
  onLoadStart?: () => void;
  onCanPlay?: () => void;
  onPlaying?: () => void;
  onError?: (error: Error) => void;
  onSourceInvalid?: () => void;
  onVisualizationData?: (levels: readonly number[]) => void;
};
