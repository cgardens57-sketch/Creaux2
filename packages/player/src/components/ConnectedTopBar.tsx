import { useCanGoBack, useRouter } from '@tanstack/react-router';
import { FC } from 'react';

import {
  Tooltip,
  TopBar,
  TopBarNavigation,
} from '@nuclearplayer/ui';

import { useAppVersion } from '../hooks/useAppVersion';
import { useCanGoForward } from '../hooks/useCanGoForward';
import { useCoreSetting } from '../hooks/useCoreSetting';
import { useFramelessWindow } from '../hooks/useFramelessWindow';
import { ConnectedThemeController } from './ConnectedThemeController';
import { ConnectedSourceStatus } from './ConnectedSourceStatus';
import { CreauxMark } from './CreauxMark';
import { JamQrCodeButton } from './JamQrCodeButton';
import { SearchBox } from './SearchBox';
import { UpdateBadge } from './UpdateBadge';

export const ConnectedTopBar: FC = () => {
  const router = useRouter();
  const { version } = useAppVersion();
  const canGoBack = useCanGoBack();
  const canGoForward = useCanGoForward();
  const frameless = useFramelessWindow();
  const [isTitleBarEnabled] = useCoreSetting<boolean>(
    'appearance.customTitleBar',
  );

  return (
    <TopBar className="creaux2-topbar" draggable={frameless}>
      <div className="flex min-w-0 flex-row items-center gap-4">
        {!isTitleBarEnabled && (
          <Tooltip
            content={`Creaux2 ${version}`}
            side="bottom"
            wrapperClassName="flex items-center"
          >
            <CreauxMark compact />
          </Tooltip>
        )}
        <TopBarNavigation
          onBack={() => router.history.back()}
          onForward={() => router.history.forward()}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
        />
        <UpdateBadge />
      </div>
      <SearchBox />
      <div className="flex flex-row items-center justify-end gap-2">
        <ConnectedSourceStatus />
        <JamQrCodeButton />
        <ConnectedThemeController />
      </div>
    </TopBar>
  );
};
