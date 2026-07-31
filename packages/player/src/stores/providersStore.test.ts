import { LazyStore } from '@tauri-apps/plugin-store';
import { beforeEach, describe, expect, it } from 'vitest';

import { resetInMemoryTauriStore } from '../test/utils/inMemoryTauriStore';
import {
  DEFAULT_ACTIVE_PROVIDERS,
  initializeProvidersStore,
  useProvidersStore,
} from './providersStore';

const STORE_FILE = 'active-providers.json';

describe('useProvidersStore', () => {
  beforeEach(() => {
    resetInMemoryTauriStore();
    useProvidersStore.setState({ active: {} });
  });

  it('uses OmniSource for metadata and streaming on a clean install', async () => {
    await initializeProvidersStore();

    expect(useProvidersStore.getState().active).toMatchObject(
      DEFAULT_ACTIVE_PROVIDERS,
    );
  });

  it('migrates the legacy metadata and streaming defaults to OmniSource once', async () => {
    const store = new LazyStore(STORE_FILE);
    await store.set('active', {
      metadata: 'spotify',
      streaming: 'youtube',
      discovery: 'lastfm-discovery',
    });
    await store.save();

    await initializeProvidersStore();

    expect(useProvidersStore.getState().active).toEqual({
      metadata: 'omnisource-meta',
      streaming: 'omnisource-stream',
      discovery: 'lastfm-discovery',
    });
  });

  it('preserves later user selections after the default migration', async () => {
    await initializeProvidersStore();

    useProvidersStore.getState().setActive('metadata', 'discogs');
    useProvidersStore.getState().setActive('streaming', 'youtube');
    await new Promise((resolve) => setTimeout(resolve, 10));

    useProvidersStore.setState({ active: {} });
    await initializeProvidersStore();

    expect(useProvidersStore.getState().active).toMatchObject({
      metadata: 'discogs',
      streaming: 'youtube',
    });
  });
});
