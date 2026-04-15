import React from 'react';
import type { ImportMode, ImportPreview } from '../../domain/transferTypes';
import { Button } from './Button';
import { Modal } from './Modal';

interface PackOption {
  id: number;
  name: string;
}

type RuntimeImportConflict = ImportPreview['conflicts'][number] & {
  code?: string;
  blocking?: boolean;
  appliesTo?: ImportMode[];
  matchedBy?: 'heuristic';
};

type AffectedActiveSession = {
  setId: number;
  title: string;
  packName?: string;
};

type RuntimeSupplementalSummary = {
  statsToImport?: number;
  recomputedStatsCount?: number;
  sessionsToImport?: number;
  resultsToImport?: number;
  duplicateSessions?: number;
  skippedResults?: number;
};

type RuntimeImportFile = {
  includeStats: boolean;
  includeSessions: boolean;
};

type RuntimeImportPreview = ImportPreview & {
  sourceFile?: RuntimeImportFile;
  fileContainsStats?: boolean;
  fileContainsSessions?: boolean;
  supplementalByMode?: Partial<Record<ImportMode, RuntimeSupplementalSummary>>;
};

interface ImportPreviewModalProps {
  open: boolean;
  preview: ImportPreview | null;
  mode: ImportMode;
  onModeChange: (mode: ImportMode) => void;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  scope?: ImportPreview['scope'];
  packOptions?: PackOption[];
  selectedPackId?: number | null;
  onSelectedPackIdChange?: (packId: number) => void;
  onPreparePreview?: () => void;
  preparingPreview?: boolean;
}

