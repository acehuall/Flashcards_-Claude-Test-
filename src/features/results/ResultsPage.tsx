import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import clsx from 'clsx';
import type { Result } from '../../domain/types';
import { db } from '../../db';
import { StandardShell } from '../../shared/layouts/StandardShell';
import { Button } from '../../shared/components/Button';
import { LoadingSpinner, NotFound } from '../../shared/components/StateViews';
import {
  formatDuration,
  formatPerCardDuration,
  getAverageResponseMs,
  getCorrectCount as getSessionCorrectCount,
  getFastestResult,
  getPreviousSession,
  getScoreDelta,
  getScorePercentage,
  getSessionDurationMs,
  getSlowestResults,
  getWeakResults,
} from './resultsAnalytics';

const COLORS = {
  correct: '#22C55E',
  incorrect: '#EF4444',
};

const WEAK_PREVIEW_LIMIT = 4;
const SLOW_PREVIEW_LIMIT = 3;

const OUTCOME_META: Record<Result['outcome'], {
  icon: string;
  label: string;
  text: string;
  rowBorder: string;
  badge: string;
}> = {
  correct: {
    icon: '✓',
    label: 'Correct',
    text: 'text-app-correct',
    rowBorder: 'border-app-correct/20',
    badge: 'border-app-correct/20 bg-app-correct/10 text-app-correct',
  },
  incorrect: {
    icon: '✗',
    label: 'Incorrect',
    text: 'text-app-incorrect',
    rowBorder: 'border-app-incorrect/20',
    badge: 'border-app-incorrect/20 bg-app-incorrect/10 text-app-incorrect',
  },
  flagged: {
    icon: '⚑',
    label: 'Flagged',
    text: 'text-app-flag',
    rowBorder: 'border-app-flag/20',
    badge: 'border-app-flag/20 bg-app-flag/10 text-app-flag',
  },
};

function formatResponseTime(ms: number): string {
  return formatDuration(ms, { decimalSeconds: true });
}

function getScoreComparisonText(scoreDelta: number | null, state: 'loading' | 'none' | 'ready'): string {
  if (state === 'loading') {
    return 'Loading previous attempt...';
  }

  if (state === 'none') {
    return 'No previous attempt yet';
  }

  if (scoreDelta === null) {
    return 'Previous attempt found, but score comparison is unavailable.';
  }

  if (scoreDelta > 0) {
    return `Score improved by ${scoreDelta}% vs last attempt`;
  }

  if (scoreDelta < 0) {
    return `Score down ${Math.abs(scoreDelta)}% vs last attempt`;
  }

  return 'Same score as last attempt';
}

function getCorrectDeltaText(current: number | null, previous: number | null): string | null {
  if (current === null || previous === null) {
    return null;
  }

  const delta = current - previous;
  if (delta > 0) {
    return `${delta} more correct`;
  }

  if (delta < 0) {
    return `${Math.abs(delta)} fewer correct`;
  }

  return 'Same correct count';
}

function getAveragePaceDeltaText(current: number | null, previous: number | null): string | null {
  if (current === null || previous === null) {
    return null;
  }

  const delta = current - previous;
  if (Math.abs(delta) < 50) {
    return 'Same average pace';
  }

  if (delta < 0) {
    return `${formatResponseTime(Math.abs(delta))} faster/card`;
  }

  return `${formatResponseTime(delta)} slower/card`;
}

