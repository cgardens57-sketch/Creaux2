import { RefObject, useEffect } from 'react';

import { SoundStatus } from '../types';

export const usePlaybackStatus = (
  audioRef: RefObject<HTMLAudioElement | null>,
  status: SoundStatus,
  srcUrl: string,
  onError?: (error: Error) => void,
  suspended = false,
  playbackRequestId = 0,
) => {
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    if (suspended) {
      return;
    }

    const tryPlay = () => {
      if (!audio.paused) {
        return;
      }
      audio.play().then(undefined, (err: DOMException) => {
        if (err.name === 'AbortError') {
          return;
        }
        onError?.(err);
      });
    };

    switch (status) {
      case 'playing': {
        // HTMLMediaElement.play() is designed to wait for streaming data.
        // Requiring HAVE_FUTURE_DATA first can miss a canplay edge and strand
        // restored tracks in a permanently paused state.
        tryPlay();
        const onCanPlay = () => tryPlay();
        audio.addEventListener('canplay', onCanPlay);
        return () => audio.removeEventListener('canplay', onCanPlay);
      }
      case 'paused': {
        audio.pause();
        return;
      }
      case 'stopped': {
        audio.pause();
        audio.currentTime = 0;
        return;
      }
    }
  }, [status, srcUrl, audioRef, onError, suspended, playbackRequestId]);
};
