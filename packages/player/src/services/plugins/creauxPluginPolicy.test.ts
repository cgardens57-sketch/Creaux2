import { describe, expect, it } from 'vitest';

import { isCreauxPluginSupported } from './creauxPluginPolicy';

describe('Creaux2 plugin policy', () => {
  it('removes Last.fm while preserving the provider ecosystem', () => {
    expect(isCreauxPluginSupported('nuclear-plugin-lastfm')).toBe(false);
    expect(isCreauxPluginSupported('nuclear-plugin-omnisource')).toBe(true);
    expect(isCreauxPluginSupported('nuclear-plugin-youtube')).toBe(true);
  });
});
