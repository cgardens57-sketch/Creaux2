# Creaux2

Creaux2 is a cinematic desktop music player built on Nuclear's
source-independent search, metadata, streaming, playlist, and playback engine.
It replaces Nuclear's application shell with a focused interface, motion
system, title sequence, audio-reactive presentation, and interaction language
designed specifically for desktop listening.

## What Creaux2 changes

- A bespoke desktop interface with translucent, crystalline visual structure.
- Playlist-first library navigation without generated or placeholder content.
- Configurable metadata, streaming, dashboard, and playlist providers.
- Search, queue, playback, artist navigation, and playlist management.
- Carousel and conventional track browsing modes.
- Audio-reactive visualization with adjustable reactivity and segment density.
- A synchronized title sequence that can continue the last playing track.
- Custom interaction details, transitions, sound cues, and easter eggs.

## Content behavior

Creaux2 does not fabricate playlists, tracks, or feed rows. Home content comes
from the active provider, the user's library, and the user's real playlists.
Provider roles can be configured independently from the application's source
settings.

## Development

Creaux2 retains Nuclear's pnpm monorepo and Tauri desktop architecture.

Requirements:

- Node.js 22
- pnpm 10
- Rust and the platform requirements for Tauri 2

Install dependencies and run the desktop application:

```sh
pnpm install
pnpm dev
```

Run the main checks:

```sh
pnpm type-check
pnpm test
pnpm lint
```

Build the desktop player:

```sh
pnpm --filter @nuclearplayer/player build
```

Additional contributor guidance is available in `AGENTS.md`,
`CONTRIBUTING.md`, and `packages/docs`.

## Upstream and license

Creaux2 is derived from
[Nuclear](https://github.com/nukeop/nuclear) at upstream commit
`d030cc10d060041aa792e2854ce8f3995335fbdf`.

It is distributed under the GNU Affero General Public License v3.0. See
`LICENSE` and `ATTRIBUTION.md` for the complete terms and attribution.
