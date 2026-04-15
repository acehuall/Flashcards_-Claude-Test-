import React, { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { deleteSet } from '../../domain/deleteService';
import {
  buildImportPreview,
  executeImport,
  exportPackToJson,
  parseImportFile,
} from '../../domain/importExportService';
import type { ExportOptions, ImportMode, ImportPlan, ImportPreview } from '../../domain/transferTypes';
import { StandardShell } from '../../shared/layouts/StandardShell';
import { Button } from '../../shared/components/Button';
import { ExportOptionsModal } from '../../shared/components/ExportOptionsModal';
import { ImportPreviewModal } from '../../shared/components/ImportPreviewModal';
import { EmptyState, LoadingSpinner, NotFound, PageHeader } from '../../shared/components/StateViews';
import { ConfirmModal } from '../../shared/components/Modal';
import { useToast } from '../../context/ToastContext';

type ParsedImportFile = Awaited<ReturnType<typeof parseImportFile>>;
type PendingImportPlan = ImportPlan & { file: ParsedImportFile; targetPackId?: number };

export function PackDetailPage() {
  const { packId } = useParams<{ packId: string }>();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const importInputRef = useRef<HTMLInputElement>(null);
  const id = packId ? parseInt(packId, 10) : NaN;

  const pack = useLiveQuery(() => (isNaN(id) ? undefined : db.packs.get(id)), [id]);
  const sets = useLiveQuery(
    () => (isNaN(id) ? [] : db.sets.where('packId').equals(id).sortBy('createdAt')),
    [id],
  );
  const cardCounts = useLiveQuery(async () => {
    if (isNaN(id)) return {};
    const allCards = await db.cards.toArray();
    const counts: Record<number, number> = {};
    for (const c of allCards) counts[c.setId] = (counts[c.setId] ?? 0) + 1;
    return counts;
  }, [id]);

  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exportOptionsOpen, setExportOptionsOpen] = useState(false);
  const [exportingPack, setExportingPack] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('copy');
  const [pendingImportFile, setPendingImportFile] = useState<ParsedImportFile | null>(null);
  const [importingJson, setImportingJson] = useState(false);

  if (pack === undefined || sets === undefined) return <StandardShell><LoadingSpinner /></StandardShell>;
  if (pack === null || isNaN(id)) return <StandardShell><NotFound message="Pack not found" /></StandardShell>;

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteSet(deleteTarget.id);
      addToast(`"${deleteTarget.title}" deleted`, 'success');
    } catch {
      addToast('Failed to delete set', 'error');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const resetImportState = () => {
    setPreviewOpen(false);
    setPreview(null);
    setPendingImportFile(null);
    setImportMode('copy');
  };

  const handleImportSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';

    try {
      const parsed = await parseImportFile(file);
      if (parsed.scope === 'library') {
        addToast('Library JSON can only be imported from the Home page.', 'error');
        return;
      }

      const nextPreview = parsed.scope === 'set'
        ? await buildImportPreview(parsed, pack.id!)
        : await buildImportPreview(parsed, { targetLabel: 'Entire library', currentPackName: pack.name });

      setPendingImportFile(parsed);
      setPreview(nextPreview);
      setImportMode('copy');
      setPreviewOpen(true);
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Import failed. Please try again.', 'error');
      resetImportState();
    }
  };

  const handleConfirmImport = async () => {
    if (!pendingImportFile || !preview) {
      return;
    }

    setImportingJson(true);
    try {
      await executeImport({
        mode: importMode,
        creates: preview.plannedCreates,
        merges: preview.plannedMerges,
        replacements: preview.plannedReplacements,
        skipped: 0,
        warnings: preview.warnings,
        conflicts: preview.conflicts,
        file: pendingImportFile,
        targetPackId: pendingImportFile.scope === 'set' ? pack.id! : undefined,
      } as PendingImportPlan);

      addToast(buildImportSuccessMessage(pendingImportFile.scope, preview), 'success');
      resetImportState();
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Import failed. Please try again.', 'error');
    } finally {
      setImportingJson(false);
    }
  };

  const handleCancelImport = () => {
    if (importingJson) {
      return;
    }

    resetImportState();
  };

  const handleExportPack = async (options: ExportOptions) => {
    setExportingPack(true);
    try {
      await exportPackToJson(pack.id!, options);
      addToast('Exported pack JSON', 'success');
      setExportOptionsOpen(false);
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Failed to export pack JSON', 'error');
    } finally {
      setExportingPack(false);
    }
  };

  return (
    <StandardShell>
      <input
        ref={importInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleImportSelect}
        aria-label="Import pack or set JSON file"
      />
      <PageHeader
        title={pack.name}
        subtitle={`${sets.length} set${sets.length !== 1 ? 's' : ''}`}
        back={{ label: 'All packs', to: '/' }}
        actions={
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => importInputRef.current?.click()}
              disabled={importingJson}
              className="w-full justify-center whitespace-nowrap sm:w-auto"
            >
              Import into Pack
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setExportOptionsOpen(true)}
              disabled={exportingPack}
              className="w-full justify-center whitespace-nowrap sm:w-auto"
            >
              Export Pack
            </Button>
            <Button onClick={() => navigate(`/create/set/${pack.id}`)} size="sm" className="w-full justify-center whitespace-nowrap sm:w-auto">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Set
            </Button>
          </div>
        }
      />

      {/* Colour indicator strip */}
      <div
        className="h-1 rounded-full mb-8 opacity-60"
        style={{ backgroundColor: pack.color }}
      />

      {sets.length === 0 ? (
        <EmptyState
          title="No sets yet"
          description="Sets are chapters or topics within a pack. Create one to start adding cards."
          action={{ label: 'Create first set', to: `/create/set/${pack.id}` }}
        />
      ) : (
        <div className="space-y-3">
          {sets.map((set) => {
            const count = cardCounts?.[set.id!] ?? 0;
            return (
              <div
                key={set.id}
                className="group relative flex items-center bg-app-surface border border-app-border rounded-card px-5 py-4 hover:border-app-secondary/50 transition-all cursor-pointer"
                onClick={() => navigate(`/set/${set.id}`)}
              >
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-app-primary truncate">{set.title}</h3>
                  {set.description && (
                    <p className="text-sm text-app-secondary mt-0.5 truncate">{set.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-4 ml-4 shrink-0">
                  <span className="text-sm text-app-secondary">{count} card{count !== 1 ? 's' : ''}</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={(e) => { e.stopPropagation(); navigate(`/review/${set.id}`); }}
                    disabled={count === 0}
                    title={count === 0 ? 'Add at least one card to start' : 'Start review'}
                  >
                    Review
                  </Button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget({ id: set.id!, title: set.title });
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-app-secondary hover:text-app-incorrect rounded-md hover:bg-app-bg transition-all"
                    aria-label={`Delete set ${set.title}`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        title="Delete Set"
        message={
          <>
            Delete <strong className="text-app-primary">"{deleteTarget?.title}"</strong>?
            {' '}This will permanently remove all cards and session history for this set.
          </>
        }
        confirmLabel={deleting ? 'Deleting…' : 'Delete Set'}
        danger
      />
      <ExportOptionsModal
        open={exportOptionsOpen}
        scopeLabel={`Pack: ${pack.name}`}
        onConfirm={handleExportPack}
        onCancel={() => setExportOptionsOpen(false)}
        loading={exportingPack}
      />
      <ImportPreviewModal
        open={previewOpen}
        preview={preview}
        mode={importMode}
        onModeChange={setImportMode}
        onConfirm={handleConfirmImport}
        onCancel={handleCancelImport}
        loading={importingJson}
        scope={pendingImportFile?.scope}
      />
    </StandardShell>
  );
}

function buildImportSuccessMessage(scope: ParsedImportFile['scope'], preview: ImportPreview): string {
  switch (scope) {
    case 'set':
      return `Imported set JSON with ${preview.counts.cards} card${preview.counts.cards !== 1 ? 's' : ''}`;
    case 'pack':
      return 'Imported pack JSON as a new separate pack';
    case 'library':
      return `Imported library JSON with ${preview.counts.packs} pack${preview.counts.packs !== 1 ? 's' : ''}`;
  }
}