export function ImportPreviewModal({
  open,
  preview,
  mode,
  onModeChange,
  onConfirm,
  onCancel,
  loading = false,
  scope,
  packOptions,
  selectedPackId = null,
  onSelectedPackIdChange,
  onPreparePreview,
  preparingPreview = false,
}: ImportPreviewModalProps) {
  const [replaceConfirmationArmed, setReplaceConfirmationArmed] = React.useState(false);
  const [includeStats, setIncludeStats] = React.useState(false);
  const [includeSessions, setIncludeSessions] = React.useState(false);

  const syncImportOptions = React.useCallback((nextStats: boolean, nextSessions: boolean) => {
    setIncludeStats(nextStats);
    setIncludeSessions(nextSessions);

    if (!preview) {
      return;
    }

    preview.includeStats = nextStats;
    preview.includeSessions = nextSessions;
    const runtimePreview = preview as RuntimeImportPreview;
    if (runtimePreview.sourceFile) {
      runtimePreview.sourceFile.includeStats = nextStats;
      runtimePreview.sourceFile.includeSessions = nextSessions;
    }
  }, [preview]);

  React.useEffect(() => {
    setReplaceConfirmationArmed(false);
  }, [open, mode, preview]);

  React.useEffect(() => {
    if (!preview) {
      return;
    }

    const runtimePreview = preview as RuntimeImportPreview;
    const nextSessions = runtimePreview.sourceFile?.includeSessions ?? preview.includeSessions;
    const nextStats = nextSessions
      ? true
      : (runtimePreview.sourceFile?.includeStats ?? preview.includeStats);

    syncImportOptions(nextStats, nextSessions);
  }, [preview, syncImportOptions]);

  if (!open) {
    return null;
  }

  const activeScope = preview?.scope ?? scope;
  const title = activeScope ? `Import ${toTitleCase(activeScope)} JSON` : 'Import JSON';
  const showPackSelector = !preview
    && activeScope === 'set'
    && Boolean(packOptions)
    && Boolean(onSelectedPackIdChange)
    && Boolean(onPreparePreview);

  if (showPackSelector) {
    return (
      <Modal open={open} onClose={onCancel} title={title} maxWidth="sm">
        <div className="space-y-5">
          <div className="rounded-card border border-app-border bg-app-bg-alt px-4 py-3 text-sm text-app-secondary">
            Choose a destination pack before previewing this set import.
          </div>

          <div>
            <label htmlFor="import-pack-select" className="mb-2 block text-sm font-medium text-app-primary">
              Destination pack
            </label>
            <select
              id="import-pack-select"
              value={selectedPackId ?? ''}
              onChange={(event) => onSelectedPackIdChange?.(Number(event.target.value))}
              className="w-full rounded-card border border-app-border bg-app-bg-alt px-3 py-2 text-sm text-app-primary outline-none transition-colors focus:border-app-nav"
            >
              {(packOptions ?? []).map((pack) => (
                <option key={pack.id} value={pack.id}>
                  {pack.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={onCancel} disabled={preparingPreview}>
              Cancel
            </Button>
            <Button onClick={onPreparePreview} loading={preparingPreview} disabled={selectedPackId == null}>
              Continue to Preview
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  if (!preview) {
    return null;
  }

  const runtimePreview = preview as RuntimeImportPreview;
  const activeSessions = getAffectedActiveSessions(preview);
  const conflicts = getModeConflicts(preview, mode);
  const hasHeuristicConflict = conflicts.some((conflict) => conflict.matchedBy === 'heuristic');
  const hasBlockingConflict = conflicts.some((conflict) => Boolean(conflict.blocking));
  const fileContainsStats = runtimePreview.fileContainsStats ?? preview.counts.stats > 0;
  const fileContainsSessions = runtimePreview.fileContainsSessions ?? (preview.counts.sessions > 0 || preview.counts.results > 0);
  const supplementalSummary = getSupplementalSummary(runtimePreview, mode);
  const replaceModeDisabled = preview.scope === 'library';
  const heuristicFile = preview.identityMode === 'heuristic';
  const copyDescription = preview.scope === 'set'
    ? 'Create a new set in the target pack.'
    : preview.scope === 'pack'
      ? 'Create a new pack and copy all child sets and cards.'
      : 'Create imported packs alongside your existing library.';
  const mergeDescription = preview.scope === 'set'
    ? 'Merge into a matched set and add only new cards.'
    : preview.scope === 'pack'
      ? 'Merge into a matched pack and preserve existing metadata.'
      : 'Merge matching packs into your library and add only new content.';
  const replaceDescription = preview.scope === 'set'
    ? 'Replace the matched destination set inside the selected pack.'
    : preview.scope === 'pack'
      ? 'Replace the matched destination pack and all descendants.'
      : 'Replace is not supported for Library scope.';

  const sessionsToImport = includeSessions ? supplementalSummary.sessionsToImport ?? 0 : 0;
  const resultsToImport = includeSessions ? supplementalSummary.resultsToImport ?? 0 : 0;
  const duplicateSessions = includeSessions ? supplementalSummary.duplicateSessions ?? 0 : 0;

  const handleStatsToggle = () => {
    if (includeSessions || !fileContainsStats) {
      return;
    }

    syncImportOptions(!includeStats, false);
  };

  const handleHistoryToggle = () => {
    const nextSessions = !includeSessions;
    const nextStats = nextSessions ? true : (fileContainsStats ? includeStats : false);
    syncImportOptions(nextStats, nextSessions);
  };

  const handleConfirm = () => {
    if (mode === 'replace' && !replaceConfirmationArmed) {
      setReplaceConfirmationArmed(true);
      return;
    }

    onConfirm();
  };

  const replaceConfirmLabel = replaceConfirmationArmed ? 'Click Again to Replace' : 'Confirm Replace';
  const confirmDisabled = loading || hasBlockingConflict || (replaceModeDisabled && mode === 'replace');

  return (
    <Modal open={open} onClose={onCancel} title={title} maxWidth="lg">
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <InfoRow label="File scope" value={toTitleCase(preview.scope)} />
          <InfoRow label="Target" value={preview.target} />
          <InfoRow label="Identity mode" value={toTitleCase(preview.identityMode)} />
          <InfoRow label="Packs" value={String(preview.counts.packs)} />
          <InfoRow label="Sets" value={String(preview.counts.sets)} />
          <InfoRow label="Cards" value={String(preview.counts.cards)} />
          <InfoRow label="Stats in file" value={fileContainsStats ? 'Yes' : 'No'} />
          <InfoRow label="History in file" value={fileContainsSessions ? 'Yes' : 'No'} />
          <InfoRow label="Schema version" value={String(preview.version)} />
        </div>

        <div className="space-y-3 rounded-card border border-app-border bg-app-bg-alt px-4 py-4">
          <p className="text-sm font-medium text-app-primary">Import options</p>
          <ToggleRow
            label="Stats"
            description={fileContainsStats
              ? 'Import card review totals from the file. When history is included, stats are rebuilt from results instead.'
              : 'No standalone stats are present in this file.'}
            checked={includeStats}
            onChange={handleStatsToggle}
            disabled={includeSessions || !fileContainsStats}
          />
          <ToggleRow
            label="History"
            description={fileContainsSessions
              ? 'Import review sessions and results. This also turns stats on.'
              : 'No sessions or results are present in this file.'}
            checked={includeSessions}
            onChange={handleHistoryToggle}
            disabled={!fileContainsSessions}
          />

          {(fileContainsStats || fileContainsSessions) && (
            <div className="grid gap-3 sm:grid-cols-3">
              <InfoRow label="Stats rows" value={String(preview.counts.stats)} />
              <InfoRow label="Sessions to import" value={String(sessionsToImport)} />
              <InfoRow label="Results to import" value={String(resultsToImport)} />
            </div>
          )}

          {duplicateSessions > 0 && (
            <p className="text-xs text-app-secondary">
              {duplicateSessions} session{duplicateSessions !== 1 ? 's' : ''} will be skipped as duplicate{duplicateSessions !== 1 ? 's' : ''} in Merge mode.
            </p>
          )}

          {fileContainsStats && fileContainsSessions && (
            <p className="text-xs text-app-secondary">
              If you include history, saved stats from the file are ignored and rebuilt from the imported results.
            </p>
          )}
        </div>

        {heuristicFile && (
          <div className="rounded-card border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            <span className="font-semibold uppercase tracking-wide">Heuristic matching warning</span>
            <p className="mt-1 text-amber-100/90">
              This file does not carry stable portable IDs for every entity. Fallback matching will rely on names, titles, or normalised card questions.
            </p>
          </div>
        )}

        {mode === 'replace' && (
          <div className="rounded-card border border-app-incorrect/50 bg-app-incorrect/10 px-4 py-3 text-sm text-app-primary">
            <span className="font-semibold uppercase tracking-wide text-app-incorrect">Replace is destructive</span>
            <p className="mt-1 text-app-secondary">
              Matched destination content and descendants will be deleted inside one transaction before the imported content is recreated.
            </p>
            {replaceConfirmationArmed && (
              <p className="mt-2 font-medium text-app-primary">
                Click the replace button again to confirm.
              </p>
            )}
          </div>
        )}

        {mode !== 'copy' && activeSessions.length > 0 && (
          <div className="rounded-card border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            <span className="font-semibold uppercase tracking-wide text-amber-200">Active session warning</span>
            <p className="mt-1">
              {activeSessions.length} destination set{activeSessions.length !== 1 ? 's have' : ' has'} an active session snapshot that may be cleared by this import.
            </p>
            {activeSessions.length <= 5 && (
              <div className="mt-2 space-y-1 text-xs text-amber-50/90">
                {activeSessions.map((session) => (
                  <p key={session.setId}>
                    {session.packName ? `${session.packName} / ` : ''}{session.title}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {hasHeuristicConflict && (
          <div className="rounded-card border border-amber-400/50 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            <span className="font-semibold uppercase tracking-wide text-amber-200">Heuristic matching</span>
            <p className="mt-1">At least one detected conflict was matched heuristically rather than by portable ID.</p>
          </div>
        )}

        {conflicts.length > 0 && (
          <div className="space-y-3 rounded-card border border-app-border bg-app-bg-alt px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-app-primary">Conflict summary</p>
              {hasBlockingConflict && (
                <span className="rounded-pill bg-app-incorrect/20 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-app-incorrect">
                  Blocking
                </span>
              )}
            </div>

            {conflicts.length > 10 ? (
              <p className="text-sm text-app-secondary">
                {conflicts.length} conflicts detected for {toTitleCase(mode)} mode.
              </p>
            ) : (
              <div className="space-y-2">
                {conflicts.map((conflict, index) => (
                  <div key={`${conflict.code ?? conflict.message}-${index}`} className="rounded-card border border-app-border/70 bg-app-surface px-3 py-2 text-sm text-app-secondary">
                    <p className="text-app-primary">{conflict.message}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-wide">
                      {conflict.blocking && (
                        <span className="rounded-pill bg-app-incorrect/20 px-2 py-1 font-semibold text-app-incorrect">
                          Blocking
                        </span>
                      )}
                      {conflict.matchedBy === 'heuristic' && (
                        <span className="rounded-pill bg-amber-500/20 px-2 py-1 font-semibold text-amber-200">
                          Heuristic match
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {preview.warnings.map((warning) => (
          <div key={warning.code + warning.message} className="rounded-card border border-app-nav/30 bg-app-bg-alt px-4 py-3 text-sm text-app-secondary">
            {warning.message}
          </div>
        ))}

        <div>
          <p className="mb-3 text-sm font-medium text-app-primary">Import mode</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <ModeOption
              label="Copy"
              description={copyDescription}
              selected={mode === 'copy'}
              disabled={false}
              onSelect={() => onModeChange('copy')}
            />
            <ModeOption
              label="Merge"
              description={mergeDescription}
              selected={mode === 'merge'}
              disabled={false}
              onSelect={() => onModeChange('merge')}
            />
            <ModeOption
              label="Replace"
              description={replaceDescription}
              selected={mode === 'replace'}
              disabled={replaceModeDisabled}
              badge={replaceModeDisabled ? 'Not supported' : undefined}
              onSelect={() => onModeChange('replace')}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant={mode === 'replace' ? 'danger' : 'primary'}
            onClick={handleConfirm}
            loading={loading}
            disabled={confirmDisabled}
          >
            {mode === 'replace' ? replaceConfirmLabel : 'Confirm Import'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-app-border bg-app-bg-alt px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-app-secondary">{label}</p>
      <p className="mt-1 text-sm font-medium text-app-primary">{value}</p>
    </div>
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

interface ModeOptionProps {
  label: string;
  description: string;
  selected: boolean;
  disabled: boolean;
  badge?: string;
  onSelect: () => void;
}

function ModeOption({ label, description, selected, disabled, badge, onSelect }: ModeOptionProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={[
        'rounded-card border px-4 py-3 text-left transition-colors',
        selected ? 'border-app-nav bg-app-nav/10 text-app-primary' : 'border-app-border bg-app-surface text-app-primary',
        disabled ? 'cursor-not-allowed opacity-50' : 'hover:border-app-nav/50',
      ].join(' ')}
      aria-pressed={selected}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{label}</p>
        {badge && (
          <span className="rounded-pill bg-app-bg-alt px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-app-secondary">
            {badge}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-app-secondary">{description}</p>
    </button>
  );
}

function getModeConflicts(preview: ImportPreview, mode: ImportMode): RuntimeImportConflict[] {
  const conflicts = preview.conflicts as RuntimeImportConflict[];
  return conflicts.filter((conflict) => !conflict.appliesTo || conflict.appliesTo.includes(mode));
}

function getSupplementalSummary(preview: RuntimeImportPreview, mode: ImportMode): RuntimeSupplementalSummary {
  return preview.supplementalByMode?.[mode] ?? {};
}

function getAffectedActiveSessions(preview: ImportPreview): AffectedActiveSession[] {
  const raw = (preview as unknown as { affectedActiveSessions?: unknown }).affectedActiveSessions;
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter(isAffectedActiveSession);
}

function isAffectedActiveSession(value: unknown): value is AffectedActiveSession {
  if (typeof value !== 'object' || value == null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.setId === 'number' && typeof record.title === 'string';
}

function toTitleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
