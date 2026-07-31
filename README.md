# Creaux2

yea so i wanted Nuclear to look cooler so I made AI do it

## Install

### Windows

Install these requirements first:

- [Git for Windows](https://git-scm.com/download/win)
- [Node.js 22](https://nodejs.org/)
- [pnpm 10](https://pnpm.io/installation)
- [Rust](https://www.rust-lang.org/tools/install)
- [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with **Desktop development with C++**

Clone the repository and build the installer:

```powershell
git clone https://github.com/cgardens57-sketch/Creaux2.git
cd Creaux2
pnpm install
pnpm --filter @nuclearplayer/player build
```

When the build finishes, run either installer:

- `packages/player/src-tauri/target/release/bundle/nsis/Creaux2_2.0.0_x64-setup.exe`
- `packages/player/src-tauri/target/release/bundle/msi/Creaux2_2.0.0_x64_en-US.msi`

To run Creaux2 directly in development mode instead:

```powershell
pnpm install
pnpm dev
```
