import { create } from 'zustand';

export const AUDIO_VISUALIZER_BANDS = 256;
export const MIN_WAVEFORM_REACTIVITY = 0.5;
export const MAX_WAVEFORM_REACTIVITY = 2;
export const DEFAULT_WAVEFORM_REACTIVITY = 1;
export const MIN_WAVEFORM_SEGMENTS = 32;
export const MAX_WAVEFORM_SEGMENTS = AUDIO_VISUALIZER_BANDS;
export const DEFAULT_WAVEFORM_SEGMENTS = 128;

export const clampWaveformReactivity = (value: number | undefined): number => {
  if (!Number.isFinite(value)) {
    return DEFAULT_WAVEFORM_REACTIVITY;
  }
  return Math.max(
    MIN_WAVEFORM_REACTIVITY,
    Math.min(MAX_WAVEFORM_REACTIVITY, value as number),
  );
};

export const applyWaveformReactivity = (
  level: number,
  reactivity: number | undefined,
): number => {
  const normalizedLevel = Number.isFinite(level)
    ? Math.max(0, Math.min(1, level))
    : 0;
  return Math.max(
    0,
    Math.min(
      1,
      Math.pow(normalizedLevel, 1 / clampWaveformReactivity(reactivity)),
    ),
  );
};

export const clampWaveformSegments = (value: number | undefined): number => {
  if (!Number.isFinite(value)) {
    return DEFAULT_WAVEFORM_SEGMENTS;
  }
  const clamped = Math.max(
    MIN_WAVEFORM_SEGMENTS,
    Math.min(MAX_WAVEFORM_SEGMENTS, value as number),
  );
  return (
    Math.round(clamped / MIN_WAVEFORM_SEGMENTS) * MIN_WAVEFORM_SEGMENTS
  );
};

export const selectWaveformSegments = (
  levels: readonly number[],
  segmentCount: number | undefined,
): number[] => {
  const safeSegmentCount = clampWaveformSegments(segmentCount);
  if (levels.length === safeSegmentCount) {
    return Array.from(levels);
  }
  if (levels.length === 0) {
    return Array.from({ length: safeSegmentCount }, () => 0);
  }

  return Array.from({ length: safeSegmentCount }, (_, index) => {
    const start = Math.floor((index * levels.length) / safeSegmentCount);
    const end = Math.max(
      start + 1,
      Math.floor(((index + 1) * levels.length) / safeSegmentCount),
    );
    let total = 0;
    for (let sourceIndex = start; sourceIndex < end; sourceIndex += 1) {
      const level = levels[sourceIndex] ?? 0;
      total += Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
    }
    return total / Math.max(1, end - start);
  });
};

const silentFrame = (): number[] =>
  Array.from({ length: AUDIO_VISUALIZER_BANDS }, () => 0);

type AudioVisualizerState = {
  levels: readonly number[];
  update: (levels: readonly number[]) => void;
  reset: () => void;
};

export const useAudioVisualizerStore = create<AudioVisualizerState>((set) => ({
  levels: silentFrame(),
  update: (levels) =>
    set({
      levels:
        levels.length === AUDIO_VISUALIZER_BANDS
          ? Array.from(levels)
          : silentFrame(),
    }),
  reset: () => set({ levels: silentFrame() }),
}));
