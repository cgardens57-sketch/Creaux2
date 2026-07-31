import { describe, expect, it } from 'vitest';

import {
  applyWaveformReactivity,
  clampWaveformReactivity,
  clampWaveformSegments,
  MAX_WAVEFORM_SEGMENTS,
  MIN_WAVEFORM_SEGMENTS,
  selectWaveformSegments,
} from './audioVisualizerStore';

describe('waveform presentation', () => {
  it('keeps reactivity inside the supported response range', () => {
    expect(clampWaveformReactivity(-4)).toBe(0.5);
    expect(clampWaveformReactivity(1.35)).toBe(1.35);
    expect(clampWaveformReactivity(9)).toBe(2);
    expect(clampWaveformReactivity(Number.NaN)).toBe(1);
  });

  it('never lets a reactive level escape the normalized envelope', () => {
    expect(applyWaveformReactivity(-1, 2)).toBe(0);
    expect(applyWaveformReactivity(4, 2)).toBe(1);
    expect(applyWaveformReactivity(0.25, 2)).toBe(0.5);
    expect(applyWaveformReactivity(Number.NaN, 2)).toBe(0);
  });

  it('snaps segment detail to safe 32-band increments', () => {
    expect(clampWaveformSegments(1)).toBe(MIN_WAVEFORM_SEGMENTS);
    expect(clampWaveformSegments(145)).toBe(160);
    expect(clampWaveformSegments(999)).toBe(MAX_WAVEFORM_SEGMENTS);
    expect(clampWaveformSegments(undefined)).toBe(128);
  });

  it('downsamples the analyzer frame without exceeding normalized levels', () => {
    const source = Array.from({ length: 256 }, (_, index) => index / 255);
    const result = selectWaveformSegments(source, 32);

    expect(result).toHaveLength(32);
    expect(Math.min(...result)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...result)).toBeLessThanOrEqual(1);
    expect(result[0]).toBeLessThan(result.at(-1) ?? 0);
  });
});
