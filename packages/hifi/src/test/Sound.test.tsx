import { act, render, waitFor } from '@testing-library/react';

import { Sound } from '../Sound';
import { AudioSource } from '../types';
import {
  fireMediaCanPlay,
  fireMediaLoadStart,
  resetMediaSpies,
  setupAudioContextMock,
} from './test-utils';

const httpSource: AudioSource = { url: '/a.mp3', protocol: 'http' };

describe('Sound', () => {
  it('reports when the media element is actually playing', () => {
    const { restore } = setupAudioContextMock();
    const onPlaying = vi.fn();

    render(<Sound src={httpSource} status="playing" onPlaying={onPlaying} />);

    const audio = document.querySelector('audio')!;
    act(() => {
      audio.dispatchEvent(new Event('playing'));
    });

    expect(onPlaying).toHaveBeenCalledTimes(1);
    restore();
  });

  it('sets currentTime on the active audio element when seek changes', () => {
    const { restore } = setupAudioContextMock();

    const { rerender } = render(<Sound src={httpSource} status="paused" />);

    rerender(<Sound src={httpSource} status="paused" seek={42} />);

    const audios = document.querySelectorAll('audio');
    const active = audios[0] as HTMLAudioElement;
    expect(active.currentTime).toBe(42);

    restore();
  });

  it('calls play after loading a new source while status is playing', async () => {
    const { restore } = setupAudioContextMock();
    const sourceA: AudioSource = { url: '/a.mp3', protocol: 'http' };
    const sourceB: AudioSource = { url: '/b.mp3', protocol: 'http' };
    let nextFrame: ((timestamp: number) => void) | undefined;
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: (timestamp: number) => void) => {
        nextFrame = callback;
        return 1;
      }),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const { rerender } = render(<Sound src={sourceA} status="playing" />);

    const { playMock } = resetMediaSpies();

    rerender(<Sound src={sourceB} status="playing" />);
    act(() => {
      nextFrame?.(performance.now() + 200);
    });

    await waitFor(() => expect(playMock).toHaveBeenCalled());
    vi.unstubAllGlobals();
    restore();
  });

  it('does not call play after loading a new source while status is paused', () => {
    const { restore } = setupAudioContextMock();
    const sourceA: AudioSource = { url: '/a.mp3', protocol: 'http' };
    const sourceB: AudioSource = { url: '/b.mp3', protocol: 'http' };

    const { rerender } = render(<Sound src={sourceA} status="paused" />);

    const { playMock } = resetMediaSpies();

    rerender(<Sound src={sourceB} status="paused" />);

    expect(playMock).not.toHaveBeenCalled();
    restore();
  });

  it('requests the new source immediately during a track switch', async () => {
    const { restore } = setupAudioContextMock();
    const sourceA: AudioSource = { url: '/a.mp3', protocol: 'http' };
    const sourceB: AudioSource = { url: '/b.mp3', protocol: 'http' };

    const { rerender } = render(<Sound src={sourceA} status="playing" />);

    const audio = document.querySelector('audio')!;
    act(() => {
      fireMediaLoadStart(audio);
      fireMediaCanPlay(audio);
    });

    rerender(<Sound src={sourceA} status="stopped" />);
    act(() => {
      fireMediaLoadStart(audio);
    });

    const { playMock } = resetMediaSpies();

    rerender(<Sound src={sourceB} status="playing" />);

    await waitFor(() => expect(playMock).toHaveBeenCalled());
    restore();
  });

  it('fades the old source out without rewinding it, waits in silence, then fades the ready source in', () => {
    const { restore } = setupAudioContextMock();
    const sourceA: AudioSource = { url: '/a.mp3', protocol: 'http' };
    const sourceB: AudioSource = { url: '/b.mp3', protocol: 'http' };
    let nextFrame: ((timestamp: number) => void) | undefined;
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: (timestamp: number) => void) => {
        nextFrame = callback;
        return 1;
      }),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const { rerender } = render(
      <Sound src={sourceA} status="playing" seek={37} volume={80} />,
    );
    const audio = document.querySelector('audio')!;
    Object.defineProperty(audio, 'paused', {
      value: false,
      configurable: true,
    });
    audio.currentTime = 37;

    const { playMock, pauseMock } = resetMediaSpies();
    rerender(
      <Sound
        src={sourceA}
        status="playing"
        seek={0}
        volume={80}
        transitioning
      />,
    );

    expect(audio.currentTime).toBe(37);
    expect(playMock).not.toHaveBeenCalled();
    expect(nextFrame).toBeDefined();

    act(() => {
      nextFrame?.(performance.now() + 200);
    });
    expect(audio.volume).toBe(0);
    expect(pauseMock).toHaveBeenCalled();

    Object.defineProperty(audio, 'paused', {
      value: true,
      configurable: true,
    });
    playMock.mockClear();
    rerender(<Sound src={sourceB} status="playing" seek={0} volume={80} />);

    expect(audio.src).toContain('/b.mp3');
    expect(audio.volume).toBe(0);
    expect(playMock).toHaveBeenCalled();

    act(() => {
      fireMediaCanPlay(audio);
    });

    act(() => {
      nextFrame?.(performance.now() + 260);
    });
    expect(audio.volume).toBeCloseTo(0.8);

    vi.unstubAllGlobals();
    restore();
  });

  it('requests playback while an unbuffered stream is still loading', () => {
    const { restore } = setupAudioContextMock();
    const { rerender } = render(<Sound src={httpSource} status="stopped" />);
    const audio = document.querySelector('audio')!;
    Object.defineProperty(audio, 'readyState', {
      value: 0,
      configurable: true,
    });
    const { playMock } = resetMediaSpies();

    rerender(<Sound src={httpSource} status="playing" />);

    expect(playMock).toHaveBeenCalledTimes(1);
    restore();
  });

  it('plays when status changes from stopped to playing and audio is already buffered', () => {
    const { restore } = setupAudioContextMock();
    const source: AudioSource = { url: '/a.mp3', protocol: 'http' };

    const { rerender } = render(<Sound src={source} status="stopped" />);

    const audio = document.querySelector('audio')!;
    act(() => {
      fireMediaCanPlay(audio);
    });

    const { playMock } = resetMediaSpies();

    rerender(<Sound src={source} status="playing" />);

    expect(playMock).toHaveBeenCalled();
    restore();
  });

  it('honors a fresh play request after the same source has ended', () => {
    const { restore } = setupAudioContextMock();

    const { rerender } = render(
      <Sound src={httpSource} status="playing" playbackRequestId={1} />,
    );
    const audio = document.querySelector('audio')!;
    act(() => {
      fireMediaCanPlay(audio);
    });

    const { playMock } = resetMediaSpies();
    Object.defineProperty(audio, 'paused', {
      value: true,
      configurable: true,
    });
    rerender(<Sound src={httpSource} status="playing" playbackRequestId={2} />);

    expect(playMock).toHaveBeenCalledTimes(1);
    restore();
  });

  it('plays the new source when the queue auto-advances without an intermediate render', async () => {
    const { restore } = setupAudioContextMock();
    const sourceA: AudioSource = { url: '/a.mp3', protocol: 'http' };
    const sourceB: AudioSource = { url: '/b.mp3', protocol: 'http' };
    let nextFrame: ((timestamp: number) => void) | undefined;
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: (timestamp: number) => void) => {
        nextFrame = callback;
        return 1;
      }),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const { rerender } = render(<Sound src={sourceA} status="playing" />);
    const audio = document.querySelector('audio')!;

    act(() => {
      fireMediaCanPlay(audio);
    });

    const { playMock } = resetMediaSpies();

    rerender(<Sound src={sourceB} status="playing" />);
    act(() => {
      nextFrame?.(performance.now() + 200);
    });

    await waitFor(() => expect(audio.src).toContain('/b.mp3'));

    act(() => {
      fireMediaLoadStart(audio);
      fireMediaCanPlay(audio);
    });

    expect(playMock).toHaveBeenCalled();
    vi.unstubAllGlobals();
    restore();
  });

  it('applies the volume prop to the audio element', () => {
    const { restore } = setupAudioContextMock();

    render(<Sound src={httpSource} status="paused" volume={50} />);

    const audio = document.querySelector('audio') as HTMLAudioElement;
    expect(audio.volume).toBe(0.5);

    restore();
  });

  it('applies opt-in amplification through an app-local gain node', () => {
    const { gains, restore } = setupAudioContextMock();

    render(
      <Sound
        src={httpSource}
        status="playing"
        volume={100}
        amplification={1.5}
      />,
    );

    expect(gains).toHaveLength(1);
    expect(gains[0].gain.setValueAtTime).toHaveBeenCalledWith(1.5, 0);

    restore();
  });

  it('ramps title presentation gain and low-pass without replacing playback', () => {
    const { filters, gains, restore } = setupAudioContextMock();
    const { rerender } = render(
      <Sound
        src={httpSource}
        status="playing"
        presentationGain={0.32}
        lowpassFrequency={680}
        presentationTransitionMs={1400}
      />,
    );
    const audio = document.querySelector('audio');

    expect(gains[0].gain.linearRampToValueAtTime).toHaveBeenCalledWith(
      0.32,
      1.4,
    );
    expect(
      filters[0].frequency.exponentialRampToValueAtTime,
    ).toHaveBeenCalledWith(680, 1.4);

    rerender(
      <Sound
        src={httpSource}
        status="playing"
        presentationGain={1}
        lowpassFrequency={22_000}
        presentationTransitionMs={620}
      />,
    );

    expect(document.querySelector('audio')).toBe(audio);
    expect(gains[0].gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(
      1,
      0.62,
    );
    expect(
      filters[0].frequency.exponentialRampToValueAtTime,
    ).toHaveBeenLastCalledWith(22_000, 0.62);

    restore();
  });

  it('reports live spectrum levels from the playing audio graph', () => {
    const { analysers, restore } = setupAudioContextMock();
    let nextFrame: ((timestamp: number) => void) | undefined;
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: (timestamp: number) => void) => {
        nextFrame = callback;
        return 1;
      }),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const onVisualizationData = vi.fn();

    render(
      <Sound
        src={httpSource}
        status="playing"
        onVisualizationData={onVisualizationData}
      />,
    );

    expect(analysers).toHaveLength(1);
    act(() => {
      nextFrame?.(40);
    });

    const liveFrame = onVisualizationData.mock.calls.find(([levels]) =>
      levels.some((level: number) => level > 0),
    )?.[0] as readonly number[] | undefined;
    expect(liveFrame).toHaveLength(256);
    expect(liveFrame?.every((level) => level > 0)).toBe(true);

    vi.unstubAllGlobals();
    restore();
  });
});
