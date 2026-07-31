import { useEffect, useRef } from 'react';

import type { QueueItem } from '@nuclearplayer/model';

import { providersHost } from '../services/providersHost';
import { streamResolution } from '../services/streamResolution';
import { hasActiveStreamingProvider } from '../services/streamingHost';
import { useQueueStore } from '../stores/queueStore';
import { useSoundStore } from '../stores/soundStore';
import { useStreamRecovery } from './useStreamRecovery';

const buildResolutionKey = (item: QueueItem): string => {
  const headCandidate = item.track.streamCandidates?.[0];
  return [item.id, headCandidate?.id, headCandidate?.failed].join(':');
};

export const useStreamResolution = (): void => {
  const resolutionKeyRef = useRef<string | null>(null);
  const isFirstResolutionRef = useRef(true);

  useStreamRecovery();

  useEffect(() => {
    const onCurrentItemChanged = (currentItem: QueueItem | undefined): void => {
      if (!currentItem) {
        return;
      }

      const resolutionKey = buildResolutionKey(currentItem);
      if (resolutionKey === resolutionKeyRef.current) {
        return;
      }

      if (currentItem.status === 'loading') {
        resolutionKeyRef.current = resolutionKey;
        return;
      }
      resolutionKeyRef.current = resolutionKey;

      const autoPlay =
        useSoundStore.getState().transitioning || !isFirstResolutionRef.current;
      isFirstResolutionRef.current = false;
      void streamResolution.resolve(currentItem, { autoPlay });
    };

    const unsubscribe = useQueueStore.subscribe((state) => {
      onCurrentItemChanged(state.getCurrentItem());
    });
    const unsubscribeProviders = providersHost.subscribe(() => {
      const currentItem = useQueueStore.getState().getCurrentItem();
      if (
        !currentItem ||
        currentItem.status === 'loading' ||
        useSoundStore.getState().src ||
        !hasActiveStreamingProvider()
      ) {
        return;
      }
      resolutionKeyRef.current = buildResolutionKey(currentItem);
      void streamResolution.resolve(currentItem, { autoPlay: false });
    });

    onCurrentItemChanged(useQueueStore.getState().getCurrentItem());

    return () => {
      unsubscribe();
      unsubscribeProviders();
    };
  }, []);
};
