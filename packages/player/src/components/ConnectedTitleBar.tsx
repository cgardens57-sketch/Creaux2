import { getCurrentWindow } from '@tauri-apps/api/window';
import { FC } from 'react';

import { TitleBar } from '@nuclearplayer/ui';

import { useCoreSetting } from '../hooks/useCoreSetting';

const appWindow = getCurrentWindow();

export const ConnectedTitleBar: FC = () => {
  const [isEnabled] = useCoreSetting<boolean>('appearance.customTitleBar');
  const [titleBarStyle] = useCoreSetting<string>('appearance.titleBarStyle');

  const styleOverride =
    titleBarStyle === 'auto' || !titleBarStyle
      ? undefined
      : (titleBarStyle as 'macos' | 'windows');

  return (
    isEnabled && (
      <TitleBar
        title="Creaux2 — Listening Observatory"
        styleOverride={styleOverride}
        onMinimize={() => appWindow.minimize()}
        onMaximize={() => appWindow.toggleMaximize()}
        onClose={() => appWindow.close()}
        onStartDrag={() => appWindow.startDragging()}
        labels={{
          minimize: 'Minimize Creaux2',
          maximize: 'Maximize Creaux2',
          close: 'Close Creaux2',
        }}
      />
    )
  );
};
