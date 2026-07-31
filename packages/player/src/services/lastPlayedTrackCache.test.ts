import { beforeEach, describe, expect, it } from 'vitest';

import { resetInMemoryTauriStore } from '../test/utils/inMemoryTauriStore';
import { createMockTrack } from '../test/utils/mockTrack';
import {
  cacheLastPlayedTrack,
  clearLastPlayedTrackCache,
  readLastPlayedTrack,
} from './lastPlayedTrackCache';

describe('lastPlayedTrackCache', () => {
  beforeEach(() => {
    resetInMemoryTauriStore();
  });

  it('stores only the most recently played track', async () => {
    await cacheLastPlayedTrack(createMockTrack('First'));
    await cacheLastPlayedTrack(createMockTrack('Last Played'));

    expect((await readLastPlayedTrack())?.title).toBe('Last Played');
  });

  it('removes the cached track after the intro consumes it', async () => {
    await cacheLastPlayedTrack(createMockTrack('Last Played'));
    await clearLastPlayedTrackCache();

    expect(await readLastPlayedTrack()).toBeUndefined();
  });
});
