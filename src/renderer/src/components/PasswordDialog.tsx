import { type FormEvent, useState } from 'react';

import { errorMessage } from '../error-message';

interface PasswordDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: (password: string) => Promise<void>;
  onCancel: () => void;
}

export function PasswordDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
}: PasswordDialogProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onConfirm(password);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onCancel}>
      <form
        className="dialog"
        role="dialog"
        aria-modal
        aria-labelledby="password-dialog-title"
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
          e.stopPropagation();
        }}
      >
        <h2 id="password-dialog-title">{title}</h2>
        <p className="muted">{description}</p>
        <label>
          Password
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="danger" disabled={busy || !password}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
