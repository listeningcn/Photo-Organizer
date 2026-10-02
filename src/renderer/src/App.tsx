import { useEffect, useState } from 'react';

import type { VaultStatus } from '@shared/api';

import { Library } from './components/Library';
import { VaultScreen } from './components/VaultScreen';

export function App() {
  const [status, setStatus] = useState<VaultStatus | null>(null);

  const refresh = () => {
    window.api.status().then(setStatus);
  };

  useEffect(refresh, []);
  useEffect(() => window.api.onLocked(refresh), []);

  if (!status) return null;

  if (!status.unlocked) {
    return <VaultScreen initialized={status.initialized} onUnlocked={refresh} />;
  }

  return <Library onLocked={refresh} />;
}
