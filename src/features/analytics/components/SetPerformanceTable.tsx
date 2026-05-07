import React from 'react';
import clsx from 'clsx';
import { Button } from '../../../shared/components/Button';
import {
  formatDate,
  formatDuration,
  getRetentionStatusLabel,
  type SetPerformanceRow,
} from '../analyticsQueries';

interface SetPerformanceTableProps {
  rows: SetPerformanceRow[];
  onReviewWeakCards: (setId: number, cardIds: number[]) => void;
}

const retentionBadgeClasses = {
  strong: 'border-app-correct/20 bg-app-correct/10 text-app-correct',
  improving: 'border-app-nav/20 bg-app-nav/10 text-app-nav',
  'needs-practice': 'border-app-incorrect/20 bg-app-incorrect/10 text-app-incorrect',
  due: 'border-app-flag/20 bg-app-flag/10 text-app-flag',
  'not-reviewed-recently': 'border-app-border bg-app-surface-2 text-app-secondary',
} as const;

export function SetPerformanceTable({ rows, onReviewWeakCards }: SetPerformanceTableProps) {
  return (
    <section className="rounded-card border border-app-border bg-app-surface p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-app-primary">Set performance</h2>
          <p className="mt-1 text-xs text-app-secondary">Weakest sets appear first so you can spot what needs extra work. Focused review stays within one set for now.</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-app-secondary">Set performance will appear once you complete study activity.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const reviewCardIds = row.focusCardIds.length > 0 ? row.focusCardIds : row.weakCardIds;
            const canReviewCards = row.focusCardIds.length > 0 ? row.canReviewFocusCards : row.canReviewWeakCards;
            const reviewButtonLabel = row.focusStatus === 'due'
              ? 'Review due cards'
              : row.focusStatus === 'needs-practice'
                ? 'Review needs practice'
                : 'Review weak cards';

            return (
              <article key={row.setId} className="min-w-0 rounded-card border border-app-border bg-app-surface-2 px-4 py-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-app-primary">{row.title}</h3>
                      {row.packName && (
                        <span className="rounded-full border border-app-border px-2 py-0.5 text-[11px] text-app-secondary">
                          {row.packName}
                        </span>
                      )}
                      {row.primaryRetentionStatus && (
                        <span className={clsx('rounded-full border px-2 py-0.5 text-[11px]', retentionBadgeClasses[row.primaryRetentionStatus])}>
                          {getRetentionStatusLabel(row.primaryRetentionStatus)}
                        </span>
                      )}
                      {row.retentionCounts.due > 0 && (
                        <span className="rounded-full border border-app-flag/20 bg-app-flag/10 px-2 py-0.5 text-[11px] text-app-flag">
                          {row.retentionCounts.due} due
                        </span>
                      )}
                      {row.retentionCounts['needs-practice'] > 0 && (
                        <span className="rounded-full border border-app-incorrect/20 bg-app-incorrect/10 px-2 py-0.5 text-[11px] text-app-incorrect">
                          {row.retentionCounts['needs-practice']} needs practice
                        </span>
                      )}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-app-secondary">Reviewed</p>
                        <p className="mt-1 font-semibold text-app-primary">{row.totalReviewed.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-app-secondary">Sessions</p>
                        <p className="mt-1 font-semibold text-app-primary">{row.completedSessions.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-app-secondary">Accuracy</p>
                        <p className={`mt-1 font-semibold ${row.accuracy !== null && row.accuracy >= 70 ? 'text-app-correct' : 'text-app-primary'}`}>
                          {row.accuracy !== null ? `${row.accuracy}%` : 'No data'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-app-secondary">Avg response</p>
                        <p className="mt-1 font-semibold text-app-primary">
                          {row.averageResponseMs !== null ? formatDuration(row.averageResponseMs) : 'Timing unavailable'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-app-secondary">Last reviewed</p>
                        <p className="mt-1 font-semibold text-app-primary">{formatDate(row.lastReviewedAt)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-app-secondary">Weak cards</p>
                        <p className={`mt-1 font-semibold ${row.weakCardCount > 0 ? 'text-app-incorrect' : 'text-app-primary'}`}>
                          {row.weakCardCount.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="min-w-0 md:shrink-0">
                    {canReviewCards && reviewCardIds.length > 0 ? (
                      <Button size="sm" onClick={() => onReviewWeakCards(row.setId, reviewCardIds)}>
                        {reviewButtonLabel}
                      </Button>
                    ) : row.weakCardCount > 0 ? (
                      <p className="text-xs text-app-secondary">
                        {row.focusStatus === null && row.weakCardIds.length === 0
                          ? 'Weak cards are tracked here, but focused review cards are not available yet.'
                          : 'Weak cards available, but this set can no longer be reviewed.'}
                      </p>
                    ) : (
                      <p className="text-xs text-app-secondary">No weak cards in this set right now.</p>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
