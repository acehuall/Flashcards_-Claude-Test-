import React from 'react';
import { StandardShell } from '../../shared/layouts/StandardShell';
import { PageHeader } from '../../shared/components/StateViews';
import { Button } from '../../shared/components/Button';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import clsx from 'clsx';

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
  description?: string;
  badge?: string;
}

function SettingRow({ checked, onChange, disabled, label, description, badge }: ToggleProps) {
  return (
    <div className={clsx('flex items-center justify-between py-4', disabled && 'opacity-50')}>
      <div>
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-app-primary">{label}</p>
          {badge && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-app-surface border border-app-border text-app-secondary">
              {badge}
            </span>
          )}
        </div>
        {description && <p className="text-xs text-app-secondary mt-0.5">{description}</p>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={clsx(
          'relative w-11 h-6 rounded-full transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-app-nav focus-visible:ring-offset-2 focus-visible:ring-offset-app-bg outline-none shrink-0',
          checked ? 'bg-app-nav' : 'bg-app-border',
          disabled && 'cursor-not-allowed',
        )}
      >
        <span
          className={clsx(
            'absolute top-0.5 left-0.5 w-5 h-5 bg-app-primary rounded-full shadow transition-transform duration-200',
            checked && 'translate-x-5',
          )}
        />
      </button>
    </div>
  );
}

interface SelectRowProps {
  label: string;
  description?: string;
  value: number;
  options: { value: number; label: string }[];
  onChange: (v: number) => void;
}

function SelectRow({ label, description, value, options, onChange }: SelectRowProps) {
  return (
    <div className="flex items-center justify-between py-4">
      <div>
        <p className="text-sm font-medium text-app-primary">{label}</p>
        {description && <p className="text-xs text-app-secondary mt-0.5">{description}</p>}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="bg-app-bg-alt border border-app-border text-app-primary text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-app-nav"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export function SettingsPage() {
  const { settings, updateSettings, resetSettings } = useSettings();
  const { addToast } = useToast();

  const handleReset = () => {
    resetSettings();
    addToast('Settings reset to defaults', 'info');
  };

  return (
    <StandardShell>
      <div className="max-w-lg">
        <PageHeader title="Settings" subtitle="App preferences and study configuration" />

        {/* Review section */}
        <section className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-app-secondary mb-1 px-1">
            Review
          </h2>
          <div className="bg-app-surface border border-app-border rounded-card divide-y divide-app-border px-5">
            <SettingRow
              checked={settings.shuffleCards}
              onChange={(v) => updateSettings({ shuffleCards: v })}
              label="Shuffle cards"
              description="Randomise card order at the start of each session"
            />
            <SettingRow
              checked={settings.flipAnimation}
              onChange={(v) => updateSettings({ flipAnimation: v })}
              label="Flip animation"
              description="3D flip effect when revealing the answer"
            />
            <SelectRow
              label="Auto-show answer"
              description="Automatically reveal the answer after a delay"
              value={settings.autoShowAnswer}
              options={[
                { value: 0,  label: 'Off' },
                { value: 3,  label: 'After 3 seconds' },
                { value: 5,  label: 'After 5 seconds' },
                { value: 10, label: 'After 10 seconds' },
              ]}
              onChange={(v) => updateSettings({ autoShowAnswer: v as 0 | 3 | 5 | 10 })}
            />
          </div>
        </section>

        {/* Interactions section */}
        <section className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-app-secondary mb-1 px-1">
            Interactions
          </h2>
          <div className="bg-app-surface border border-app-border rounded-card divide-y divide-app-border px-5">
            <SettingRow
              checked={settings.swipeGestures}
              onChange={(v) => updateSettings({ swipeGestures: v })}
              label="Swipe gestures"
              description="On answer cards: swipe left/right for incorrect/correct, swipe up to flag, or use the right scroll gutter to read long answers"
            />
          </div>
        </section>

        {/* Notifications section */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-app-secondary mb-1 px-1">
            Notifications
          </h2>
          <div className="bg-app-surface border border-app-border rounded-card divide-y divide-app-border px-5">
            <SettingRow
              checked={settings.studyReminders}
              onChange={(v) => updateSettings({ studyReminders: v })}
              label="Study reminders"
              description="Daily push notifications to encourage study sessions"
              badge="Phase B"
              disabled
            />
          </div>
        </section>

        <div className="flex justify-start">
          <Button variant="ghost" size="sm" onClick={handleReset}>
            Reset to defaults
          </Button>
        </div>
      </div>
    </StandardShell>
  );
}
