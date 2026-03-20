import React, { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { deleteCard } from '../../domain/deleteService';
import { parseCsvFile, buildImportSummary, exportSetToCsv } from '../../domain/csvService';
import { StandardShell } from '../../shared/layouts/StandardShell';
import { Button } from '../../shared/components/Button';
import { EmptyState, LoadingSpinner, NotFound, PageHeader } from '../../shared/components/StateViews';
import { ConfirmModal } from '../../shared/components/Modal';
import { useToast } from '../../context/ToastContext';

export function SetDetailPage() {
  const { setId } = useParams<{ setId: string }>();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const id = setId ? parseInt(setId, 10) : NaN;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const set = useLiveQuery(() => (isNaN(id) ? undefined : db.sets.get(id)), [id]);
  const pack = useLiveQuery(
    () => (set?.packId ? db.packs.get(set.packId) : undefined),
    [set?.packId],
  );
  const cards = useLiveQuery(
    () => (isNaN(id) ? [] : db.cards.where('setId').equals(id).sortBy('createdAt')),
    [id],
  );

  const [deleteTarget, setDeleteTarget] = useState<{ id: number; question: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [importing, setImporting] = useState(false);

  if (set === undefined || cards === undefined) return <StandardShell><LoadingSpinner /></StandardShell>;
  if (set === null || isNaN(id)) return <StandardShell><NotFound message="Set not found" /></StandardShell>;

  const handleDeleteCard = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteCard(deleteTarget.id);
      addToast('Card deleted', 'success');
    } catch {
      addToast('Failed to delete card', 'error');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setImporting(true);
    try {
      const result = await parseCsvFile(file);
      if (!result.ok) {
        addToast(result.error.message, 'error');
        return;
      }

      const now = Date.now();
      await db.cards.bulkAdd(
        result.rows.map((r) => ({ setId: id, question: r.question, answer: r.answer, createdAt: now })),
      );

      const summary = buildImportSummary({ imported: result.rows.length, skipped: result.skipped, errors: [] });
      addToast(summary, 'success');
    } catch {
      addToast('Import failed. Please try again.', 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleExport = () => {
    if (!cards || cards.length === 0) {
      addToast('No cards to export', 'info');
      return;
    }
    exportSetToCsv(set.title, cards);
    addToast(`Exported ${cards.length} cards`, 'success');
  };

  const canReview = (cards?.length ?? 0) > 0;

  return (
    <StandardShell>
      <PageHeader
        title={set.title}
        subtitle={pack ? `${pack.name} · ${cards.length} card${cards.length !== 1 ? 's' : ''}` : `${cards.length} card${cards.length !== 1 ? 's' : ''}`}
        back={{ label: pack ? pack.name : 'Back', to: pack ? `/pack/${pack.id}` : '/' }}
        actions={
          <div className="flex items-center gap-2">
            {/* CSV actions */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleImport}
              aria-label="Import CSV file"
            />
            <Button
              variant="secondary"
              size="sm"
              loading={importing}
              onClick={() => fileInputRef.current?.click()}
              title="Import cards from CSV"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Import CSV
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExport}
              disabled={!canReview}
              title="Export set to CSV"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export CSV
            </Button>
            <Button
              size="sm"
              onClick={() => navigate(`/create/card/${id}`)}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Card
            </Button>
            <Button
              variant={canReview ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => navigate(`/review/${id}`)}
              disabled={!canReview}
              title={canReview ? 'Start review session' : 'Add at least one card to start'}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Review
            </Button>
          </div>
        }
      />

      {set.description && (
        <p className="text-sm text-app-secondary mb-6 -mt-4">{set.description}</p>
      )}

      {cards.length === 0 ? (
        <EmptyState
          title="No cards yet"
          description='Add cards manually or import from a CSV file with "question" and "answer" columns.'
          action={{ label: 'Add first card', to: `/create/card/${id}` }}
        />
      ) : (
        <div className="space-y-2">
          {cards.map((card, idx) => (
            <div
              key={card.id}
              className="group flex items-start gap-4 bg-app-surface border border-app-border rounded-card px-5 py-4 hover:border-app-secondary/40 transition-all"
            >
              <span className="text-xs text-app-secondary/50 font-mono mt-0.5 w-6 shrink-0 text-right">
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-app-secondary mb-1">Question</p>
                  <p className="text-sm text-app-primary leading-relaxed line-clamp-3">{card.question}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-app-secondary mb-1">Answer</p>
                  <p className="text-sm text-app-secondary leading-relaxed line-clamp-3">{card.answer}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                  onClick={() => navigate(`/edit/card/${card.id}`)}
                  className="p-1.5 text-app-secondary hover:text-app-primary rounded-md hover:bg-app-bg transition-colors"
                  aria-label="Edit card"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={() => setDeleteTarget({ id: card.id!, question: card.question })}
                  className="p-1.5 text-app-secondary hover:text-app-incorrect rounded-md hover:bg-app-bg transition-colors"
                  aria-label="Delete card"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        onConfirm={handleDeleteCard}
        onCancel={() => setDeleteTarget(null)}
        title="Delete Card"
        message={
          <>
            Delete this card?
            {deleteTarget && (
              <span className="block mt-2 p-3 bg-app-bg rounded-lg text-xs text-app-secondary font-mono">
                {deleteTarget.question.slice(0, 100)}{deleteTarget.question.length > 100 ? '…' : ''}
              </span>
            )}
          </>
        }
        confirmLabel={deleting ? 'Deleting…' : 'Delete Card'}
        danger
      />
    </StandardShell>
  );
}
