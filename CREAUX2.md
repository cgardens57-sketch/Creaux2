# Creaux2

Creaux2 is a cinematic desktop listening system built on Nuclear's
source-independent music engine.

## Product rules

- Creaux2 never fabricates playlists, tracks, or feed rows.
- A fresh install remains intentionally quiet until the user installs real
  providers.
- Metadata, streaming, dashboard, and playlist providers remain independently
  configurable.
- Home content comes only from the active Nuclear dashboard provider, the
  user's real library, and the user's real playlists.
- The interface uses original code-native geometry, translucency, filigree,
  light, movement, and restrained interaction sound instead of copied game
  assets.
- Motion must clarify state, direction, focus, or hierarchy. Reduced-motion
  preferences suppress nonessential effects.

## Install providers

Open **System**, choose **Provider catalog**, and install the providers you
trust. Return to **Active sources** to assign metadata, streaming, dashboard,
and playlist roles independently.

## Development

This repository retains Nuclear's monorepo and contribution tooling. See
`AGENTS.md`, `CONTRIBUTING.md`, and the documentation in `packages/docs`.

## License

Creaux2 is distributed under the GNU Affero General Public License v3.0 because
it is derived from Nuclear. See `LICENSE` and `ATTRIBUTION.md`.
