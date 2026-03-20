import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { db } from '../../db';
import { StandardShell } from '../../shared/layouts/StandardShell';
import { Button } from '../../shared/components/Button';
import { LoadingSpinner, NotFound } from '../../shared/components/StateViews';
import clsx from 'clsx';

const COLORS = {
  correct:   '#4CAF50',
  incorrect: '#F44336',
  flagged:   '#FFC107',
};

export function ResultsPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const id = sessionId ? parseInt(sessionId, 10) : NaN;

  const session = useLiveQuery(() => (isNaN(id) ? undefined : db.sessions.get(id)), [id]);
  const results = useLiveQuery(
    () => (isNaN(id) ? [] : db.results.where('sessionId').equals(id).toArray()),
    [id],
  );

  // Get card details for each result
  const cardMap = useLiveQuery(async () => {
    if (!results || results.length === 0) return {};
    const cardIds = [...new Set(results.map((r) => r.cardId))];
    const cards = await db.cards.bulkGet(cardIds);
    const map: Record<number, { question: string; answer: string }> = {};
    cards.forEach((c) => { if (c) map[c.id!] = { question: c.question, answer: c.answer }; });
    return map;
  }, [results]);

  const set = useLiveQuery(
    () => (session?.setId ? db.sets.get(session.setId) : undefined),
    [session?.setId],
  );

  if (session === undefined || results === undefined) {
    return <StandardShell><LoadingSpinner /></StandardShell>;
  }
  if (session === null || isNaN(id)) {
    return <StandardShell><NotFound message="Session not found" /></StandardShell>;
  }

  const correct   = results.filter((r) => r.outcome === 'correct').length;
  const incorrect = results.filter((r) => r.outcome === 'incorrect').length;
  const flagged   = results.filter((r) => r.outcome === 'flagged').length;
  const total     = results.length;
  const pct       = total > 0 ? Math.round((correct / total) * 100) : 0;

  const donutData = [
    { name: 'Correct',   value: correct,   color: COLORS.correct },
    { name: 'Incorrect', value: incorrect, color: COLORS.incorrect },
    { name: 'Flagged',   value: flagged,   color: COLORS.flagged },
  ].filter((d) => d.value > 0);

  const incorrectCardIds = results.filter((r) => r.outcome === 'incorrect').map((r) => r.cardId);
  const flaggedCardIds   = results.filter((r) => r.outcome === 'flagged').map((r) => r.cardId);

  const headline =
    pct === 100 ? 'Perfect score!' :
    pct >= 80   ? 'Great work!' :
    pct >= 60   ? 'Good effort' :
    pct >= 40   ? 'Keep practising' :
                  "You'll get there";

  const duration = session.completedAt && session.startedAt
    ? Math.round((session.completedAt - session.startedAt) / 1000)
    : null;

  return (
    <StandardShell>
      <div className="max-w-2xl mx-auto">
        {/* Back */}
        {set && (
          <Link
            to={`/set/${set.id}`}
            className="inline-flex items-center gap-1 text-xs text-app-secondary hover:text-app-primary mb-6 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {set.title}
          </Link>
        )}

        {/* Headline */}
        <h1 className="text-3xl font-bold text-app-primary mb-2">{headline}</h1>
        {set && <p className="text-sm text-app-secondary mb-8">{set.title}</p>}

        {/* Score card */}
        <div className="bg-app-surface border border-app-border rounded-card p-6 mb-6">
          <div className="flex items-center gap-8">
            {/* Donut */}
            <div className="relative shrink-0" style={{ width: 220, height: 180 }}>
              {donutData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={46}
                      outerRadius={64}
                      paddingAngle={2}
                      dataKey="value"
                      startAngle={90}
                      endAngle={-270}
                      labelLine={false}
                      isAnimationActive={false}
                    >
                      {donutData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: '#252729', border: '1px solid #2E3135', borderRadius: 8 }}
                      labelStyle={{ color: '#fff' }}
                      itemStyle={{ color: '#909090' }}
                      formatter={(value: number, name: string) => [`${value} cards`, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full rounded-full border-4 border-app-border" />
              )}
              <div
                className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center justify-center pointer-events-none"
                style={{ left: 16, width: 126 }}
              >
                <span className="text-2xl font-bold text-app-primary">{pct}%</span>
                <span className="text-xs text-app-secondary">{correct}/{total}</span>
              </div>
            </div>

            {/* Breakdown */}
            <div className="flex flex-col gap-3 flex-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-app-correct" />
                  <span className="text-sm text-app-secondary">Correct</span>
                </div>
                <span className="text-sm font-semibold text-app-correct">{correct}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-app-incorrect" />
                  <span className="text-sm text-app-secondary">Incorrect</span>
                </div>
                <span className="text-sm font-semibold text-app-incorrect">{incorrect}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-app-flag" />
                  <span className="text-sm text-app-secondary">Flagged</span>
                </div>
                <span className="text-sm font-semibold text-app-flag">{flagged}</span>
              </div>
              {duration !== null && (
                <div className="pt-2 border-t border-app-border flex items-center justify-between">
                  <span className="text-xs text-app-secondary">Time</span>
                  <span className="text-xs text-app-secondary">
                    {duration >= 60 ? `${Math.floor(duration / 60)}m ${duration % 60}s` : `${duration}s`}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          <Button
            variant="secondary"
            disabled={flaggedCardIds.length === 0}
            title={flaggedCardIds.length === 0 ? 'No flagged cards' : 'Review flagged cards'}
            onClick={() => navigate(`/review/${set?.id}`, { state: { mode: 'flagged', cardIds: flaggedCardIds } })}
          >
            <span className="text-app-flag">⚑</span> Review Flagged ({flagged})
          </Button>
          <Button
            variant="secondary"
            disabled={incorrectCardIds.length === 0}
            title={incorrectCardIds.length === 0 ? 'No incorrect cards' : 'Retake weak cards'}
            onClick={() => navigate(`/review/${set?.id}`, { state: { mode: 'incorrect-only', cardIds: incorrectCardIds } })}
          >
            <span className="text-app-incorrect">✗</span> Retake Weak ({incorrect})
          </Button>
          <Button
            onClick={() => navigate(`/review/${set?.id}`, { state: { mode: 'full' } })}
          >
            Retake Full Set
          </Button>
          <Button variant="ghost" onClick={() => navigate(set ? `/set/${set.id}` : '/')}>
            Exit
          </Button>
        </div>

        {/* Per-card list */}
        {results.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-app-secondary uppercase tracking-wide mb-3">
              Card breakdown
            </h2>
            <div className="space-y-2">
              {results.map((result, idx) => {
                const card = cardMap?.[result.cardId];
                const outcomeColor =
                  result.outcome === 'correct'   ? 'text-app-correct border-app-correct/20' :
                  result.outcome === 'incorrect' ? 'text-app-incorrect border-app-incorrect/20' :
                                                   'text-app-flag border-app-flag/20';
                return (
                  <div
                    key={result.id}
                    className={clsx(
                      'flex items-start gap-4 bg-app-surface border rounded-card px-4 py-3',
                      outcomeColor,
                    )}
                  >
                    <span className={clsx('text-sm font-bold mt-0.5 shrink-0', outcomeColor.split(' ')[0])}>
                      {result.outcome === 'correct' ? '✓' : result.outcome === 'incorrect' ? '✗' : '⚑'}
                    </span>
                    <div className="flex-1 min-w-0">
                      {card ? (
                        <>
                          <p className="text-sm text-app-primary">{card.question}</p>
                          <p className="text-xs text-app-secondary mt-0.5">{card.answer}</p>
                        </>
                      ) : (
                        <p className="text-sm text-app-secondary italic">Card no longer exists</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </StandardShell>
  );
}
