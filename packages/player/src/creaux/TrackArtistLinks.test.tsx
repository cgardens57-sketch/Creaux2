import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Track } from '@nuclearplayer/model';

import { artistCreditContext, TrackArtistLinks } from './TrackArtistLinks';

const track = {
  title: 'Signal Bloom',
  source: { provider: 'discogs', id: 'track-1' },
  artists: [
    {
      name: 'Aster Vale',
      roles: ['primary'],
      source: { provider: 'discogs', id: 'artist-21' },
    },
    {
      name: 'Mira Sol',
      roles: ['featured'],
    },
  ],
} as Track;

describe('TrackArtistLinks', () => {
  it('preserves the credited artist and originating track when selected', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onParentClick = vi.fn();

    render(
      <div onClick={onParentClick}>
        <TrackArtistLinks track={track} onSelect={onSelect} />
      </div>,
    );

    await user.click(
      screen.getByRole('button', {
        name: 'Open Aster Vale, primary artist on Signal Bloom',
      }),
    );

    expect(onSelect).toHaveBeenCalledWith({
      artist: track.artists[0],
      track,
    });
    expect(onParentClick).not.toHaveBeenCalled();
  });

  it('labels each name with its contextual contribution', () => {
    render(<TrackArtistLinks track={track} onSelect={vi.fn()} />);

    expect(
      screen.getByRole('button', {
        name: 'Open Mira Sol, featured artist on Signal Bloom',
      }),
    ).toBeInTheDocument();
    expect(artistCreditContext({ name: 'K', roles: ['composer'] })).toBe(
      'composer',
    );
  });
});
