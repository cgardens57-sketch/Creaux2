import { FC } from 'react';

import { useTranslation } from '@nuclearplayer/i18n';
import { Button, EmptyState } from '@nuclearplayer/ui';

import { CreauxMark } from '../../../components/CreauxMark';
import { useSettingsModalStore } from '../../../stores/settingsModalStore';

export const DashboardEmptyState: FC = () => {
  const { t } = useTranslation('dashboard');

  return (
    <EmptyState
      data-testid="dashboard-empty-state"
      icon={<CreauxMark compact className="creaux-empty-mark" />}
      title={t('empty-state')}
      description={t('empty-state-description')}
      className="flex-1"
      action={
        <Button
          data-testid="dashboard-empty-state-action"
          onClick={() => useSettingsModalStore.getState().open('plugins')}
        >
          {t('empty-state-action')}
        </Button>
      }
    />
  );
};
