import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import {
  getAnalyticsMeta,
  rebuildAnalyticsRollups,
  shouldRebuildAnalyticsFromMeta,
} from '../../db/repositories/analyticsRepo';
import { buildCardRetentions } from '../../domain/analyticsRollups';
import { useToast } from '../../context/ToastContext';
import { StandardShell } from '../../shared/layouts/StandardShell';
import { Button } from '../../shared/components/Button';
import { EmptyState, LoadingSpinner, PageHeader } from '../../shared/components/StateViews';
import { AccuracyTrendChart } from './components/AccuracyTrendChart';
import { MetricCard } from './components/MetricCard';
import { SetPerformanceTable } from './components/SetPerformanceTable';
import { StudyHeatmap } from './components/StudyHeatmap';
import { WeakCardsList } from './components/WeakCardsList';
import {
  formatDuration,
  getAverageAccuracy,
  getAverageAccuracyFromDailyStats,
  getDailyStatMap,
  getDailyStudyStats,
  getDailyStudyStatsFromRollups,
  getRecentDays,
  getSetPerformance,
  getSetPerformanceFromRollups,
  getStudyStreak,
  getWeakCards,
} from './analyticsQueries';

type TrendPoint = {
  label: string;
  fullLabel: string;
  accuracy: number;
  reviewedCount: number;
};

