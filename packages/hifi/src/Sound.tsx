import { useCallback, useEffect, useRef, useState } from 'react';

import { useAudioEvents } from './hooks/useAudioEvents';
import { useAudioLoader } from './hooks/useAudioLoader';
import { useAudioSeek } from './hooks/useAudioSeek';
import { useHlsSource } from './hooks/useHlsSource';
import { useMseSource } from './hooks/useMseSource';
import { usePlaybackStatus } from './hooks/usePlaybackStatus';
import { useStartPosition } from './hooks/useStartPosition';
import { SoundProps } from './types';

const TRACK_FADE_OUT_MS = 180;
const TRACK_FADE_IN_MS = 240;
const VISUALIZER_BANDS = 256;
const VISUALIZER_FRAME_MS = 1000 / 30;
const EMPTY_VISUALIZER_FRAME = Object.freeze(
  Array.from({ length: VISUALIZER_BANDS }, () => 0),
);

const sourceKey = (source: SoundProps['src']): string =>
  `${source.protocol}:${source.url}:${source.startPositionSeconds ?? ''}`;

export const Sound: React.FC<SoundProps> = ({
  src,
  status,
  seek,
  volume,
  amplification = 1,
  presentationGain = 1,
  lowpassFrequency = 22_000,
  presentationTransitionMs = 0,
  transitioning = false,
  playbackRequestId = 0,
  preload = 'auto',
  crossOrigin = '',
  onTimeUpdate,
  onEnd,
  onLoadStart,
  onCanPlay,
  onPlaying,
  onError,
  onSourceInvalid,
  onVisualizationData,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [loadedSrc, setLoadedSrc] = useState(src);
  const desiredSrcRef = useRef(src);
  const targetVolumeRef = useRef(1);
  const volumeFrameRef = useRef<number | null>(null);
  const shouldFadeInRef = useRef(false);
  const outputGraphRef = useRef<{
    context: AudioContext;
    source: MediaElementAudioSourceNode;
    gain: GainNode;
    filter: BiquadFilterNode | null;
    analyser: AnalyserNode | null;
  } | null>(null);

  desiredSrcRef.current = src;
  const sourceIsChanging = sourceKey(src) !== sourceKey(loadedSrc);

  useAudioSeek(audioRef, transitioning || sourceIsChanging ? undefined : seek);
  useStartPosition(audioRef, loadedSrc);
  useAudioLoader(audioRef, loadedSrc);
  useHlsSource(audioRef, loadedSrc);
  useMseSource(audioRef, loadedSrc, onError, onSourceInvalid);
  usePlaybackStatus(
    audioRef,
    status,
    loadedSrc.url,
    onError,
    transitioning || sourceIsChanging,
    playbackRequestId,
  );

  const cancelVolumeRamp = useCallback(() => {
    if (volumeFrameRef.current !== null) {
      cancelAnimationFrame(volumeFrameRef.current);
      volumeFrameRef.current = null;
    }
  }, []);

  const rampVolume = useCallback(
    (
      audio: HTMLAudioElement,
      target: number,
      durationMs: number,
      onComplete?: () => void,
    ) => {
      cancelVolumeRamp();
      const startVolume = audio.volume;
      const startedAt = performance.now();
      const safeTarget = Math.max(0, Math.min(1, target));

      const step = (now: number) => {
        const progress = Math.max(
          0,
          Math.min(1, (now - startedAt) / durationMs),
        );
        const eased = 1 - Math.pow(1 - progress, 3);
        audio.volume = startVolume + (safeTarget - startVolume) * eased;
        if (progress < 1) {
          volumeFrameRef.current = requestAnimationFrame(step);
          return;
        }
        volumeFrameRef.current = null;
        onComplete?.();
      };

      if (durationMs <= 0 || Math.abs(startVolume - safeTarget) < 0.001) {
        audio.volume = safeTarget;
        onComplete?.();
        return;
      }
      volumeFrameRef.current = requestAnimationFrame(step);
    },
    [cancelVolumeRamp],
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !sourceIsChanging) {
      return;
    }

    let cancelled = false;
    shouldFadeInRef.current = true;
    const loadReplacement = () => {
      if (cancelled) {
        return;
      }
      audio.pause();
      audio.volume = 0;
      setLoadedSrc(desiredSrcRef.current);
    };

    if (audio.paused || audio.volume <= 0.001) {
      loadReplacement();
    } else {
      rampVolume(audio, 0, TRACK_FADE_OUT_MS, loadReplacement);
    }

    return () => {
      cancelled = true;
      cancelVolumeRamp();
    };
  }, [sourceIsChanging, src, rampVolume, cancelVolumeRamp]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !transitioning || sourceIsChanging) {
      return;
    }

    shouldFadeInRef.current = true;
    if (audio.paused || audio.volume <= 0.001) {
      audio.pause();
      audio.volume = 0;
      return;
    }

    rampVolume(audio, 0, TRACK_FADE_OUT_MS, () => audio.pause());
  }, [transitioning, sourceIsChanging, rampVolume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || volume === undefined) {
      return;
    }

    const targetVolume = Math.max(0, Math.min(1, volume / 100));
    targetVolumeRef.current = targetVolume;
    if (!transitioning && !sourceIsChanging && !shouldFadeInRef.current) {
      audio.volume = targetVolume;
    }
  }, [volume, transitioning, sourceIsChanging]);

  useEffect(() => {
    const audio = audioRef.current;
    const safeAmplification = Math.max(1, Math.min(2, amplification));
    const safePresentationGain = Math.max(
      0,
      Math.min(1, presentationGain),
    );
    const safeLowpassFrequency = Math.max(
      120,
      Math.min(22_000, lowpassFrequency),
    );
    const safeTransitionSeconds =
      Math.max(0, Math.min(4_000, presentationTransitionMs)) / 1000;
    const needsOutputGraph =
      safeAmplification !== 1 ||
      safePresentationGain !== 1 ||
      safeLowpassFrequency !== 22_000 ||
      Boolean(onVisualizationData);
    if (!audio || (!needsOutputGraph && !outputGraphRef.current)) {
      return;
    }

    if (!outputGraphRef.current) {
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

      const context = new AudioContextClass();
      try {
        const source = context.createMediaElementSource(audio);
        const gain = context.createGain();
        gain.gain.setValueAtTime(
          safeTransitionSeconds > 0 && safePresentationGain < 1
            ? 0
            : safeAmplification * safePresentationGain,
          context.currentTime,
        );
        const filter =
          typeof context.createBiquadFilter === 'function'
            ? context.createBiquadFilter()
            : null;
        if (filter) {
          filter.type = 'lowpass';
          filter.Q.setValueAtTime(0.72, context.currentTime);
          filter.frequency.setValueAtTime(
            safeLowpassFrequency,
            context.currentTime,
          );
        }
        const analyser =
          onVisualizationData && typeof context.createAnalyser === 'function'
            ? context.createAnalyser()
            : null;
        if (analyser) {
          analyser.fftSize = 2048;
          analyser.minDecibels = -92;
          analyser.maxDecibels = -12;
          analyser.smoothingTimeConstant = 0.68;
        }
        source.connect(gain);
        const presentationOutput = filter ?? gain;
        if (filter) {
          gain.connect(filter);
        }
        if (analyser) {
          presentationOutput.connect(analyser);
          analyser.connect(context.destination);
        } else {
          presentationOutput.connect(context.destination);
        }
        outputGraphRef.current = {
          context,
          source,
          gain,
          filter,
          analyser,
        };
      } catch {
        void context.close();
        return;
      }
    }

    const graph = outputGraphRef.current;
    const now = graph.context.currentTime;
    const targetGain = safeAmplification * safePresentationGain;
    graph.gain.gain.cancelScheduledValues(now);
    graph.gain.gain.setValueAtTime(graph.gain.gain.value, now);
    if (safeTransitionSeconds > 0) {
      graph.gain.gain.linearRampToValueAtTime(
        targetGain,
        now + safeTransitionSeconds,
      );
    } else {
      graph.gain.gain.setValueAtTime(targetGain, now);
    }
    if (graph.filter) {
      graph.filter.frequency.cancelScheduledValues(now);
      graph.filter.frequency.setValueAtTime(
        Math.max(120, graph.filter.frequency.value),
        now,
      );
      if (safeTransitionSeconds > 0) {
        graph.filter.frequency.exponentialRampToValueAtTime(
          safeLowpassFrequency,
          now + safeTransitionSeconds,
        );
      } else {
        graph.filter.frequency.setValueAtTime(safeLowpassFrequency, now);
      }
    }
    if (status === 'playing') {
      void graph.context.resume();
    }
  }, [
    amplification,
    lowpassFrequency,
    onVisualizationData,
    presentationGain,
    presentationTransitionMs,
    status,
  ]);

  useEffect(() => {
    const outputGraph = outputGraphRef.current;
    const analyser = outputGraph?.analyser;
    const visualizationIsActive =
      status === 'playing' && !transitioning && !sourceIsChanging;
    if (!onVisualizationData || !analyser || !visualizationIsActive) {
      onVisualizationData?.(EMPTY_VISUALIZER_FRAME);
      return;
    }

    const frequencyData = new Uint8Array(analyser.frequencyBinCount);
    const previousLevels = new Float32Array(VISUALIZER_BANDS);
    let animationFrame = 0;
    let lastSampleAt = 0;

    const sample = (timestamp: number) => {
      animationFrame = requestAnimationFrame(sample);
      if (timestamp - lastSampleAt < VISUALIZER_FRAME_MS) {
        return;
      }
      lastSampleAt = timestamp;
      analyser.getByteFrequencyData(frequencyData);

      const sampleRate = outputGraph?.context.sampleRate || 48_000;
      const nyquist = sampleRate / 2;
      const firstBin = Math.max(
        1,
        Math.round((42 / nyquist) * frequencyData.length),
      );
      const finalBin = Math.max(
        firstBin + 1,
        Math.min(
          frequencyData.length - 1,
          Math.round((16_500 / nyquist) * frequencyData.length),
        ),
      );
      const binRatio = finalBin / firstBin;
      const levels = Array.from({ length: VISUALIZER_BANDS }, (_, index) => {
        const start = Math.max(
          firstBin,
          Math.floor(firstBin * Math.pow(binRatio, index / VISUALIZER_BANDS)),
        );
        const end = Math.max(
          start + 1,
          Math.floor(
            firstBin * Math.pow(binRatio, (index + 1) / VISUALIZER_BANDS),
          ),
        );
        let total = 0;
        let peak = 0;
        const safeEnd = Math.min(end, frequencyData.length);
        for (let bin = start; bin < safeEnd; bin += 1) {
          const value = frequencyData[bin];
          total += value;
          peak = Math.max(peak, value);
        }
        const count = Math.max(1, safeEnd - start);
        const energy = (total / count) * 0.76 + peak * 0.24;
        const rawLevel = Math.min(
          1,
          Math.pow(Math.max(0, energy - 5) / 250, 0.72) * 1.12,
        );
        const previous = previousLevels[index];
        const response = rawLevel > previous ? 0.62 : 0.2;
        const smoothed = previous + (rawLevel - previous) * response;
        previousLevels[index] = smoothed;
        return smoothed;
      });

      onVisualizationData(levels);
    };

    animationFrame = requestAnimationFrame(sample);
    return () => {
      cancelAnimationFrame(animationFrame);
      onVisualizationData(EMPTY_VISUALIZER_FRAME);
    };
  }, [loadedSrc, onVisualizationData, sourceIsChanging, status, transitioning]);

  useEffect(
    () => () => {
      cancelVolumeRamp();
      const graph = outputGraphRef.current;
      graph?.source.disconnect();
      graph?.gain.disconnect();
      graph?.filter?.disconnect();
      graph?.analyser?.disconnect();
      if (graph) {
        void graph.context.close();
      }
      outputGraphRef.current = null;
    },
    [cancelVolumeRamp],
  );

  const handleCanPlay = useCallback(() => {
    const audio = audioRef.current;
    if (
      audio &&
      status === 'playing' &&
      sourceKey(loadedSrc) === sourceKey(desiredSrcRef.current) &&
      shouldFadeInRef.current
    ) {
      audio.volume = 0;
      rampVolume(audio, targetVolumeRef.current, TRACK_FADE_IN_MS, () => {
        shouldFadeInRef.current = false;
      });
    }
    onCanPlay?.();
  }, [loadedSrc, onCanPlay, rampVolume, status]);

  const handleLoadStart = useCallback(() => {
    onLoadStart?.();
  }, [onLoadStart]);

  const { handleTimeUpdate, handleError } = useAudioEvents({
    onTimeUpdate,
    onError,
  });

  return (
    <audio
      ref={audioRef}
      hidden
      preload={preload}
      crossOrigin={crossOrigin}
      onTimeUpdate={handleTimeUpdate}
      onEnded={onEnd}
      onLoadStart={handleLoadStart}
      onCanPlay={handleCanPlay}
      onPlaying={onPlaying}
      onError={handleError}
    />
  );
};
