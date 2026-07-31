import type { FC, PropsWithChildren } from 'react';
import { useCallback, useEffect, useRef } from 'react';

import {
  LoggerProvider,
  Sound,
  SoundError,
  type AudioSource,
} from '@nuclearplayer/hifi';
import type { TFunction } from '@nuclearplayer/i18n';
import { useTranslation } from '@nuclearplayer/i18n';
import type { Track } from '@nuclearplayer/model';

import { useCoreSetting } from '../hooks/useCoreSetting';
import { eventBus } from '../services/eventBus';
import { Logger } from '../services/logger';
import { useAudioVisualizerStore } from '../stores/audioVisualizerStore';
import { useQueueStore } from '../stores/queueStore';
import { useSoundStore } from '../stores/soundStore';
import { errorMessage } from '../utils/errorMessage';

export type SoundPresentation = {
  gain: number;
  lowpassFrequency: number;
  transitionMs: number;
};

export const usePresentedAudioSource = ({
  lockSource,
  src,
  srcItemId,
}: {
  lockSource: boolean;
  src: AudioSource | null;
  srcItemId: string | null;
}): AudioSource | null => {
  const presentedSourceRef = useRef(src);
  const protectedItemIdRef = useRef<string | null>(null);

  if (lockSource) {
    if (!presentedSourceRef.current && src) {
      presentedSourceRef.current = src;
    }
    if (presentedSourceRef.current && srcItemId) {
      protectedItemIdRef.current = srcItemId;
    }
  } else if (
    !protectedItemIdRef.current ||
    protectedItemIdRef.current !== srcItemId
  ) {
    presentedSourceRef.current = src;
    protectedItemIdRef.current = null;
  }

  return presentedSourceRef.current;
};

const describePlaybackError = (error: Error, t: TFunction): string => {
  if (error instanceof SoundError) {
    return t(`errors.hifi.${error.code}`, { details: error.details });
  }
  return errorMessage(error);
};

export const SoundProvider: FC<
  PropsWithChildren<{
    lockSource?: boolean;
    presentation?: SoundPresentation;
    onCanPlay?: () => void;
    onTrackPlaying?: (track: Track) => void;
  }>
> = ({
  children,
  lockSource = false,
  presentation,
  onCanPlay,
  onTrackPlaying,
}) => {
  const { t } = useTranslation('streaming');
  const { src, srcItemId, status, seek, transitioning, playbackRequestId } =
    useSoundStore();
  const [crossfadeMs] = useCoreSetting<number>('playback.crossfadeMs');
  const preload: HTMLAudioElement['preload'] = 'auto';
  const crossOrigin = '' as const;
  const [volume01] = useCoreSetting<number>('playback.volume');
  const [muted] = useCoreSetting<boolean>('playback.muted');
  const [exceedVolumeLimit] = useCoreSetting<boolean>(
    'playback.exceedVolumeLimit',
  );
  const [volumeBoost] = useCoreSetting<number>('playback.volumeBoost');
  const volumePercent = muted ? 0 : Math.round((volume01 ?? 1) * 100);
  const amplification = exceedVolumeLimit
    ? Math.max(1, Math.min(2, volumeBoost ?? 1.25))
    : 1;
  const updateVisualization = useAudioVisualizerStore((state) => state.update);
  const resetVisualization = useAudioVisualizerStore((state) => state.reset);
  const presentedSource = usePresentedAudioSource({
    lockSource,
    src,
    srcItemId,
  });

  useEffect(() => {
    LoggerProvider.init(Logger.streaming);
  }, []);

  useEffect(() => {
    if (crossfadeMs !== undefined) {
      useSoundStore.getState().setCrossfadeMs(crossfadeMs);
    }
  }, [crossfadeMs]);

  useEffect(
    () => () => {
      resetVisualization();
    },
    [resetVisualization],
  );

  const startedItemId = useRef<string | null>(null);

  useEffect(() => {
    const isResumingMidTrack = src?.startPositionSeconds !== undefined;
    if (!isResumingMidTrack) {
      startedItemId.current = null;
    }
  }, [src]);

  const handleTimeUpdate = useCallback(
    ({ position, duration }: { position: number; duration: number }) => {
      useSoundStore.getState().updatePlayback(position, duration);
    },
    [],
  );

  const handleEnd = useCallback(() => {
    const currentTrack = useQueueStore.getState().getCurrentItem()?.track;
    if (currentTrack) {
      eventBus.emit('trackFinished', currentTrack);
    }

    useQueueStore.getState().advanceOnTrackEnd();
  }, []);

  const handleCanPlay = useCallback(() => {
    const currentItem = useQueueStore.getState().getCurrentItem();
    if (currentItem) {
      useQueueStore
        .getState()
        .updateItemState(currentItem.id, { status: 'success' });
      if (startedItemId.current !== currentItem.id) {
        startedItemId.current = currentItem.id;
        eventBus.emit('trackStarted', currentItem.track);
      }
    }
    onCanPlay?.();
  }, [onCanPlay]);

  const handlePlaying = useCallback(() => {
    const currentTrack = useQueueStore.getState().getCurrentItem()?.track;
    if (currentTrack) {
      onTrackPlaying?.(currentTrack);
    }
  }, [onTrackPlaying]);

  const handleSourceInvalid = useCallback(() => {
    const currentTrack = useQueueStore.getState().getCurrentItem()?.track;
    if (currentTrack) {
      eventBus.emit('streamSourceInvalid', currentTrack);
    }
  }, []);

  const handleError = useCallback(
    (error: Error) => {
      const message = describePlaybackError(error, t);
      Logger.streaming.error(`Playback error: ${message}`);

      const currentItem = useQueueStore.getState().getCurrentItem();
      if (currentItem) {
        useQueueStore
          .getState()
          .updateItemState(currentItem.id, { status: 'error', error: message });
      }
    },
    [t],
  );

  return (
    <>
      {presentedSource && (
        <Sound
          src={presentedSource}
          status={status}
          seek={seek}
          transitioning={transitioning}
          playbackRequestId={playbackRequestId}
          volume={volumePercent}
          amplification={amplification}
          presentationGain={presentation?.gain}
          lowpassFrequency={presentation?.lowpassFrequency}
          presentationTransitionMs={presentation?.transitionMs}
          preload={preload}
          crossOrigin={crossOrigin}
          onTimeUpdate={handleTimeUpdate}
          onEnd={handleEnd}
          onCanPlay={handleCanPlay}
          onPlaying={handlePlaying}
          onError={handleError}
          onSourceInvalid={handleSourceInvalid}
          onVisualizationData={updateVisualization}
        />
      )}
      {children}
    </>
  );
};
