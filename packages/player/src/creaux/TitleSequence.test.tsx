import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  TITLE_SEQUENCE_READY_MS,
  TitleLoadingScreen,
  TitleSequence,
} from './TitleSequence';

describe('TitleSequence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('shows a dedicated audio preparation state before the choreography', () => {
    render(<TitleLoadingScreen />);

    expect(
      screen.getByRole('status', {
        name: 'Preparing the last played song',
      }),
    ).toHaveTextContent('Synchronizing last signal');
    expect(
      screen.queryByText(/preparing audio|seamless opening/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('application', {
        name: 'Creaux2 title screen',
      }),
    ).not.toBeInTheDocument();
  });

  it('shows real silent-preroll progress and dissolves into the title', () => {
    render(
      <TitleLoadingScreen
        exiting
        isWarming
        progressSeconds={2.5}
        targetSeconds={5}
      />,
    );

    const loader = screen.getByRole('status', {
      name: 'Silently preparing the opening song',
    });
    expect(loader).toHaveClass('is-warming', 'is-exiting');
    expect(loader).toHaveTextContent('SILENT PREROLL 2.5 / 5.0');
    expect(loader).toHaveStyle('--cx-title-warmup-progress: 0.5');
  });

  it('reveals the menu after the complete title choreography', () => {
    const onReady = vi.fn();
    render(<TitleSequence onReady={onReady} onEnter={vi.fn()} />);

    expect(
      screen.getByRole('button', { name: 'Enter observatory' }),
    ).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(TITLE_SEQUENCE_READY_MS);
    });

    expect(
      screen
        .getByRole('button', { name: 'Enter observatory' })
        .closest('.cx-title-sequence'),
    ).toHaveClass('is-ready');
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('waits for the menu before accepting Enter, then supports keyboard selection', () => {
    const onPrepare = vi.fn();
    const onEnter = vi.fn();
    render(<TitleSequence onPrepare={onPrepare} onEnter={onEnter} />);
    const titleScreen = screen.getByRole('application', {
      name: 'Creaux2 title screen',
    });

    fireEvent.keyDown(titleScreen, { key: 'Enter' });
    expect(titleScreen).not.toHaveClass('is-ready', 'is-leaving');
    expect(onEnter).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(TITLE_SEQUENCE_READY_MS);
    });

    fireEvent.keyDown(titleScreen, { key: 'ArrowDown' });
    expect(screen.getByRole('button', { name: 'System settings' })).toHaveClass(
      'is-selected',
    );

    fireEvent.keyDown(titleScreen, { key: 'Enter' });
    expect(titleScreen).toHaveClass('is-leaving');
    expect(onPrepare).toHaveBeenCalledWith('interface');
    expect(onEnter).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(620);
    });

    expect(onEnter).toHaveBeenCalledWith('interface');
  });
});
