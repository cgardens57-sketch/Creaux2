import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  REMILIA_DIALOGUE_LINES,
  RemiliaBossSequence,
} from './RemiliaBossSequence';

vi.mock('./RemiliaBossGame', () => ({
  RemiliaBossGame: ({
    onVictory,
    onDefeat,
  }: {
    onVictory: () => void;
    onDefeat: () => void;
  }) => (
    <div aria-label="Test Remilia fight">
      <button onClick={onVictory}>Win test fight</button>
      <button onClick={onDefeat}>Lose test fight</button>
    </div>
  ),
}));

const advanceToFight = async () => {
  for (const duration of [1650, 2050, 5600]) {
    await act(async () => {
      vi.advanceTimersByTime(duration);
      await Promise.resolve();
    });
  }
};

describe('RemiliaBossSequence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('AudioContext', undefined);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('fades from the breach into Remilia and presents the VN dialogue line by line', async () => {
    const { container } = render(
      <RemiliaBossSequence onComplete={vi.fn()} onDefeat={vi.fn()} />,
    );
    const theme = container.querySelector<HTMLAudioElement>(
      '[data-remilia-audio="theme"]',
    );
    const themePlay = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(theme, 'play', {
      configurable: true,
      value: themePlay,
    });

    expect(
      screen.getByLabelText('Remilia Fumo hidden boss encounter'),
    ).toHaveAttribute('data-phase', 'breach');

    await act(async () => {
      vi.advanceTimersByTime(1650);
      await Promise.resolve();
    });
    expect(
      screen.getByLabelText('Remilia Fumo hidden boss encounter'),
    ).toHaveAttribute('data-phase', 'reveal');
    expect(themePlay).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(2050);
      await Promise.resolve();
    });
    expect(screen.getByRole('dialog')).toHaveTextContent(
      REMILIA_DIALOGUE_LINES[0],
    );
    expect(screen.getByRole('dialog')).toHaveTextContent(
      REMILIA_DIALOGUE_LINES[1],
    );
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'レミリア・スカーレット',
    );
  });

  it('finishes through the victory hit, voice line, and one completion callback', async () => {
    const onComplete = vi.fn();
    const { container } = render(
      <RemiliaBossSequence onComplete={onComplete} onDefeat={vi.fn()} />,
    );
    const theme = container.querySelector<HTMLAudioElement>(
      '[data-remilia-audio="theme"]',
    )!;
    const victory = container.querySelector<HTMLAudioElement>(
      '[data-remilia-audio="victory"]',
    )!;
    Object.defineProperty(theme, 'play', {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
    Object.defineProperty(victory, 'play', {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });

    await advanceToFight();
    fireEvent.click(screen.getByRole('button', { name: 'Win test fight' }));
    expect(
      screen.getByLabelText('Remilia Fumo hidden boss encounter'),
    ).toHaveAttribute('data-phase', 'victory');

    await act(async () => {
      vi.advanceTimersByTime(900);
      await Promise.resolve();
    });
    expect(
      screen.getByLabelText('Remilia Fumo hidden boss encounter'),
    ).toHaveAttribute('data-phase', 'epilogue');
    expect(victory.play).toHaveBeenCalledTimes(1);

    fireEvent.ended(victory);
    act(() => vi.advanceTimersByTime(850));
    expect(onComplete).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(12_000));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('runs the defeat presentation before requesting an app close', async () => {
    const onDefeat = vi.fn();
    const { container } = render(
      <RemiliaBossSequence onComplete={vi.fn()} onDefeat={onDefeat} />,
    );
    const theme = container.querySelector<HTMLAudioElement>(
      '[data-remilia-audio="theme"]',
    )!;
    Object.defineProperty(theme, 'play', {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });

    await advanceToFight();
    fireEvent.click(screen.getByRole('button', { name: 'Lose test fight' }));
    expect(
      screen.getByLabelText('Remilia Fumo hidden boss encounter'),
    ).toHaveAttribute('data-phase', 'defeat');

    act(() => vi.advanceTimersByTime(4299));
    expect(onDefeat).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onDefeat).toHaveBeenCalledTimes(1);
  });

  it('cancels pending defeat work when the app closes and starts fresh on a new mount', async () => {
    const onDefeat = vi.fn();
    const first = render(
      <RemiliaBossSequence onComplete={vi.fn()} onDefeat={onDefeat} />,
    );
    const theme = first.container.querySelector<HTMLAudioElement>(
      '[data-remilia-audio="theme"]',
    )!;
    Object.defineProperty(theme, 'play', {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });

    await advanceToFight();
    fireEvent.click(screen.getByRole('button', { name: 'Lose test fight' }));
    first.unmount();
    act(() => vi.advanceTimersByTime(4300));
    expect(onDefeat).not.toHaveBeenCalled();

    render(<RemiliaBossSequence onComplete={vi.fn()} onDefeat={vi.fn()} />);
    expect(
      screen.getByLabelText('Remilia Fumo hidden boss encounter'),
    ).toHaveAttribute('data-phase', 'breach');
  });
});
