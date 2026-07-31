import { LazyStore } from '@tauri-apps/plugin-store';
import { produce } from 'immer';
import partition from 'lodash-es/partition';
import { v4 as uuidv4 } from 'uuid';
import { create } from 'zustand';

import type {
  Queue,
  QueueItem,
  StreamCandidate,
  Track,
} from '@nuclearplayer/model';
import { stripResolutionState } from '@nuclearplayer/model';

import { eventBus } from '../services/eventBus';
import { Logger } from '../services/logger';
import { errorMessage } from '../utils/errorMessage';
import { secondsToMs } from '../utils/time';
import { getSetting } from './settingsStore';
import { useSoundStore } from './soundStore';

const QUEUE_FILE = 'queue.json';
const store = new LazyStore(QUEUE_FILE);
const CURRENT_ITEM_ID_KEY = 'queue.currentItemId';

type QueuePersistenceSnapshot = {
  items: QueueItem[];
  currentIndex: number;
  currentItemId?: string;
};

let pendingSnapshot: QueuePersistenceSnapshot | undefined;
let persistenceTask: Promise<void> | undefined;

type QueueStore = Queue & {
  isLoading: boolean;
  isReady: boolean;
  loadFromDisk: () => Promise<void>;
  restoreLastPlayedTrack: (track: Track) => void;
  addToQueue: (tracks: Track[]) => void;
  addNext: (tracks: Track[]) => void;
  addAt: (tracks: Track[], index: number) => void;
  removeByIds: (ids: string[]) => void;
  removeByIndices: (indices: number[]) => void;
  clearQueue: () => void;
  reorder: (fromIndex: number, toIndex: number) => void;
  updateItemState: (id: string, updates: Partial<QueueItem>) => void;
  updateCandidate: (itemId: string, candidate: StreamCandidate) => void;
  removeCandidate: (itemId: string, candidateId: string) => void;
  selectCandidate: (itemId: string, candidateId: string) => void;
  goToNext: () => void;
  goToPrevious: () => void;
  advanceOnTrackEnd: () => void;
  goToIndex: (index: number) => void;
  goToId: (id: string) => void;
  getCurrentItem: () => QueueItem | undefined;
  getItemById: (id: string) => QueueItem | undefined;
};

const createQueueItem = (track: Track): QueueItem => ({
  id: uuidv4(),
  track: stripResolutionState(track),
  status: 'idle',
  addedAtIso: new Date().toISOString(),
});

const getDirectionalIndex = (
  state: Pick<QueueStore, 'items' | 'currentIndex'>,
  direction: 'forward' | 'backward',
): number => {
  const { items, currentIndex } = state;
  const shuffleEnabled =
    (getSetting('core.playback.shuffle') as boolean) ?? false;
  const repeatMode = (getSetting('core.playback.repeat') as string) ?? 'off';

  if (items.length === 0) {
    return currentIndex;
  }

  if (shuffleEnabled) {
    return getShuffledIndex(items.length, currentIndex);
  }

  if (direction === 'forward') {
    if (currentIndex < items.length - 1) {
      return currentIndex + 1;
    }
    return repeatMode === 'all' ? 0 : currentIndex;
  }

  if (currentIndex > 0) {
    return currentIndex - 1;
  }

  return repeatMode === 'all' ? items.length - 1 : currentIndex;
};

const getShuffledIndex = (length: number, currentIndex: number): number => {
  if (length <= 1) {
    return currentIndex;
  }

  let nextIndex = currentIndex;
  while (nextIndex === currentIndex) {
    nextIndex = Math.floor(Math.random() * length);
  }

  return nextIndex;
};

const emitSkip = (): void => {
  eventBus.emit('playbackSkipped', {
    positionMs: secondsToMs(useSoundStore.getState().seek),
  });
};

const writePendingSnapshots = async (): Promise<void> => {
  while (pendingSnapshot) {
    const snapshot = pendingSnapshot;
    pendingSnapshot = undefined;

    try {
      await store.set('queue.items', snapshot.items);
      await store.set('queue.currentIndex', snapshot.currentIndex);
      await store.set(CURRENT_ITEM_ID_KEY, snapshot.currentItemId ?? null);
      await store.save();
    } catch (error) {
      Logger.queue.error(`Failed to save queue: ${errorMessage(error)}`);
    }
  }
};

const saveToDisk = (): Promise<void> => {
  const state = useQueueStore.getState();
  pendingSnapshot = {
    items: state.items,
    currentIndex: state.currentIndex,
    currentItemId: state.getCurrentItem()?.id,
  };

  if (!persistenceTask) {
    persistenceTask = writePendingSnapshots().finally(() => {
      persistenceTask = undefined;
      if (pendingSnapshot) {
        void saveToDisk();
      }
    });
  }

  return persistenceTask;
};

