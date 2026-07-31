import { LazyStore } from '@tauri-apps/plugin-store';

import type { Track } from '@nuclearplayer/model';
import { stripResolutionState } from '@nuclearplayer/model';

import { Logger } from './logger';
import { errorMessage } from '../utils/errorMessage';

const CACHE_FILE = 'last-played.json';
const TRACK_KEY = 'track';

const isTrack = (value: unknown): value is Track => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<Track>;
  return (
    typeof candidate.title === 'string' &&
    Array.isArray(candidate.artists) &&
    typeof candidate.source?.provider === 'string' &&
    typeof candidate.source.id === 'string'
  );
};

const store = new LazyStore(CACHE_FILE);
let persistenceTask: Promise<void> = Promise.resolve();

const enqueue = (operation: () => Promise<void>): Promise<void> => {
  persistenceTask = persistenceTask
    .catch(() => undefined)
    .then(operation)
    .catch((error) => {
      Logger.playback.error(
        `Failed to update last-played cache: ${errorMessage(error)}`,
      );
    });
  return persistenceTask;
};

export const readLastPlayedTrack = async (): Promise<Track | undefined> => {
  try {
    const value = await store.get<unknown>(TRACK_KEY);
    return isTrack(value) ? stripResolutionState(value) : undefined;
  } catch (error) {
    Logger.playback.error(
      `Failed to read last-played cache: ${errorMessage(error)}`,
    );
    return undefined;
  }
};

export const cacheLastPlayedTrack = (track: Track): Promise<void> => {
  const snapshot = stripResolutionState(track);
  return enqueue(async () => {
    await store.set(TRACK_KEY, snapshot);
    await store.save();
  });
};

export const clearLastPlayedTrackCache = (): Promise<void> =>
  enqueue(async () => {
    await store.delete(TRACK_KEY);
    await store.save();
  });
