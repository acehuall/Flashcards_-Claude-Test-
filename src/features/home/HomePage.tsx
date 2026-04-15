import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { deletePack } from '../../domain/deleteService';
import {
  buildImportPreview,
  executeImport,
  exportLibraryToJson,
  parseImportFile,
} from '../../domain/importExportService';
import type { ExportOptions, ImportMode, ImportPlan, ImportPreview } from '../../domain/transferTypes';
import { StandardShell } from '../../shared/layouts/StandardShell';
import { Button } from '../../shared/components/Button';
import { ExportOptionsModal } from '../../shared/components/ExportOptionsModal';
import { ImportPreviewModal } from '../../shared/components/ImportPreviewModal';
import { EmptyState, LoadingSpinner } from '../../shared/components/StateViews';
import { ConfirmModal } from '../../shared/components/Modal';
import { useToast } from '../../context/ToastContext';
import { getPackColorStyle } from '../../shared/components/PackColors';

type ParsedImportFile = Awaited<ReturnType<typeof parseImportFile>>;
type PendingImportPlan = ImportPlan & { file: ParsedImportFile; targetPackId?: number };

export function HomePage() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const importPackInputRef = useRef<HTMLInputElement>(null);
  const importLibraryInputRef = useRef<HTMLInputElement>(null);

  const packs = useLiveQuery(() => db.packs.orderBy('createdAt').reverse().toArray(), []);
  const setCounts = useLiveQuery(
    async () => {
      const all = await db.sets.toArray();
      const counts: Record<number, number> = {};
      for (const s of all) counts[s.packId] = (counts[s.packId] ?? 0) + 1;
      return counts;
    },
    [],
  );

  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exportOptionsOpen, setExportOptionsOpen] = useState(false);
  const [exportingLibrary, setExportingLibrary] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('copy');
  const [pendingImportFile, setPendingImportFile] = useState<ParsedImportFile | null>(null);
  const [selectedPackId, setSelectedPackId] = useState<number | null>(null);
  const [buildingPreview, setBuildingPreview] = useState(false);
  const [importingJson, setImportingJson] = useState(false);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deletePack(deleteTarget.id);
      addToast(`"${deleteTarget.name}" deleted`, 'success');
    } catch {
      addToast('Failed to delete pack', 'error');
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
    setSelectedPackId(null);
    setBuildingPreview(false);
  };

  const handleImportPackSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';

    try {
      const parsed = await parseImportFile(file);
      if (parsed.scope === 'library') {
        addToast('Use Import Library for library backup files.', 'error');
        return;
      }

      setPendingImportFile(parsed);
      setImportMode('copy');

      if (parsed.scope === 'set') {
        const packOptions = (packs ?? []).flatMap((pack) => (pack.id == null ? [] : [{ id: pack.id, name: pack.name }]));
        if (packOptions.length === 0) {
          addToast('Create a pack before importing a set from Home.', 'error');
          setPendingImportFile(null);
          return;
        }

        setSelectedPackId(packOptions[0].id);
        setPreview(null);
        setPreviewOpen(true);
        return;
      }

      const nextPreview = await buildImportPreview(parsed, { targetLabel: 'Entire library' });
      setSelectedPackId(null);
      setPreview(nextPreview);
      setPreviewOpen(true);
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Import failed. Please try again.', 'error');
      resetImportState();
    }
  };

  const handleImportLibrarySelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';

    try {
      const parsed = await parseImportFile(file);
      if (parsed.scope !== 'library') {
        addToast('Use Import Pack for set or pack JSON files.', 'error');
        return;
      }

      const nextPreview = await buildImportPreview(parsed, { targetLabel: 'Entire library' });
      setPendingImportFile(parsed);
      setPreview(nextPreview);
      setImportMode('copy');
      setSelectedPackId(null);
      setPreviewOpen(true);
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Import failed. Please try again.', 'error');
      resetImportState();
    }
  };

  const handlePrepareSetPreview = async () => {
    if (!pendingImportFile || pendingImportFile.scope !== 'set' || selectedPackId == null) {
      return;
    }

    setBuildingPreview(true);
    try {
      const nextPreview = await buildImportPreview(pendingImportFile, selectedPackId);
      setPreview(nextPreview);
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Import failed. Please try again.', 'error');
    } finally {
      setBuildingPreview(false);
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
        targetPackId: pendingImportFile.scope === 'set' ? selectedPackId ?? undefined : undefined,
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

  const handleExportLibrary = async (options: ExportOptions) => {
    setExportingLibrary(true);
    try {
      await exportLibraryToJson(options);
      addToast('Exported library JSON', 'success');
      setExportOptionsOpen(false);
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Failed to export library JSON', 'error');
    } finally {
      setExportingLibrary(false);
    }
  };

  if (packs === undefined) {
    return (
      <StandardShell>
        <LoadingSpinner />
      </StandardShell>
    );
  }

  return (
    <StandardShell>
      <input
        ref={importPackInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleImportPackSelect}
        aria-label="Import pack JSON file"
      />
      <input
        ref={importLibraryInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleImportLibrarySelect}
        aria-label="Import library JSON file"
      />
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-app-primary tracking-tight">Your Packs</h1>
          <p className="text-sm text-app-secondary mt-1">
            {packs.length === 0 ? 'Create your first pack to get started' : `${packs.length} pack${packs.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => importLibraryInputRef.current?.click()}
            disabled={importingJson || buildingPreview}
            className="w-full justify-center whitespace-nowrap sm:w-auto"
          >
            Import Library
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setExportOptionsOpen(true)}
            disabled={exportingLibrary}
            className="w-full justify-center whitespace-nowrap sm:w-auto"
          >
            Export Library
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => importPackInputRef.current?.click()}
            disabled={importingJson || buildingPreview}
            className="w-full justify-center whitespace-nowrap sm:w-auto"
          >
            Import Pack
          </Button>
          <Button onClick={() => navigate('/create/pack')} size="sm" className="w-full justify-center whitespace-nowrap sm:w-auto">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Pack
          </Button>
        </div>
      </div>

      {packs.length === 0 ? (
        <EmptyState
          icon={
            <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          }
          title="No packs yet"
          description="Packs are top-level groupings. Create one to start organising your flashcard sets."
          action={{ label: 'Create your first pack', to: '/create/pack' }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {packs.map((pack) => {
            const colorStyle = getPackColorStyle(pack.color);
            const count = setCounts?.[pack.id!] ?? 0;
            return (
              <div
                key={pack.id}
                className="group relative bg-app-surface border border-app-border rounded-card p-5 hover:border-app-secondary/50 transition-all duration-200 cursor-pointer animate-fade-in"
                onClick={() => navigate(`/pack/${pack.id}`)}
              >
                {/* Colour indicator */}
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center mb-4 text-lg font-bold"
                  style={colorStyle}
                >
                  {pack.name.charAt(0).toUpperCase()}
                </div>

                <h2 className="text-base font-semibold text-app-primary mb-1 truncate pr-8">
                  {pack.name}
                </h2>
                <p className="text-sm text-app-secondary">
                  {count} set{count !== 1 ? 's' : ''}
                </p>

                {/* Actions revealed on hover */}
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget({ id: pack.id!, name: pack.name });
                    }}
                    className="p-1.5 text-app-secondary hover:text-app-incorrect rounded-md hover:bg-app-bg transition-colors"
                    aria-label={`Delete pack ${pack.name}`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>

                {/* Bottom colour strip */}
                <div
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-card opacity-60"
                  style={{ backgroundColor: pack.color }}
                />
              </div>
            );
          })}
        </div>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        title="Delete Pack"
        message={
          <>
            Are you sure you want to delete <strong className="text-app-primary">"{deleteTarget?.name}"</strong>?
            {' '}This will permanently remove all sets, cards, and session history inside it.
          </>
        }
        confirmLabel={deleting ? 'Deleting…' : 'Delete Pack'}
        danger
      />
      <ExportOptionsModal
        open={exportOptionsOpen}
        scopeLabel="Library"
        onConfirm={handleExportLibrary}
        onCancel={() => setExportOptionsOpen(false)}
        loading={exportingLibrary}
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
        packOptions={(packs ?? []).flatMap((pack) => (pack.id == null ? [] : [{ id: pack.id, name: pack.name }]))}
        selectedPackId={selectedPackId}
        onSelectedPackIdChange={setSelectedPackId}
        onPreparePreview={handlePrepareSetPreview}
        preparingPreview={buildingPreview}
      />
    </StandardShell>
  );
}

function buildImportSuccessMessage(scope: ParsedImportFile['scope'], preview: ImportPreview): string {
  switch (scope) {
    case 'set':
      return `Imported set JSON with ${preview.counts.cards} card${preview.counts.cards !== 1 ? 's' : ''}`;
    case 'pack':
      return `Imported pack JSON with ${preview.counts.sets} set${preview.counts.sets !== 1 ? 's' : ''}`;
    case 'library':
      return `Imported library JSON with ${preview.counts.packs} pack${preview.counts.packs !== 1 ? 's' : ''}`;
  }
}
