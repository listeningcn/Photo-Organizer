import { type FormEvent, useState } from 'react';

import { MIN_PASSWORD_LENGTH } from '@shared/api';

import { errorMessage } from '../error-message';

interface VaultScreenProps {
  initialized: boolean;
  onUnlocked: () => void;
}

export function VaultScreen({ initialized, onUnlocked }: VaultScreenProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!initialized) {
      if (password.length < MIN_PASSWORD_LENGTH) {
        setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
        return;
      }
      if (password !== confirm) {
        setError('Passwords do not match.');
        return;
      }
    }

    setBusy(true);
    try {
      if (initialized) {
        await window.api.unlock(password);
      } else {
        await window.api.setup(password);
      }
      setPassword('');
      setConfirm('');
      onUnlocked();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="vault">
      <form className="vault-card" onSubmit={handleSubmit}>
        <h1>{initialized ? 'Unlock your library' : 'Create your library'}</h1>
        {!initialized && (
          <p className="muted">
            Your library is encrypted with this password. It can't be recovered if you
            forget it.
          </p>
        )}
        <label>
          Password
          <input
            type="password"
            autoFocus
            autoComplete={initialized ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {!initialized && (
          <label>
            Confirm password
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <button type="submit" className="primary" disabled={busy || !password}>
          {busy ? 'Please wait…' : initialized ? 'Unlock' : 'Create library'}
        </button>
      </form>
    </main>
  );
}
