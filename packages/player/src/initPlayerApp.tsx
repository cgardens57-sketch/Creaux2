import React from 'react';

import App from './App';
import { initLogStream } from './hooks/useLogStream';
import { applyThemeFromSettingsIfAny } from './services/advancedThemeService';
import { startAdvancedThemeWatcher } from './services/advancedThemeWatcher';
import { initBridgeHandler } from './services/bridge/bridgeHandler';
import { registerBuiltInCoreSettings } from './services/coreSettings';
import { initDiscordHandler } from './services/discordHandler';
import { initHistoryService } from './services/history';
import { initHttpApiHandler } from './services/httpApi';
import {
  cacheLastPlayedTrack,
  readLastPlayedTrack,
} from './services/lastPlayedTrackCache';
import {
  applyLanguageFromSettings,
  initLanguageWatcher,
} from './services/languageService';
import { loadMarketplaceThemes } from './services/marketplaceThemeDirService';
import { initMcpHandler } from './services/mcp';
import { initMpdHandler } from './services/mpd';
import { initPlaybackEventBridge } from './services/playbackEventBridge';
import { hydratePluginsFromRegistry } from './services/plugins/pluginBootstrap';
import { ytdlpEnsureInstalled } from './services/tauri/commands';
import { initializeFavoritesStore } from './stores/favoritesStore';
import { initializePlaylistStore } from './stores/playlistStore';
import { initializeProvidersStore } from './stores/providersStore';
import { initializeQueueStore, useQueueStore } from './stores/queueStore';
import { initializeSettingsStore } from './stores/settingsStore';
import { initializeShortcutsStore } from './stores/shortcutsStore';
import { hydrateThemeStore } from './stores/themeStore';

export const initPlayerApp = async (
  root: ReturnType<typeof import('react-dom/client').createRoot>,
) => {
  initLogStream();

  await initializeSettingsStore()
    .then(() => initializeShortcutsStore())
    .then(() => initializeProvidersStore())
    .then(() => initializeQueueStore())
    .then(async () => {
      const lastPlayedTrack = await readLastPlayedTrack();
      if (lastPlayedTrack) {
        useQueueStore.getState().restoreLastPlayedTrack(lastPlayedTrack);
        return;
      }
      const currentTrack = useQueueStore.getState().getCurrentItem()?.track;
      if (currentTrack) {
        await cacheLastPlayedTrack(currentTrack);
      }
    })
    .then(() => initializeFavoritesStore())
    .then(() => initializePlaylistStore())
    .then(() => registerBuiltInCoreSettings())
    .then(() => initMcpHandler())
    .then(() => initMpdHandler())
    .then(() => initHttpApiHandler())
    .then(() => initBridgeHandler())
    .then(() => initDiscordHandler())
    .then(() => initPlaybackEventBridge())
    .then(() => initHistoryService())
    .then(() => applyLanguageFromSettings())
    .then(() => initLanguageWatcher())
    .then(() => startAdvancedThemeWatcher())
    .then(() => loadMarketplaceThemes())
    .then(() => hydrateThemeStore())
    .then(() => applyThemeFromSettingsIfAny())
    .then(() => {
      void hydratePluginsFromRegistry();
      void ytdlpEnsureInstalled();
    });

  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
};
