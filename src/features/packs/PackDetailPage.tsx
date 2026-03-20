import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { deleteSet } from '../../domain/deleteService';
import { StandardShell } from '../../shared/layouts/StandardShell';
import { Button } from '../../shared/components/Button';
import { EmptyState, LoadingSpinner, NotFound, PageHeader } from '../../shared/components/StateViews';
import { ConfirmModal } from '../../shared/components/Modal';
import { useToast } from '../../context/ToastContext';
import { getPackColorStyle } from '../../shared/components/PackColors';
import clsx from 'clsx';

export function PackDetailPage() {
  const { packId } = useParams<{ packId: string }>();
  const navigate = useNavigate();
  const { addToast } = useToast();
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

  if (pack === undefined || sets === undefined) return <StandardShell><LoadingSpinner /></StandardShell>;
  if (pack === null || isNaN(id)) return <StandardShell><NotFound message="Pack not found" /></StandardShell>;

  const colorStyle = getPackColorStyle(pack.color);

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

  return (
    <StandardShell>
      <PageHeader
        title={pack.name}
        subtitle={`${sets.length} set${sets.length !== 1 ? 's' : ''}`}
        back={{ label: 'All packs', to: '/' }}
        actions={
          <Button onClick={() => navigate(`/create/set/${pack.id}`)}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Set
          </Button>
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
    </StandardShell>
  );
}
