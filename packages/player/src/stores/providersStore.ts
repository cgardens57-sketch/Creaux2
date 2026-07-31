import { LazyStore } from '@tauri-apps/plugin-store';
import { create } from 'zustand';

import type { ProviderKind } from '@nuclearplayer/plugin-sdk';

const STORE_FILE = 'active-providers.json';
const STORE_KEY = 'active';
const DEFAULTS_VERSION_KEY = 'creaux.defaultsVersion';
const DEFAULTS_VERSION = 2;
const store = new LazyStore(STORE_FILE);

export const DEFAULT_ACTIVE_PROVIDERS: Record<string, string> = {
  metadata: 'omnisource-meta',
  streaming: 'omnisource-stream',
};

let persistenceTask: Promise<void> = Promise.resolve();

type ProvidersStoreState = {
  active: Record<string, string>;
  loadFromDisk: () => Promise<void>;
  getActive: (kind: ProviderKind) => string | undefined;
  setActive: (kind: ProviderKind, providerId: string) => void;
  clearActive: (kind: ProviderKind) => void;
  clearAllActive: () => void;
};

const saveToDisk = async (): Promise<void> => {
  const snapshot = useProvidersStore.getState().active;
  persistenceTask = persistenceTask
    .catch(() => undefined)
    .then(async () => {
      await store.set(STORE_KEY, snapshot);
      await store.save();
    });
  await persistenceTask;
};

export const useProvidersStore = create<ProvidersStoreState>((set, get) => ({
  active: {},

  loadFromDisk: async () => {
    const record = await store.get<Record<string, string>>(STORE_KEY);
    const defaultsVersion =
      (await store.get<number>(DEFAULTS_VERSION_KEY)) ?? 0;
    const active =
      defaultsVersion < DEFAULTS_VERSION
        ? { ...(record ?? {}), ...DEFAULT_ACTIVE_PROVIDERS }
        : { ...DEFAULT_ACTIVE_PROVIDERS, ...(record ?? {}) };

    set({ active });

    if (defaultsVersion < DEFAULTS_VERSION) {
      await store.set(STORE_KEY, active);
      await store.set(DEFAULTS_VERSION_KEY, DEFAULTS_VERSION);
      await store.save();
    }
  },

  getActive: (kind: ProviderKind): string | undefined => {
    return get().active[kind];
  },

  setActive: (kind: ProviderKind, providerId: string) => {
    set((state) => ({
      active: { ...state.active, [kind]: providerId },
    }));
    void saveToDisk();
  },

  clearActive: (kind: ProviderKind) => {
    set((state) => {
      const rest = Object.fromEntries(
        Object.entries(state.active).filter(([key]) => key !== kind),
      );
      return { active: rest };
    });
    void saveToDisk();
  },

  clearAllActive: () => {
    set({ active: {} });
    void saveToDisk();
  },
}));

export const initializeProvidersStore = async (): Promise<void> => {
  await useProvidersStore.getState().loadFromDisk();
};
