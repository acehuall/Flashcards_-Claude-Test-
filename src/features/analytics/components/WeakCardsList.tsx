import React from 'react';
import { Button } from '../../../shared/components/Button';
import {
  formatDate,
  formatDuration,
  getRetentionStatusLabel,
  type WeakCardInsight,
} from '../analyticsQueries';

export interface WeakCardListItem extends WeakCardInsight {
  setWeakCardIds: number[];
}

interface WeakCardsListProps {
  items: WeakCardListItem[];
  onReviewCard: (setId: number, cardId: number) => void;
  onReviewSetWeakCards: (setId: number, cardIds: number[]) => void;
}

const retentionBadgeClasses: Record<WeakCardInsight['retentionStatus'], string> = {
  strong: 'border-app-correct/20 bg-app-correct/10 text-app-correct',
  improving: 'border-app-nav/20 bg-app-nav/10 text-app-nav',
  'needs-practice': 'border-app-incorrect/20 bg-app-incorrect/10 text-app-incorrect',
  due: 'border-app-flag/20 bg-app-flag/10 text-app-flag',
  'not-reviewed-recently': 'border-app-border bg-app-surface-2 text-app-secondary',
};

export function WeakCardsList({ items, onReviewCard, onReviewSetWeakCards }: WeakCardsListProps) {
  return (
    <section className="rounded-card border border-app-border bg-app-surface p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-app-primary">Weak cards</h2>
          <p className="mt-1 text-xs text-app-secondary">Due and needs-practice cards rise to the top so you can act on retention issues quickly.</p>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-app-secondary">No due or needs-practice cards right now. Keep your streak going.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <article key={item.cardId} className="min-w-0 rounded-card border border-app-border bg-app-surface-2 px-4 py-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-app-primary line-clamp-2">{item.question}</p>
                  <p className="mt-1 text-xs text-app-secondary">{item.setTitle}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-app-secondary">
                    <span className={`rounded-full border px-2 py-1 ${retentionBadgeClasses[item.retentionStatus]}`}>
                      {getRetentionStatusLabel(item.retentionStatus)}
                    </span>
                    <span className="rounded-full border border-app-incorrect/20 bg-app-incorrect/10 px-2 py-1 text-app-incorrect">
                      {Math.round(item.missRate * 100)}% miss rate
                    </span>
                    <span className="rounded-full border border-app-border px-2 py-1">
                      Retention score {item.retentionScore}
                    </span>
                    {item.mcqReviewCount !== undefined &&
                      item.reviewCount > 0 &&
                      item.mcqReviewCount / item.reviewCount > 0.5 && (
                      <span className="rounded-full border border-app-nav/20 bg-app-nav/10 px-2 py-1 text-app-nav">
                        Mostly MCQ — try flip mode
                      </span>
                    )}
                    <span className="rounded-full border border-app-border px-2 py-1">
                      {item.reviewCount.toLocaleString()} review{item.reviewCount === 1 ? '' : 's'}
                    </span>
                    <span className="rounded-full border border-app-border px-2 py-1">
                      Last reviewed {formatDate(item.lastReviewedAt)}
                    </span>
                    <span className="rounded-full border border-app-border px-2 py-1">
                      {item.avgResponseMs !== null ? `Avg ${formatDuration(item.avgResponseMs)}` : 'Timing unavailable'}
                    </span>
                  </div>
                </div>

                <div className="min-w-0 flex flex-wrap gap-2 lg:justify-end">
                  {item.canReview && (
                    <Button size="sm" onClick={() => onReviewCard(item.setId, item.cardId)}>
                      Review card
                    </Button>
                  )}
                  {item.canReview && item.setWeakCardIds.length > 1 && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onReviewSetWeakCards(item.setId, item.setWeakCardIds)}
                    >
                      Review set focus
                    </Button>
                  )}
                  {!item.canReview && (
                    <p className="text-xs text-app-secondary">This card belongs to a set that can no longer be reviewed.</p>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
