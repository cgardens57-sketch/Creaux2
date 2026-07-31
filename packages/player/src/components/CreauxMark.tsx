import { FC } from 'react';

import { cn } from '@nuclearplayer/ui';

type CreauxMarkProps = {
  compact?: boolean;
  className?: string;
};

export const CreauxMark: FC<CreauxMarkProps> = ({
  compact = false,
  className,
}) => (
  <div className={cn('creaux-mark', compact && 'is-compact', className)}>
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id="creaux-mark-edge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3fbff" />
          <stop offset="0.46" stopColor="#7cd9ff" />
          <stop offset="1" stopColor="#ad82ff" />
        </linearGradient>
      </defs>
      <path
        d="M24 2.8 43.2 24 24 45.2 4.8 24 24 2.8Z"
        fill="none"
        stroke="url(#creaux-mark-edge)"
        strokeWidth="1.2"
      />
      <path
        d="m24 8.5 10.4 15.2L24 39.5 13.6 23.7 24 8.5Z"
        fill="rgba(104,211,255,.08)"
        stroke="rgba(225,247,255,.72)"
        strokeWidth=".8"
      />
      <path d="M7 24h34M24 4v40M13.6 23.7 34.4 23.7" stroke="rgba(164,222,255,.34)" strokeWidth=".6" />
      <circle cx="24" cy="24" r="2.4" fill="#f3fbff" />
    </svg>
    {!compact && (
      <span>
        <strong>Creaux2</strong>
        <small>listening observatory</small>
      </span>
    )}
  </div>
);