export function ResultsPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const id = sessionId ? parseInt(sessionId, 10) : NaN;

  const session = useLiveQuery(() => (isNaN(id) ? undefined : db.sessions.get(id)), [id]);
  const results = useLiveQuery(
    () => (isNaN(id) ? [] : db.results.where('sessionId').equals(id).toArray()),
    [id],
  );

  const cardMap = useLiveQuery(async () => {
    if (!results || results.length === 0) return {};

    const cardIds = [...new Set(results.map((result) => result.cardId))];
    const cards = await db.cards.bulkGet(cardIds);
    const map: Record<number, { question: string; answer: string }> = {};

    cards.forEach((card) => {
      if (card?.id) {
        map[card.id] = { question: card.question, answer: card.answer };
      }
    });

    return map;
  }, [results]);

  const set = useLiveQuery(
    () => (session?.setId ? db.sets.get(session.setId) : undefined),
    [session?.setId],
  );

  const previousAttempt = useLiveQuery(async () => {
    if (!session?.setId || typeof session.completedAt !== 'number') {
      return null;
    }

    const sessions = await db.sessions.where('setId').equals(session.setId).toArray();
    const previousSession = getPreviousSession(sessions, session);

    if (!previousSession?.id) {
      return null;
    }

    const previousResults = await db.results.where('sessionId').equals(previousSession.id).toArray();
    return { session: previousSession, results: previousResults };
  }, [session?.id, session?.setId, session?.completedAt]);

  if (session === undefined || results === undefined) {
    return <StandardShell><LoadingSpinner /></StandardShell>;
  }

  if (session === null || isNaN(id)) {
    return <StandardShell><NotFound message="Session not found" /></StandardShell>;
  }

  const derivedCorrect = results.filter((result) => result.outcome === 'correct').length;
  const derivedIncorrect = results.filter((result) => result.outcome === 'incorrect').length;
  const derivedFlagged = results.filter((result) => result.outcome === 'flagged').length;
  const fallbackTotal = (session.correctCount ?? 0) + (session.incorrectCount ?? 0) + (session.flaggedCount ?? 0);

  const correct = results.length > 0 ? derivedCorrect : session.correctCount ?? 0;
  const incorrect = results.length > 0 ? derivedIncorrect : session.incorrectCount ?? 0;
  const flagged = results.length > 0 ? derivedFlagged : session.flaggedCount ?? 0;
  const total = results.length > 0 ? results.length : session.totalCards ?? fallbackTotal;
  const currentScore = getScorePercentage(session, results);
  const pct = currentScore ?? 0;

  const donutData = [
    { name: 'Correct', value: correct, color: COLORS.correct },
    { name: 'Incorrect', value: incorrect, color: COLORS.incorrect },
  ].filter((segment) => segment.value > 0);

  const incorrectCardIds = [...new Set(results
    .filter((result) => result.outcome === 'incorrect')
    .map((result) => result.cardId))];
  const flaggedCardIds = [...new Set(results
    .filter((result) => result.outcome === 'flagged')
    .map((result) => result.cardId))];

  const averageResponseMs = getAverageResponseMs(results);
  const fastestResult = getFastestResult(results);
  const slowResults = getSlowestResults(results, SLOW_PREVIEW_LIMIT);
  const slowestResult = slowResults[0] ?? null;
  const sessionDurationMs = getSessionDurationMs(session);
  const timedResultsCount = results.filter((result) => (
    typeof result.responseMs === 'number'
    && Number.isFinite(result.responseMs)
    && result.responseMs >= 0
  )).length;

  const weakResults = getWeakResults(results);
  const weakPreview = weakResults.slice(0, WEAK_PREVIEW_LIMIT);
  const slowPreview = slowResults.slice(0, SLOW_PREVIEW_LIMIT);
  const focusCardIds = [...new Set([
    ...incorrectCardIds,
    ...flaggedCardIds,
    ...slowPreview.map((result) => result.cardId),
  ])];
  const hasMultipleSegments = donutData.length > 1;
  const reviewSetId = session.setId;
  const currentCorrectCount = getSessionCorrectCount(session, results);

  const previousAttemptState: 'loading' | 'ready' | 'none' = previousAttempt === undefined
    ? 'loading'
    : previousAttempt
      ? 'ready'
      : 'none';

  const previousScore = previousAttempt ? getScorePercentage(previousAttempt.session, previousAttempt.results) : null;
  const previousCorrectCount = previousAttempt ? getSessionCorrectCount(previousAttempt.session, previousAttempt.results) : null;
  const previousAverageResponseMs = previousAttempt ? getAverageResponseMs(previousAttempt.results) : null;
  const scoreDelta = getScoreDelta(currentScore, previousScore);
  const correctDeltaText = previousAttempt ? getCorrectDeltaText(currentCorrectCount, previousCorrectCount) : null;
  const averagePaceDeltaText = previousAttempt
    ? getAveragePaceDeltaText(averageResponseMs, previousAverageResponseMs)
    : null;

  const headline =
    pct === 100 ? 'Perfect score!' :
    pct >= 80 ? 'Great work!' :
    pct >= 60 ? 'Good effort' :
    pct >= 40 ? 'Keep practising' :
    "You'll get there";

  return (
    <StandardShell>
      <div className="max-w-2xl mx-auto">
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

        <h1 className="text-3xl font-bold text-app-primary mb-2">{headline}</h1>
        {set && <p className="text-sm text-app-secondary mb-8">{set.title}</p>}

        <div className="bg-app-surface border border-app-border rounded-card p-6 mb-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8">
            <div className="relative shrink-0 w-[180px] h-[180px] mx-auto sm:mx-0">
              {donutData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={46}
                      outerRadius={64}
                      paddingAngle={0}
                      stroke={hasMultipleSegments ? 'rgb(var(--app-surface))' : 'none'}
                      strokeWidth={hasMultipleSegments ? 2 : 0}
                      dataKey="value"
                      startAngle={90}
                      endAngle={-270}
                      labelLine={false}
                      isAnimationActive={false}
                    >
                      {donutData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full rounded-full border-[14px] border-app-border" />
              )}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-bold text-app-primary leading-none">{pct}%</span>
                <span className="mt-2 text-xs text-app-secondary">{correct}/{total}</span>
              </div>
            </div>

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
              {sessionDurationMs !== null && (
                <div className="pt-2 border-t border-app-border flex items-center justify-between">
                  <span className="text-xs text-app-secondary">Time</span>
                  <span className="text-xs text-app-secondary">{formatDuration(sessionDurationMs)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 mb-6 sm:grid-cols-2">
          <section className="bg-app-surface border border-app-border rounded-card p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-semibold text-app-primary">Timing summary</h2>
                <p className="text-xs text-app-secondary mt-1">
                  {timedResultsCount > 0
                    ? `Based on ${timedResultsCount} card${timedResultsCount === 1 ? '' : 's'}`
                    : 'Timing data not available for this session.'}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-card border border-app-border bg-app-surface-2 px-3 py-3">
                <p className="text-[11px] uppercase tracking-wide text-app-secondary">Average</p>
                <p className="mt-1 text-sm font-semibold text-app-primary">
                  {averageResponseMs !== null ? formatPerCardDuration(averageResponseMs) : 'Timing unavailable'}
                </p>
              </div>
              <div className="rounded-card border border-app-border bg-app-surface-2 px-3 py-3">
                <p className="text-[11px] uppercase tracking-wide text-app-secondary">Fastest</p>
                <p className="mt-1 text-sm font-semibold text-app-primary">
                  {fastestResult ? formatResponseTime(fastestResult.responseMs) : 'Timing unavailable'}
                </p>
              </div>
              <div className="rounded-card border border-app-border bg-app-surface-2 px-3 py-3">
                <p className="text-[11px] uppercase tracking-wide text-app-secondary">Slowest</p>
                <p className="mt-1 text-sm font-semibold text-app-primary">
                  {slowestResult ? formatResponseTime(slowestResult.responseMs) : 'Timing unavailable'}
                </p>
              </div>
              <div className="rounded-card border border-app-border bg-app-surface-2 px-3 py-3">
                <p className="text-[11px] uppercase tracking-wide text-app-secondary">Session</p>
                <p className="mt-1 text-sm font-semibold text-app-primary">
                  {sessionDurationMs !== null ? formatDuration(sessionDurationMs) : 'Timing unavailable'}
                </p>
              </div>
            </div>
          </section>

          <section className="bg-app-surface border border-app-border rounded-card p-5">
            <h2 className="text-sm font-semibold text-app-primary">Compared with last attempt</h2>
            <p className="text-sm text-app-secondary mt-2">
              {getScoreComparisonText(scoreDelta, previousAttemptState)}
            </p>
            {previousAttempt && (
              <div className="grid gap-3 mt-4">
                {correctDeltaText && (
                  <div className="rounded-card border border-app-border bg-app-surface-2 px-3 py-3">
                    <p className="text-[11px] uppercase tracking-wide text-app-secondary">Correct answers</p>
                    <p className="mt-1 text-sm font-semibold text-app-primary">{correctDeltaText}</p>
                  </div>
                )}
                {averagePaceDeltaText && (
                  <div className="rounded-card border border-app-border bg-app-surface-2 px-3 py-3">
                    <p className="text-[11px] uppercase tracking-wide text-app-secondary">Average pace</p>
                    <p className="mt-1 text-sm font-semibold text-app-primary">{averagePaceDeltaText}</p>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        <div className="grid grid-cols-1 gap-3 mb-8 sm:grid-cols-2">
          <Button
            variant="secondary"
            disabled={flaggedCardIds.length === 0}
            title={flaggedCardIds.length === 0 ? 'No flagged cards' : 'Review flagged cards'}
            onClick={() => navigate(`/review/${reviewSetId}`, { state: { mode: 'flagged', cardIds: flaggedCardIds } })}
          >
            <span className="text-app-flag">⚑</span> Review Flagged ({flagged})
          </Button>
          <Button
            variant="secondary"
            disabled={incorrectCardIds.length === 0}
            title={incorrectCardIds.length === 0 ? 'No incorrect cards' : 'Retake weak cards'}
            onClick={() => navigate(`/review/${reviewSetId}`, { state: { mode: 'incorrect-only', cardIds: incorrectCardIds } })}
          >
            <span className="text-app-incorrect">✗</span> Retake Weak ({incorrect})
          </Button>
          <Button
            variant="secondary"
            disabled={focusCardIds.length === 0}
            title={focusCardIds.length === 0 ? 'No weak or slow cards' : 'Review weak and slow cards'}
            onClick={() => navigate(`/review/${reviewSetId}`, { state: { mode: 'incorrect-only', cardIds: focusCardIds } })}
          >
            Review Focus Cards ({focusCardIds.length})
          </Button>
          <Button onClick={() => navigate(`/review/${reviewSetId}`, { state: { mode: 'full' } })}>
            Retake Full Set
          </Button>
          <Button variant="ghost" onClick={() => navigate(set ? `/set/${set.id}` : '/')} className="sm:col-span-2">
            Exit
          </Button>
        </div>

        <div className="space-y-6 mb-8">
          <section className="bg-app-surface border border-app-border rounded-card p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-semibold text-app-primary">Weak cards</h2>
                <p className="text-xs text-app-secondary mt-1">
                  {weakResults.length === 0
                    ? 'No incorrect or flagged cards in this session.'
                    : `${weakResults.length} card${weakResults.length === 1 ? '' : 's'} to review next`}
                </p>
              </div>
            </div>

            {weakPreview.length > 0 ? (
              <div className="space-y-2">
                {weakPreview.map((result) => {
                  const card = cardMap?.[result.cardId];
                  const meta = OUTCOME_META[result.outcome];

                  return (
                    <div
                      key={`weak-${result.id}`}
                      className="rounded-card border border-app-border bg-app-surface-2 px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          {card ? (
                            <>
                              <p className="text-sm text-app-primary line-clamp-2">{card.question}</p>
                              <p className="mt-1 text-xs text-app-secondary line-clamp-1">{card.answer}</p>
                            </>
                          ) : cardMap === undefined ? (
                            <p className="text-sm text-app-secondary italic">Loading card details...</p>
                          ) : (
                            <p className="text-sm text-app-secondary italic">Card no longer exists</p>
                          )}
                        </div>
                        <span className={clsx('shrink-0 rounded-full border px-2 py-1 text-[11px] font-medium', meta.badge)}>
                          {meta.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {weakResults.length > weakPreview.length && (
                  <p className="text-xs text-app-secondary">
                    +{weakResults.length - weakPreview.length} more weak card{weakResults.length - weakPreview.length === 1 ? '' : 's'} in this session.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-app-secondary">Everything here was marked correct.</p>
            )}
          </section>

          <section className="bg-app-surface border border-app-border rounded-card p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-semibold text-app-primary">Slow cards</h2>
                <p className="text-xs text-app-secondary mt-1">
                  {timedResultsCount > 0
                    ? `Longest response times from this session`
                    : 'Timing data not available for this session.'}
                </p>
              </div>
            </div>

            {slowPreview.length > 0 ? (
              <div className="space-y-2">
                {slowPreview.map((result) => {
                  const card = cardMap?.[result.cardId];

                  return (
                    <div
                      key={`slow-${result.id}`}
                      className="rounded-card border border-app-border bg-app-surface-2 px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          {card ? (
                            <>
                              <p className="text-sm text-app-primary line-clamp-2">{card.question}</p>
                              <p className="mt-1 text-xs text-app-secondary line-clamp-1">{card.answer}</p>
                            </>
                          ) : cardMap === undefined ? (
                            <p className="text-sm text-app-secondary italic">Loading card details...</p>
                          ) : (
                            <p className="text-sm text-app-secondary italic">Card no longer exists</p>
                          )}
                        </div>
                        <span className="shrink-0 rounded-full border border-app-border px-2 py-1 text-[11px] font-medium text-app-primary">
                          {formatResponseTime(result.responseMs)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-app-secondary">Timing data not available for this session.</p>
            )}
          </section>
        </div>

        {results.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-app-secondary uppercase tracking-wide mb-3">
              Card breakdown
            </h2>
            <div className="space-y-2">
              {results.map((result) => {
                const card = cardMap?.[result.cardId];
                const meta = OUTCOME_META[result.outcome];

                return (
                  <div
                    key={result.id}
                    className={clsx(
                      'flex items-start gap-4 bg-app-surface border rounded-card px-4 py-3',
                      meta.text,
                      meta.rowBorder,
                    )}
                  >
                    <span className={clsx('text-sm font-bold mt-0.5 shrink-0', meta.text)}>
                      {meta.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      {card ? (
                        <>
                          <p className="text-sm text-app-primary">{card.question}</p>
                          <p className="text-xs text-app-secondary mt-0.5">{card.answer}</p>
                        </>
                      ) : cardMap === undefined ? (
                        <p className="text-sm text-app-secondary italic">Loading card details...</p>
                      ) : (
                        <p className="text-sm text-app-secondary italic">Card no longer exists</p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                        <span className={clsx('font-medium', meta.text)}>{meta.label}</span>
                        <span className="text-app-secondary">
                          {typeof result.responseMs === 'number' && Number.isFinite(result.responseMs)
                            ? formatResponseTime(result.responseMs)
                            : 'Timing unavailable'}
                        </span>
                      </div>
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
