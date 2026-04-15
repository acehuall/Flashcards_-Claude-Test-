import React, { useEffect, useState } from 'react';
import type { ExportOptions } from '../../domain/transferTypes';
import { Button } from './Button';
import { Modal } from './Modal';

interface ExportOptionsModalProps {
  open: boolean;
  scopeLabel: string;
  onConfirm: (options: ExportOptions) => void;
  onCancel: () => void;
  loading?: boolean;
}

export function ExportOptionsModal({
  open,
  scopeLabel,
  onConfirm,
  onCancel,
  loading = false,
}: ExportOptionsModalProps) {
  const [includeStats, setIncludeStats] = useState(false);
  const [includeSessions, setIncludeSessions] = useState(false);

  useEffect(() => {
    if (open) {
      setIncludeStats(false);
      setIncludeSessions(false);
    }
  }, [open]);

  const handleHistoryToggle = () => {
    setIncludeSessions((current) => {
      const next = !current;
      if (next) {
        setIncludeStats(true);
      }
      return next;
    });
  };

  return (
    <Modal open={open} onClose={onCancel} title="Export JSON" maxWidth="sm">
      <div className="space-y-5">
        <div className="rounded-card border border-app-border bg-app-bg-alt px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-app-secondary">Scope</p>
          <p className="mt-1 text-sm font-medium text-app-primary">{scopeLabel}</p>
        </div>

        <div className="rounded-card border border-app-border bg-app-surface px-4 py-3">
          <p className="text-sm font-medium text-app-primary">Content</p>
          <p className="mt-1 text-xs text-app-secondary">Always included: packs, sets, cards, and portable IDs.</p>
        </div>
        <ToggleRow
          label="Stats"
          description="Include card review totals and the most recent result for each card."
          checked={includeStats}
          onChange={() => setIncludeStats((current) => !current)}
          disabled={includeSessions}
        />
        <ToggleRow
          label="History"
          description="Include past review sessions and individual results. This also turns stats on."
          checked={includeSessions}
          onChange={handleHistoryToggle}
        />

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm({ includeStats, includeSessions })}
            loading={loading}
          >
            Export JSON
          </Button>
        </div>
      </div>
    </Modal>
  );
}

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}

function ToggleRow({ label, description, checked, onChange, disabled = false }: ToggleRowProps) {
  return (
    <label
      className={[
        'flex items-start justify-between gap-4 rounded-card border border-app-border bg-app-surface px-4 py-3',
        disabled ? 'opacity-60' : 'cursor-pointer',
      ].join(' ')}
    >
      <div>
        <p className="text-sm font-medium text-app-primary">{label}</p>
        <p className="mt-1 text-xs text-app-secondary">{description}</p>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="mt-1 h-4 w-4 rounded border-app-border bg-app-bg-alt text-app-nav focus:ring-app-nav"
      />
    </label>
  );
}