export function AnalyticsPage() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [lastAutoRebuildKey, setLastAutoRebuildKey] = useState<string | null>(null);

  const analyticsBaseData = useLiveQuery(async () => {
    const [dailyRollups, setRollups, cardRetentions, cards, sets, packs, completedSessionCount, analyticsMeta] = await Promise.all([
      db.dailyStudyRollups.orderBy('dateKey').toArray(),
      db.setStudyRollups.toArray(),
      db.cardRetentions.toArray(),
      db.cards.toArray(),
      db.sets.toArray(),
      db.packs.toArray(),
      db.sessions.where('completedAt').above(0).count(),
      getAnalyticsMeta(),
    ]);

    return {
      dailyRollups,
      setRollups,
      cardRetentions,
      cards,
      sets,
      packs,
      completedSessionCount,
      analyticsMeta,
    };
  }, []);

  const hasCompletedSessions = (analyticsBaseData?.completedSessionCount ?? 0) > 0;
  const hasDailyRollups = (analyticsBaseData?.dailyRollups.length ?? 0) > 0;
  const hasSetRollups = (analyticsBaseData?.setRollups.length ?? 0) > 0;
  const hasCardRetentions = (analyticsBaseData?.cardRetentions.length ?? 0) > 0;
  const hasAnyRollupData = hasDailyRollups || hasSetRollups || hasCardRetentions;
  const hasAnalyticsState = hasCompletedSessions || hasAnyRollupData;
  const rollupsNeedRebuild = hasAnalyticsState && (
    shouldRebuildAnalyticsFromMeta(analyticsBaseData?.analyticsMeta)
    || (hasCompletedSessions && (!hasDailyRollups || !hasSetRollups || !hasCardRetentions))
    || (!hasCompletedSessions && hasAnyRollupData)
  );
  const shouldLoadRawFallback = hasCompletedSessions && rollupsNeedRebuild;
  const autoRebuildKey = analyticsBaseData
    ? [
      analyticsBaseData.completedSessionCount,
      analyticsBaseData.dailyRollups.length,
      analyticsBaseData.setRollups.length,
      analyticsBaseData.cardRetentions.length,
      analyticsBaseData.analyticsMeta?.dirty ? analyticsBaseData.analyticsMeta.lastMarkedDirtyAt ?? 'dirty' : 'clean',
      analyticsBaseData.analyticsMeta?.version ?? 'none',
    ].join(':')
    : null;

  const rawFallbackData = useLiveQuery(async () => {
    if (!shouldLoadRawFallback) {
      return null;
    }

    const [sessions, results, stats] = await Promise.all([
      db.sessions.toArray(),
      db.results.toArray(),
      db.stats.toArray(),
    ]);

    return { sessions, results, stats };
  }, [shouldLoadRawFallback]);

  const handleRebuildAnalytics = useCallback(async (showSuccessToast = true) => {
    setIsRebuilding(true);
    try {
      await rebuildAnalyticsRollups();
      if (showSuccessToast) {
        addToast('Analytics recalculated', 'success');
      }
    } catch (error) {
      console.error(error);
      addToast('Analytics recalculation failed', 'error');
    } finally {
      setIsRebuilding(false);
    }
  }, [addToast]);

  useEffect(() => {
    if (!analyticsBaseData || !rollupsNeedRebuild || isRebuilding || !autoRebuildKey) {
      return;
    }

    if (autoRebuildKey === lastAutoRebuildKey) {
      return;
    }

    setLastAutoRebuildKey(autoRebuildKey);
    void handleRebuildAnalytics(false);
  }, [analyticsBaseData, autoRebuildKey, handleRebuildAnalytics, isRebuilding, lastAutoRebuildKey, rollupsNeedRebuild]);

  const dashboard = useMemo(() => {
    if (!analyticsBaseData) {
      return null;
    }

    if (shouldLoadRawFallback && rawFallbackData === undefined) {
      return null;
    }

    const useStoredRollups = !shouldLoadRawFallback;
    const rawCardRetentions = rawFallbackData
      ? buildCardRetentions({
        sessions: rawFallbackData.sessions,
        results: rawFallbackData.results,
        stats: rawFallbackData.stats,
        cards: analyticsBaseData.cards,
      })
      : [];
    const resolvedCardRetentions = useStoredRollups && hasCardRetentions ? analyticsBaseData.cardRetentions : rawCardRetentions;
    const dailyStats = useStoredRollups && hasDailyRollups
      ? getDailyStudyStatsFromRollups(analyticsBaseData.dailyRollups)
      : rawFallbackData
        ? getDailyStudyStats(rawFallbackData.sessions, rawFallbackData.results)
        : [];
    const dailyStatMap = getDailyStatMap(dailyStats);
    const recentWeek = getRecentDays(7);
    const recentTrendDays = getRecentDays(14);
    const recentHeatmapDays = getRecentDays(28);
    const weakCards = getWeakCards(
      analyticsBaseData.cards,
      rawFallbackData?.stats ?? [],
      analyticsBaseData.sets,
      resolvedCardRetentions,
    );
    const weakCardIdsBySet = new Map<number, number[]>();

    for (const weakCard of weakCards) {
      const existing = weakCardIdsBySet.get(weakCard.setId);
      if (existing) {
        existing.push(weakCard.cardId);
      } else {
        weakCardIdsBySet.set(weakCard.setId, [weakCard.cardId]);
      }
    }

    const today = recentWeek[recentWeek.length - 1];
    const cardsReviewedToday = today ? (dailyStatMap.get(today.dayKey)?.reviewedCount ?? 0) : 0;
    const cardsReviewedThisWeek = recentWeek.reduce((sum, day) => sum + (dailyStatMap.get(day.dayKey)?.reviewedCount ?? 0), 0);
    const studyTimeThisWeekMs = recentWeek.reduce((sum, day) => sum + (dailyStatMap.get(day.dayKey)?.durationMs ?? 0), 0);
    const timedDaysThisWeek = recentWeek.reduce((sum, day) => sum + (dailyStatMap.get(day.dayKey)?.durationSessionCount ?? 0), 0);
    const averageAccuracy = useStoredRollups && hasDailyRollups
      ? getAverageAccuracyFromDailyStats(dailyStats)
      : rawFallbackData
        ? getAverageAccuracy(rawFallbackData.results, rawFallbackData.sessions)
        : null;
    const studyStreak = getStudyStreak(dailyStats);
    const setPerformance = useStoredRollups && hasSetRollups
      ? getSetPerformanceFromRollups(
        analyticsBaseData.sets,
        analyticsBaseData.packs,
        analyticsBaseData.cards,
        analyticsBaseData.setRollups,
        resolvedCardRetentions,
      )
      : rawFallbackData
        ? getSetPerformance(
          analyticsBaseData.sets,
          rawFallbackData.sessions,
          rawFallbackData.results,
          rawFallbackData.stats,
          analyticsBaseData.cards,
          analyticsBaseData.packs,
          resolvedCardRetentions,
        )
        : [];

    return {
      hasCompletedSessions,
      cardsReviewedToday,
      cardsReviewedThisWeek,
      studyTimeThisWeekMs,
      timedDaysThisWeek,
      averageAccuracy,
      studyStreak,
      weakCards,
      setPerformance,
      trendData: recentTrendDays
        .map((day) => {
          const stat = dailyStatMap.get(day.dayKey);
          return stat && stat.reviewedCount > 0
            ? {
              label: day.label,
              fullLabel: day.fullLabel,
              accuracy: stat.accuracy ?? 0,
              reviewedCount: stat.reviewedCount,
            }
            : null;
        })
        .filter((point): point is TrendPoint => point !== null),
      heatmapDays: recentHeatmapDays.map((day) => ({
        dayKey: day.dayKey,
        fullLabel: day.fullLabel,
        reviewedCount: dailyStatMap.get(day.dayKey)?.reviewedCount ?? 0,
      })),
      topWeakCards: weakCards.slice(0, 10).map((card) => ({
        ...card,
        setWeakCardIds: weakCardIdsBySet.get(card.setId) ?? [card.cardId],
      })),
    };
  }, [analyticsBaseData, hasCardRetentions, hasCompletedSessions, hasDailyRollups, hasSetRollups, rawFallbackData, shouldLoadRawFallback]);

  const startFocusedReview = useCallback((setId: number, cardIds: number[]) => {
    const uniqueCardIds = [...new Set(cardIds)]
      .filter((cardId): cardId is number => Number.isFinite(cardId));

    if (uniqueCardIds.length === 0) {
      return;
    }

    navigate(`/review/${setId}`, {
      state: {
        mode: 'incorrect-only',
        cardIds: uniqueCardIds,
      },
    });
  }, [navigate]);

  if (analyticsBaseData === undefined || dashboard === null) {
    return (
      <StandardShell>
        <LoadingSpinner message={isRebuilding ? 'Refreshing analytics…' : 'Loading analytics…'} />
      </StandardShell>
    );
  }

  return (
    <StandardShell>
      <PageHeader
        title="Analytics"
        subtitle="Track your learning progress across your flashcards"
        actions={hasCompletedSessions ? (
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <Button
              variant="ghost"
              size="sm"
              loading={isRebuilding}
              onClick={() => { void handleRebuildAnalytics(true); }}
            >
              Recalculate analytics
            </Button>
            <p className="text-[11px] text-app-secondary">
              {isRebuilding ? 'Refreshing local rollups from completed sessions.' : 'Local only. Rollups rebuild from completed sessions.'}
            </p>
          </div>
        ) : undefined}
      />

      {!dashboard.hasCompletedSessions ? (
        <div className="rounded-card border border-app-border bg-app-surface">
          <EmptyState
            icon={(
              <svg className="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 19h16M7 16l3-4 3 2 4-6 3 4"
                />
              </svg>
            )}
            title="Complete a review session to unlock analytics."
            description="Your longer-term study trends, weak cards, retention labels, and set performance will appear here after you finish a session."
          />
        </div>
      ) : (
        <div className="space-y-6">
          <section className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard
              label="Cards reviewed today"
              value={dashboard.cardsReviewedToday.toLocaleString()}
              hint="Completed sessions today"
              accent="nav"
            />
            <MetricCard
              label="Cards reviewed this week"
              value={dashboard.cardsReviewedThisWeek.toLocaleString()}
              hint="Last 7 days"
              accent="nav"
            />
            <MetricCard
              label="Current study streak"
              value={dashboard.studyStreak.toLocaleString()}
              hint={`${dashboard.studyStreak === 1 ? 'day' : 'days'} in a row`}
              accent="correct"
            />
            <MetricCard
              label="Average accuracy"
              value={dashboard.averageAccuracy !== null ? `${dashboard.averageAccuracy}%` : 'No data'}
              hint="Across completed sessions"
              accent="correct"
            />
            <MetricCard
              label="Total study time this week"
              value={dashboard.timedDaysThisWeek > 0 ? formatDuration(dashboard.studyTimeThisWeekMs) : 'Timing unavailable'}
              hint="Last 7 days"
              accent="nav"
            />
            <MetricCard
              label="Weak cards count"
              value={dashboard.weakCards.length.toLocaleString()}
              hint="Due or needs-practice cards"
              accent={dashboard.weakCards.length > 0 ? 'incorrect' : 'flag'}
            />
          </section>

          <AccuracyTrendChart data={dashboard.trendData} />
          <StudyHeatmap days={dashboard.heatmapDays} />
          <SetPerformanceTable rows={dashboard.setPerformance} onReviewWeakCards={startFocusedReview} />
          <WeakCardsList
            items={dashboard.topWeakCards}
            onReviewCard={(setId, cardId) => startFocusedReview(setId, [cardId])}
            onReviewSetWeakCards={startFocusedReview}
          />
        </div>
      )}
    </StandardShell>
  );
}
