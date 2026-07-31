const REMOVED_PLUGIN_IDS = new Set(['nuclear-plugin-lastfm']);

export const isCreauxPluginSupported = (pluginId: string): boolean =>
  !REMOVED_PLUGIN_IDS.has(pluginId);