const withPersistence = <T extends unknown[]>(
  fn: (...args: T) => void,
): ((...args: T) => void) => {
  return (...args: T) => {
    fn(...args);
    void saveToDisk();
  };
};

export const useQueueStore = create<QueueStore>((set, get) => ({
  items: [],
  currentIndex: 0,
  isReady: false,
  isLoading: false,

  loadFromDisk: async () => {
    set({ isLoading: true });
    const items = (await store.get<QueueItem[]>('queue.items')) ?? [];
    const currentIndex = (await store.get<number>('queue.currentIndex')) ?? 0;
    const currentItemId = await store.get<string>(CURRENT_ITEM_ID_KEY);

    const itemIdIndex = currentItemId
      ? items.findIndex((item) => item.id === currentItemId)
      : -1;
    const sanitizedIndex =
      itemIdIndex >= 0
        ? itemIdIndex
        : currentIndex >= 0 && currentIndex < items.length
          ? currentIndex
          : 0;

    const resetItems = items.map((item) => ({
      ...item,
      status: 'idle' as const,
      error: undefined,
    }));

    set({
      items: resetItems,
      currentIndex: sanitizedIndex,
      isReady: true,
      isLoading: false,
    });

    Logger.queue.info(`Loaded ${resetItems.length} items from disk`);
  },

  restoreLastPlayedTrack: (track: Track) => {
    const restoredTrack = stripResolutionState(track);
    const existingIndex = get().items.findIndex(
      (item) =>
        item.track.source.provider === restoredTrack.source.provider &&
        item.track.source.id === restoredTrack.source.id,
    );

    if (existingIndex >= 0) {
      set({ currentIndex: existingIndex });
      return;
    }

    set(
      produce((state: QueueStore) => {
        state.items.push(createQueueItem(restoredTrack));
        state.currentIndex = state.items.length - 1;
      }),
    );
  },

  addToQueue: withPersistence((tracks: Track[]) => {
    set(
      produce((state: QueueStore) => {
        const newItems = tracks.map(createQueueItem);
        state.items.push(...newItems);
      }),
    );
    Logger.queue.debug(`Added ${tracks.length} tracks to queue`);
  }),

  addNext: (tracks: Track[]) => {
    const { currentIndex } = get();
    get().addAt(tracks, currentIndex + 1);
  },

  addAt: withPersistence((tracks: Track[], index: number) => {
    set(
      produce((state: QueueStore) => {
        const newItems = tracks.map(createQueueItem);
        state.items.splice(index, 0, ...newItems);
        if (index <= state.currentIndex) {
          state.currentIndex += newItems.length;
        }
      }),
    );
  }),

  removeByIds: withPersistence((ids: string[]) => {
    const currentItem = get().getCurrentItem();
    const currentItemRemoved = currentItem && ids.includes(currentItem.id);

    set(
      produce((state: QueueStore) => {
        const idsSet = new Set(ids);
        const removedBeforeCurrent = state.items
          .slice(0, state.currentIndex)
          .filter((item) => idsSet.has(item.id)).length;

        state.items = state.items.filter((item) => !idsSet.has(item.id));
        state.currentIndex = Math.max(
          0,
          state.currentIndex - removedBeforeCurrent,
        );

        if (state.currentIndex >= state.items.length) {
          state.currentIndex = Math.max(0, state.items.length - 1);
        }
      }),
    );

    if (get().items.length === 0) {
      useSoundStore.getState().stop();
    } else if (currentItemRemoved) {
      useSoundStore.getState().beginTransition();
    }
  }),

  removeByIndices: withPersistence((indices: number[]) => {
    const currentIndex = get().currentIndex;
    const currentIndexRemoved = indices.includes(currentIndex);

    set(
      produce((state: QueueStore) => {
        const indicesSet = new Set(indices);
        const removedBeforeCurrent = indices.filter(
          (idx) => idx < state.currentIndex,
        ).length;

        state.items = state.items.filter((_, idx) => !indicesSet.has(idx));
        state.currentIndex = Math.max(
          0,
          state.currentIndex - removedBeforeCurrent,
        );

        if (state.currentIndex >= state.items.length) {
          state.currentIndex = Math.max(0, state.items.length - 1);
        }
      }),
    );

    if (get().items.length === 0) {
      useSoundStore.getState().stop();
    } else if (currentIndexRemoved) {
      useSoundStore.getState().beginTransition();
    }
  }),

  clearQueue: withPersistence(() => {
    const itemCount = get().items.length;
    set({ items: [], currentIndex: 0 });
    useSoundStore.getState().stop();
    Logger.queue.info(`Cleared queue (${itemCount} items removed)`);
  }),

  reorder: withPersistence((fromIndex: number, toIndex: number) => {
    set(
      produce((state: QueueStore) => {
        const [movedItem] = state.items.splice(fromIndex, 1);
        state.items.splice(toIndex, 0, movedItem);

        if (state.currentIndex === fromIndex) {
          state.currentIndex = toIndex;
        } else if (
          fromIndex < state.currentIndex &&
          toIndex >= state.currentIndex
        ) {
          state.currentIndex -= 1;
        } else if (
          fromIndex > state.currentIndex &&
          toIndex <= state.currentIndex
        ) {
          state.currentIndex += 1;
        }
      }),
    );
  }),

  updateItemState: withPersistence(
    (id: string, updates: Partial<QueueItem>) => {
      set(
        produce((state: QueueStore) => {
          const item = state.items.find((item) => item.id === id);
          if (item) {
            Object.assign(item, updates);
          }
        }),
      );
    },
  ),

  updateCandidate: (itemId: string, candidate: StreamCandidate) => {
    const item = get().getItemById(itemId);
    if (!item) {
      return;
    }
    const { track } = item;
    get().updateItemState(itemId, {
      track: {
        ...track,
        streamCandidates: track.streamCandidates?.map((current) => {
          if (current.id === candidate.id) {
            return candidate;
          }
          return current;
        }),
      },
    });
  },

  removeCandidate: (itemId: string, candidateId: string) => {
    const item = get().getItemById(itemId);
    if (!item) {
      return;
    }
    const { track } = item;
    get().updateItemState(itemId, {
      track: {
        ...track,
        streamCandidates: track.streamCandidates?.filter(
          (current) => current.id !== candidateId,
        ),
      },
    });
  },

  selectCandidate: (itemId: string, candidateId: string) => {
    const item = get().getItemById(itemId);
    if (!item) {
      return;
    }
    const { track } = item;
    const [selected, rest] = partition(
      track.streamCandidates ?? [],
      (candidate) => candidate.id === candidateId,
    );
    const retried = selected.map((candidate) => ({
      ...candidate,
      failed: false,
    }));
    get().updateItemState(itemId, {
      track: { ...track, streamCandidates: [...retried, ...rest] },
    });
  },

  goToNext: withPersistence(() => {
    const state = get();
    const nextIndex = getDirectionalIndex(state, 'forward');
    if (nextIndex !== state.currentIndex) {
      emitSkip();
      useSoundStore.getState().beginTransition();
      set({ currentIndex: nextIndex });
      Logger.queue.debug(`Moved to next track (index ${nextIndex})`);
    }
  }),

  goToPrevious: withPersistence(() => {
    const state = get();
    const previousIndex = getDirectionalIndex(state, 'backward');
    if (previousIndex !== state.currentIndex) {
      emitSkip();
      useSoundStore.getState().beginTransition();
      set({ currentIndex: previousIndex });
      Logger.queue.debug(`Moved to previous track (index ${previousIndex})`);
    }
  }),

  advanceOnTrackEnd: () => {
    const repeatMode = (getSetting('core.playback.repeat') as string) ?? 'off';

    if (repeatMode === 'one') {
      const sound = useSoundStore.getState();
      sound.seekTo(0);
      sound.play();
      const currentTrack = get().getCurrentItem()?.track;
      if (currentTrack) {
        eventBus.emit('trackStarted', currentTrack);
      }
      return;
    }

    const currentIndex = get().currentIndex;
    get().goToNext();
    if (get().currentIndex === currentIndex) {
      const sound = useSoundStore.getState();
      if (repeatMode === 'all' && get().items.length === 1) {
        sound.seekTo(0);
        sound.play();
        const currentTrack = get().getCurrentItem()?.track;
        if (currentTrack) {
          eventBus.emit('trackStarted', currentTrack);
        }
      } else {
        sound.stop();
      }
    }
  },

  goToIndex: withPersistence((index: number) => {
    const { items, currentIndex } = get();
    if (index >= 0 && index < items.length && index !== currentIndex) {
      emitSkip();
      useSoundStore.getState().beginTransition();
      set({ currentIndex: index });
    }
  }),

  goToId: withPersistence((id: string) => {
    const { items, currentIndex } = get();
    const index = items.findIndex((item) => item.id === id);
    if (index !== -1 && index !== currentIndex) {
      emitSkip();
      useSoundStore.getState().beginTransition();
      set({ currentIndex: index });
    }
  }),

  getCurrentItem: () => {
    const { items, currentIndex } = get();
    return items[currentIndex];
  },

  getItemById: (id: string) => {
    return get().items.find((item) => item.id === id);
  },
}));

export const initializeQueueStore = async (): Promise<void> => {
  await useQueueStore.getState().loadFromDisk();
};
