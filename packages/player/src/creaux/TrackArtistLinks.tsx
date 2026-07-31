import type { FC, MouseEvent } from 'react';

import type { ArtistCredit, Track } from '@nuclearplayer/model';

export type TrackArtistSelection = {
  artist: ArtistCredit;
  track: Track;
};

const roleNames: Record<string, string> = {
  primary: 'primary artist',
  main: 'primary artist',
  performer: 'performing artist',
  featured: 'featured artist',
  featuring: 'featured artist',
  producer: 'producer',
  composer: 'composer',
  remixer: 'remixer',
  conductor: 'conductor',
};

export const artistCreditContext = (artist: ArtistCredit): string => {
  const roles = artist.roles
    .map((role) => roleNames[role.toLowerCase()] ?? role.toLowerCase())
    .filter((role, index, all) => all.indexOf(role) === index);
  return roles.length > 0 ? roles.join(', ') : 'credited artist';
};

export const TrackArtistLinks: FC<{
  track: Track;
  onSelect: (selection: TrackArtistSelection) => void;
  className?: string;
}> = ({ track, onSelect, className }) => {
  if (track.artists.length === 0) {
    return (
      <span className={`cx-track-artists ${className ?? ''}`}>
        Unknown artist
      </span>
    );
  }

  const selectArtist = (
    event: MouseEvent<HTMLButtonElement>,
    artist: ArtistCredit,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    onSelect({ artist, track });
  };

  return (
    <span className={`cx-track-artists ${className ?? ''}`}>
      {track.artists.map((artist, index) => (
        <span
          className="cx-artist-credit"
          key={`${artist.source?.provider ?? 'credit'}:${artist.source?.id ?? artist.name}:${index}`}
        >
          {index > 0 && (
            <span className="cx-artist-separator" aria-hidden="true">
              ,{' '}
            </span>
          )}
          <button
            type="button"
            className="cx-artist-link"
            aria-label={`Open ${artist.name}, ${artistCreditContext(artist)} on ${track.title}`}
            title={`${artist.name} · ${artistCreditContext(artist)} on “${track.title}”`}
            onClick={(event) => selectArtist(event, artist)}
          >
            {artist.name}
          </button>
        </span>
      ))}
    </span>
  );
};
