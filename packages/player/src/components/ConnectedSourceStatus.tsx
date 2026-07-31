import { useNavigate } from '@tanstack/react-router';
import { RadioTower, ScanSearch } from 'lucide-react';
import { FC } from 'react';

import { useActiveProvider } from '../hooks/useActiveProvider';

export const ConnectedSourceStatus: FC = () => {
  const navigate = useNavigate();
  const metadata = useActiveProvider('metadata');
  const streaming = useActiveProvider('streaming');

  return (
    <div className="creaux-source-status" aria-label="Active sources">
      <button onClick={() => navigate({ to: '/sources' })}>
        <ScanSearch aria-hidden="true" />
        <span>
          <small>Metadata</small>
          <strong>{metadata?.name ?? 'Select source'}</strong>
        </span>
      </button>
      <i aria-hidden="true" />
      <button onClick={() => navigate({ to: '/sources' })}>
        <RadioTower aria-hidden="true" />
        <span>
          <small>Streaming</small>
          <strong>{streaming?.name ?? 'Select source'}</strong>
        </span>
      </button>
    </div>
  );
};
