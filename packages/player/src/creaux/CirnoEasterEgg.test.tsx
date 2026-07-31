import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CirnoEasterEgg } from './CreauxApp';

describe('CirnoEasterEgg', () => {
  beforeEach(() => {
    vi.mocked(window.HTMLMediaElement.prototype.play).mockClear();
  });

  it('plays the introduction once, synchronizes dialogue, then uses droplet interactions', async () => {
    const onIntroduce = vi.fn();
    const { container, rerender } = render(
      <CirnoEasterEgg introduced={false} onIntroduce={onIntroduce} />,
    );
    const voice = container.querySelector<HTMLAudioElement>(
      '[data-cirno-audio="introduction"]',
    );
    const droplet = container.querySelector<HTMLAudioElement>(
      '[data-cirno-audio="droplet"]',
    );
    const voicePlay = vi.fn().mockResolvedValue(undefined);
    const dropletPlay = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(voice, 'play', {
      configurable: true,
      value: voicePlay,
    });
    Object.defineProperty(droplet, 'play', {
      configurable: true,
      value: dropletPlay,
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Meet the hidden Cirno' }),
    );
    expect(voicePlay).toHaveBeenCalledTimes(1);
    expect(onIntroduce).not.toHaveBeenCalled();

    fireEvent.playing(voice as HTMLAudioElement);
    expect(onIntroduce).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent(
      'あたいはチルノ！幻想郷でいちばん最高で、クールで、最強の氷の妖精だよ！',
    );

    fireEvent.ended(voice as HTMLAudioElement);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    rerender(<CirnoEasterEgg introduced onIntroduce={onIntroduce} />);
    fireEvent.click(screen.getByRole('button', { name: 'Poke Cirno' }));

    expect(dropletPlay).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(
        container.querySelector('.cx-cirno-click-pulse'),
      ).toBeInTheDocument();
    });
    expect(onIntroduce).toHaveBeenCalledTimes(1);
  });

  it('deepens the droplet after ten pokes and summons Remilia on poke twenty', () => {
    const onBossTrigger = vi.fn();
    const onPoke = vi.fn();
    const { container } = render(
      <CirnoEasterEgg
        introduced
        onIntroduce={vi.fn()}
        onPoke={onPoke}
        onBossTrigger={onBossTrigger}
      />,
    );
    const droplet = container.querySelector<HTMLAudioElement>(
      '[data-cirno-audio="droplet"]',
    );
    const dropletPlay = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(droplet, 'play', {
      configurable: true,
      value: dropletPlay,
    });
    const cirno = screen.getByRole('button', { name: 'Poke Cirno' });

    for (let count = 0; count < 20; count += 1) {
      fireEvent.click(cirno);
    }
    fireEvent.click(cirno);

    expect(onPoke).toHaveBeenCalledTimes(20);
    expect(onPoke).toHaveBeenLastCalledWith(20);
    expect(dropletPlay).toHaveBeenCalledTimes(19);
    expect(droplet?.playbackRate).toBeCloseTo(0.505, 3);
    expect(onBossTrigger).toHaveBeenCalledTimes(1);
  });

  it('keeps the resolved encounter dormant for the rest of the app session', () => {
    const onBossTrigger = vi.fn();
    const onPoke = vi.fn();
    const { container } = render(
      <CirnoEasterEgg
        introduced
        pokeCount={20}
        onIntroduce={vi.fn()}
        onPoke={onPoke}
        onBossTrigger={onBossTrigger}
        bossResolved
      />,
    );
    const droplet = container.querySelector<HTMLAudioElement>(
      '[data-cirno-audio="droplet"]',
    );
    const dropletPlay = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(droplet, 'play', {
      configurable: true,
      value: dropletPlay,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Poke Cirno' }));

    expect(onPoke).toHaveBeenCalledWith(21);
    expect(onBossTrigger).not.toHaveBeenCalled();
    expect(dropletPlay).toHaveBeenCalledTimes(1);
    expect(droplet?.playbackRate).toBeCloseTo(0.505, 3);
  });
});
