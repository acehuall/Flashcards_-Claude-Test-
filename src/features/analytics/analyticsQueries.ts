import type {
  Card,
  CardRetention,
  CardRetentionStatus,
  DailyStudyRollup,
  FlashSet,
  Pack,
  Result,
  Session,
  SetStudyRollup,
  Stat,
} from '../../domain/types';

const DAY_LABEL_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
});

const FULL_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

export interface CompletedSession extends Session {
  id: number;
  completedAt: number;
}

export interface DailyStudyStat {
  dayKey: string;
  dayStart: number;
  label: string;
  fullLabel: string;
  reviewedCount: number;
  correctCount: number;
  incorrectCount: number;
  flaggedCount: number;
  accuracy: number | null;
  sessionCount: number;
  durationMs: number;
  durationSessionCount: number;
}

export interface RecentDay {
  dayKey: string;
  dayStart: number;
  label: string;
  fullLabel: string;
}

export interface WeakCardInsight {
  cardId: number;
  setId: number;
  question: string;
  setTitle: string;
  reviewCount: number;
  missedCount: number;
  missRate: number;
  lastReviewedAt: number | null;
  avgResponseMs: number | null;
  retentionScore: number;
  retentionStatus: CardRetentionStatus;
  daysSinceLastReview: number | null;
  canReview: boolean;
}

export type RetentionFocusStatus = Extract<CardRetentionStatus, 'due' | 'needs-practice'>;

export interface RetentionStatusCounts {
  strong: number;
  improving: number;
  'needs-practice': number;
  'not-reviewed-recently': number;
  due: number;
}

export interface SetPerformanceRow {
  setId: number;
  title: string;
  packName: string | null;
  totalReviewed: number;
  completedSessions: number;
  accuracy: number | null;
  averageResponseMs: number | null;
  lastReviewedAt: number | null;
  weakCardCount: number;
  weakCardIds: number[];
  canReviewWeakCards: boolean;
  retentionCounts: RetentionStatusCounts;
  primaryRetentionStatus: CardRetentionStatus | null;
  focusCardIds: number[];
  focusStatus: RetentionFocusStatus | null;
  canReviewFocusCards: boolean;
}

type SessionSummary = {
  totalReviewed: number;
  correctCount: number;
  incorrectCount: number;
  flaggedCount: number;
  timedCount: number;
  timedTotalMs: number;
};

type SetStatsFallback = {
  totalReviewed: number;
  correctCount: number;
  lastReviewedAt: number | null;
  timedReviewCount: number;
  timedTotalMs: number;
};

type SetRetentionDetails = {
  retentionCounts: RetentionStatusCounts;
  primaryRetentionStatus: CardRetentionStatus | null;
  weakCardIds: number[];
  canReviewWeakCards: boolean;
  focusCardIds: number[];
  focusStatus: RetentionFocusStatus | null;
  canReviewFocusCards: boolean;
};

export const RETENTION_STATUS_LABELS: Record<CardRetentionStatus, string> = {
  strong: 'Strong',
  improving: 'Improving',
  'needs-practice': 'Needs practice',
  'not-reviewed-recently': 'Not reviewed recently',
  due: 'Due',
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasNumericId<T extends { id?: number }>(record: T): record is T & { id: number } {
  return isFiniteNumber(record.id);
}

function toValidDate(value: Date | number): Date | null {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getDayKey(date: Date | number): string {
  const resolved = toValidDate(date);
  if (!resolved) return 'invalid-day';

  const year = resolved.getFullYear();
  const month = String(resolved.getMonth() + 1).padStart(2, '0');
  const day = String(resolved.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getStartOfDay(date: Date | number): number | null {
  const resolved = toValidDate(date);
  if (!resolved) return null;

  resolved.setHours(0, 0, 0, 0);
  return resolved.getTime();
}

function parseDayKey(dayKey: string): number | null {
  const [year, month, day] = dayKey.split('-').map((part) => parseInt(part, 10));
  if (!year || !month || !day) return null;

  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function shiftDay(dayStart: number, amount: number): number {
  const date = new Date(dayStart);
  date.setDate(date.getDate() + amount);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function roundPercentage(value: number): number {
  return Math.round(value * 100);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function createEmptyRetentionStatusCounts(): RetentionStatusCounts {
  return {
    strong: 0,
    improving: 0,
    'needs-practice': 0,
    'not-reviewed-recently': 0,
    due: 0,
  };
}

function getRetentionStatusPriority(status: CardRetentionStatus): number {
  switch (status) {
    case 'due':
      return 0;
    case 'needs-practice':
      return 1;
    case 'not-reviewed-recently':
      return 2;
    case 'improving':
      return 3;
    case 'strong':
      return 4;
    default:
      return 5;
  }
}

function buildApproximateMissedCount(reviewCount: number, lifetimeAccuracy: number): number {
  if (reviewCount <= 0) {
    return 0;
  }

  return Math.max(0, reviewCount - Math.round(clamp(lifetimeAccuracy, 0, 1) * reviewCount));
}

export function getRetentionStatusLabel(status: CardRetentionStatus): string {
  return RETENTION_STATUS_LABELS[status];
}

function getCardQuestion(card: Card | undefined): string {
  if (!card) {
    return 'Deleted card';
  }

  return card.deletedAt ? `${card.question} (deleted)` : card.question;
}

function getPrimaryRetentionStatus(counts: RetentionStatusCounts): CardRetentionStatus | null {
  if (counts.due > 0) {
    return 'due';
  }

  if (counts['needs-practice'] > 0) {
    return 'needs-practice';
  }

  if (counts['not-reviewed-recently'] > 0) {
    return 'not-reviewed-recently';
  }

  if (counts.improving > 0) {
    return 'improving';
  }

  if (counts.strong > 0) {
    return 'strong';
  }

  return null;
}

function getStatReviewCount(stat: Stat): number {
  return stat.reviewCount ?? (stat.correctCount + stat.incorrectCount + stat.flaggedCount);
}

function getSessionFallbackTotal(session: Pick<Session, 'totalCards' | 'correctCount' | 'incorrectCount' | 'flaggedCount'>): number {
  const countFallback = (session.correctCount ?? 0) + (session.incorrectCount ?? 0) + (session.flaggedCount ?? 0);
  return session.totalCards ?? countFallback;
}

function buildCompletedResultMap(completedSessions: CompletedSession[], results: Result[]): Map<number, Result[]> {
  const completedSessionIds = new Set(completedSessions.map((session) => session.id));
  const resultsBySessionId = new Map<number, Result[]>();

  for (const result of results) {
    if (!completedSessionIds.has(result.sessionId)) {
      continue;
    }

    const sessionResults = resultsBySessionId.get(result.sessionId);
    if (sessionResults) {
      sessionResults.push(result);
    } else {
      resultsBySessionId.set(result.sessionId, [result]);
    }
  }

  return resultsBySessionId;
}

function getSessionSummary(session: Session, sessionResults: Result[]): SessionSummary {
  if (sessionResults.length > 0) {
    let correctCount = 0;
    let incorrectCount = 0;
    let flaggedCount = 0;
    let timedCount = 0;
    let timedTotalMs = 0;

    for (const result of sessionResults) {
      if (result.outcome === 'correct') {
        correctCount += 1;
      } else if (result.outcome === 'incorrect') {
        incorrectCount += 1;
      } else if (result.outcome === 'flagged') {
        flaggedCount += 1;
      }

      if (isFiniteNumber(result.responseMs) && result.responseMs >= 0) {
        timedCount += 1;
        timedTotalMs += result.responseMs;
      }
    }

    return {
      totalReviewed: sessionResults.length,
      correctCount,
      incorrectCount,
      flaggedCount,
      timedCount,
      timedTotalMs,
    };
  }

  return {
    totalReviewed: getSessionFallbackTotal(session),
    correctCount: session.correctCount ?? 0,
    incorrectCount: session.incorrectCount ?? 0,
    flaggedCount: session.flaggedCount ?? 0,
    timedCount: 0,
    timedTotalMs: 0,
  };
}

function getSetTitle(set: FlashSet | undefined): string {
  if (!set) {
    return 'Deleted set';
  }

  return set.deletedAt ? `${set.title} (deleted)` : set.title;
}

function getPackName(set: FlashSet | undefined, packMap: Map<number, Pack>): string | null {
  if (!set) {
    return null;
  }

  const pack = packMap.get(set.packId);
  if (!pack) {
    return null;
  }

  return pack.deletedAt ? `${pack.name} (deleted)` : pack.name;
}

export function formatDuration(ms: number): string {
  const safeMs = Math.max(0, ms);
  const totalSeconds = safeMs / 1000;

  if (safeMs < 10000) {
    return `${totalSeconds.toFixed(1)}s`;
  }

  if (safeMs < 60000) {
    return `${Math.round(totalSeconds)}s`;
  }

  const roundedMinutes = Math.round(safeMs / 60000);
  if (safeMs < 3600000) {
    return `${roundedMinutes}m`;
  }

  const totalMinutes = Math.round(safeMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

export function formatDate(value: Date | number | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (value == null) {
    return 'Unknown date';
  }

  const date = toValidDate(value);
  if (!date) {
    return 'Unknown date';
  }

  return new Intl.DateTimeFormat(undefined, options ?? {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function getCompletedSessions(sessions: Session[]): CompletedSession[] {
  return sessions
    .filter((session): session is CompletedSession => (
      isFiniteNumber(session.id)
      && isFiniteNumber(session.completedAt)
    ))
    .slice()
    .sort((a, b) => a.completedAt - b.completedAt);
}

export function getSessionDuration(session: Pick<Session, 'startedAt' | 'completedAt' | 'durationMs'>): number | null {
  if (isFiniteNumber(session.durationMs)) {
    return Math.max(0, session.durationMs);
  }

  if (isFiniteNumber(session.startedAt) && isFiniteNumber(session.completedAt)) {
    return Math.max(0, session.completedAt - session.startedAt);
  }

  return null;
}

export function getDailyStudyStats(sessions: Session[], results: Result[]): DailyStudyStat[] {
  const completedSessions = getCompletedSessions(sessions);
  const resultsBySessionId = buildCompletedResultMap(completedSessions, results);
  const dailyMap = new Map<string, DailyStudyStat>();

  for (const session of completedSessions) {
    const dayStart = getStartOfDay(session.completedAt);
    if (dayStart === null) {
      continue;
    }

    const dayKey = getDayKey(dayStart);
    const sessionResults = resultsBySessionId.get(session.id) ?? [];
    const summary = getSessionSummary(session, sessionResults);
    const durationMs = getSessionDuration(session);

    const existing = dailyMap.get(dayKey);
    if (existing) {
      existing.reviewedCount += summary.totalReviewed;
      existing.correctCount += summary.correctCount;
      existing.incorrectCount += summary.incorrectCount;
      existing.flaggedCount += summary.flaggedCount;
      existing.sessionCount += 1;
      if (durationMs !== null) {
        existing.durationMs += durationMs;
        existing.durationSessionCount += 1;
      }
    } else {
      dailyMap.set(dayKey, {
        dayKey,
        dayStart,
        label: DAY_LABEL_FORMATTER.format(dayStart),
        fullLabel: FULL_DATE_FORMATTER.format(dayStart),
        reviewedCount: summary.totalReviewed,
        correctCount: summary.correctCount,
        incorrectCount: summary.incorrectCount,
        flaggedCount: summary.flaggedCount,
        accuracy: null,
        sessionCount: 1,
        durationMs: durationMs ?? 0,
        durationSessionCount: durationMs === null ? 0 : 1,
      });
    }
  }

  return [...dailyMap.values()]
    .map((stat) => ({
      ...stat,
      accuracy: stat.reviewedCount > 0 ? roundPercentage(stat.correctCount / stat.reviewedCount) : null,
    }))
    .sort((a, b) => a.dayStart - b.dayStart);
}

export function getDailyStudyStatsFromRollups(dailyRollups: DailyStudyRollup[]): DailyStudyStat[] {
  return dailyRollups
    .map((rollup) => {
      const dayStart = parseDayKey(rollup.dateKey);
      if (dayStart === null) {
        return null;
      }

      return {
        dayKey: rollup.dateKey,
        dayStart,
        label: DAY_LABEL_FORMATTER.format(dayStart),
        fullLabel: FULL_DATE_FORMATTER.format(dayStart),
        reviewedCount: Math.max(0, rollup.reviewedCount),
        correctCount: Math.max(0, rollup.correctCount),
        incorrectCount: Math.max(0, rollup.incorrectCount),
        flaggedCount: Math.max(0, rollup.flaggedCount),
        accuracy: rollup.reviewedCount > 0 ? roundPercentage(rollup.correctCount / rollup.reviewedCount) : null,
        sessionCount: Math.max(0, rollup.sessionCount),
        durationMs: Math.max(0, rollup.totalDurationMs),
        durationSessionCount: Math.max(0, rollup.sessionCount),
      } satisfies DailyStudyStat;
    })
    .filter((stat): stat is DailyStudyStat => stat !== null)
    .sort((a, b) => a.dayStart - b.dayStart);
}

export function getStudyStreak(dailyStats: DailyStudyStat[], now = Date.now()): number {
  const activeDays = new Set(
    dailyStats
      .filter((day) => day.reviewedCount > 0 || day.sessionCount > 0)
      .map((day) => day.dayKey),
  );

  const todayStart = getStartOfDay(now);
  if (todayStart === null) {
    return 0;
  }

  const todayKey = getDayKey(todayStart);
  const yesterdayStart = shiftDay(todayStart, -1);
  const streakStart = activeDays.has(todayKey)
    ? todayStart
    : activeDays.has(getDayKey(yesterdayStart))
      ? yesterdayStart
      : null;

  if (streakStart === null) {
    return 0;
  }

  let streak = 0;
  let currentDay = streakStart;

  while (activeDays.has(getDayKey(currentDay))) {
    streak += 1;
    currentDay = shiftDay(currentDay, -1);
  }

  return streak;
}

export function getAverageAccuracy(results: Result[], sessions: Session[]): number | null {
  const completedSessions = getCompletedSessions(sessions);
  const resultsBySessionId = buildCompletedResultMap(completedSessions, results);

  let totalReviewed = 0;
  let totalCorrect = 0;

  for (const session of completedSessions) {
    const summary = getSessionSummary(session, resultsBySessionId.get(session.id) ?? []);
    totalReviewed += summary.totalReviewed;
    totalCorrect += summary.correctCount;
  }

  return totalReviewed > 0 ? roundPercentage(totalCorrect / totalReviewed) : null;
}

export function getAverageAccuracyFromDailyStats(dailyStats: DailyStudyStat[]): number | null {
  const totals = dailyStats.reduce((accumulator, stat) => ({
    reviewedCount: accumulator.reviewedCount + stat.reviewedCount,
    correctCount: accumulator.correctCount + stat.correctCount,
  }), {
    reviewedCount: 0,
    correctCount: 0,
  });

  return totals.reviewedCount > 0
    ? roundPercentage(totals.correctCount / totals.reviewedCount)
    : null;
}

function getSetRetentionDetails(
  setId: number,
  set: FlashSet | undefined,
  cardsById: Map<number, Card>,
  retentionsBySet: Map<number, CardRetention[]>,
): SetRetentionDetails {
  const retentionCounts = createEmptyRetentionStatusCounts();
  const weakCardIds: number[] = [];
  const dueCardIds: number[] = [];
  const needsPracticeCardIds: number[] = [];

  for (const retention of retentionsBySet.get(setId) ?? []) {
    const card = cardsById.get(retention.cardId);
    if (!card || card.deletedAt) {
      continue;
    }

    retentionCounts[retention.status] += 1;

    if (retention.status === 'due') {
      weakCardIds.push(retention.cardId);
      dueCardIds.push(retention.cardId);
      continue;
    }

    if (retention.status === 'needs-practice') {
      weakCardIds.push(retention.cardId);
      needsPracticeCardIds.push(retention.cardId);
    }
  }

  const focusStatus: RetentionFocusStatus | null = dueCardIds.length > 0
    ? 'due'
    : needsPracticeCardIds.length > 0
      ? 'needs-practice'
      : null;
  const focusCardIds = focusStatus === 'due' ? dueCardIds : focusStatus === 'needs-practice' ? needsPracticeCardIds : [];
  const canReview = Boolean(set && !set.deletedAt);

  return {
    retentionCounts,
    primaryRetentionStatus: getPrimaryRetentionStatus(retentionCounts),
    weakCardIds,
    canReviewWeakCards: canReview && weakCardIds.length > 0,
    focusCardIds,
    focusStatus,
    canReviewFocusCards: canReview && focusCardIds.length > 0,
  };
}

function getFallbackSetRetentionDetails(set: FlashSet | undefined, weakCardIds: number[]): SetRetentionDetails {
  const retentionCounts = createEmptyRetentionStatusCounts();
  if (weakCardIds.length > 0) {
    retentionCounts['needs-practice'] = weakCardIds.length;
  }

  const canReview = Boolean(set && !set.deletedAt && weakCardIds.length > 0);

  return {
    retentionCounts,
    primaryRetentionStatus: weakCardIds.length > 0 ? 'needs-practice' : null,
    weakCardIds,
    canReviewWeakCards: canReview,
    focusCardIds: weakCardIds,
    focusStatus: weakCardIds.length > 0 ? 'needs-practice' : null,
    canReviewFocusCards: canReview,
  };
}

export function getWeakCards(cards: Card[], stats: Stat[], sets: FlashSet[], cardRetentions: CardRetention[] = []): WeakCardInsight[] {
  if (cardRetentions.length > 0) {
    const cardById = new Map(cards.filter(hasNumericId).map((card) => [card.id, card] as const));
    const setMap = new Map(sets.filter(hasNumericId).map((set) => [set.id, set] as const));

    return cardRetentions
      .filter((retention) => retention.status === 'due' || retention.status === 'needs-practice')
      .map((retention) => {
        const card = cardById.get(retention.cardId);
        const set = setMap.get(retention.setId);
        const reviewCount = Math.max(0, retention.reviewCount);
        const missRate = reviewCount > 0 ? clamp(1 - retention.lifetimeAccuracy, 0, 1) : 0;

        return {
          cardId: retention.cardId,
          setId: retention.setId,
          question: getCardQuestion(card),
          setTitle: getSetTitle(set),
          reviewCount,
          missedCount: buildApproximateMissedCount(reviewCount, retention.lifetimeAccuracy),
          missRate,
          lastReviewedAt: retention.lastReviewedAt ?? null,
          avgResponseMs: isFiniteNumber(retention.avgResponseMs) ? retention.avgResponseMs : null,
          retentionScore: retention.retentionScore,
          retentionStatus: retention.status,
          daysSinceLastReview: retention.daysSinceLastReview ?? null,
          canReview: Boolean(card && !card.deletedAt && set && !set.deletedAt),
        } satisfies WeakCardInsight;
      })
      .sort((a, b) => (
        getRetentionStatusPriority(a.retentionStatus) - getRetentionStatusPriority(b.retentionStatus)
        || a.retentionScore - b.retentionScore
        || b.missRate - a.missRate
        || b.reviewCount - a.reviewCount
        || (b.lastReviewedAt ?? 0) - (a.lastReviewedAt ?? 0)
        || a.question.localeCompare(b.question)
      ));
  }

  const activeCards = cards.filter((card): card is Card & { id: number } => isFiniteNumber(card.id) && !card.deletedAt);
  const statByCardId = new Map(stats.map((stat) => [stat.cardId, stat]));
  const setMap = new Map(sets.filter(hasNumericId).map((set) => [set.id, set] as const));

  return activeCards
    .flatMap((card) => {
      const stat = statByCardId.get(card.id);
      if (!stat) {
        return [];
      }

      const reviewCount = getStatReviewCount(stat);
      const missedCount = stat.incorrectCount + stat.flaggedCount;
      if (reviewCount <= 0 || missedCount <= 0) {
        return [];
      }

      const missRate = missedCount / reviewCount;
      if (missRate < 0.3) {
        return [];
      }

      const set = setMap.get(card.setId);
      return [{
        cardId: card.id,
        setId: card.setId,
        question: card.question,
        setTitle: getSetTitle(set),
        reviewCount,
        missedCount,
        missRate,
        lastReviewedAt: stat.lastReviewedAt ?? null,
        avgResponseMs: isFiniteNumber(stat.avgResponseMs) ? stat.avgResponseMs : null,
        retentionScore: Math.max(0, 100 - roundPercentage(missRate)),
        retentionStatus: 'needs-practice',
        daysSinceLastReview: null,
        canReview: Boolean(set && !set.deletedAt),
      } satisfies WeakCardInsight];
    })
    .sort((a, b) => (
      b.missRate - a.missRate
      || b.reviewCount - a.reviewCount
      || (b.lastReviewedAt ?? 0) - (a.lastReviewedAt ?? 0)
      || a.question.localeCompare(b.question)
    ));
}

export function getSetPerformance(
  sets: FlashSet[],
  sessions: Session[],
  results: Result[],
  stats: Stat[],
  cards: Card[],
  packs: Pack[] = [],
  cardRetentions: CardRetention[] = [],
): SetPerformanceRow[] {
  const completedSessions = getCompletedSessions(sessions);
  const resultsBySessionId = buildCompletedResultMap(completedSessions, results);
  const setMap = new Map(sets.filter(hasNumericId).map((set) => [set.id, set] as const));
  const packMap = new Map(packs.filter(hasNumericId).map((pack) => [pack.id, pack] as const));
  const cardById = new Map(cards.filter(hasNumericId).map((card) => [card.id, card] as const));
  const retentionsBySet = new Map<number, CardRetention[]>();
  const weakCardIdsBySet = new Map<number, number[]>();
  const sessionTotalsBySet = new Map<number, {
    totalReviewed: number;
    correctCount: number;
    completedSessions: number;
    timedCount: number;
    timedTotalMs: number;
    lastReviewedAt: number | null;
  }>();
  const statsFallbackBySet = new Map<number, SetStatsFallback>();

  for (const retention of cardRetentions) {
    const existing = retentionsBySet.get(retention.setId);
    if (existing) {
      existing.push(retention);
    } else {
      retentionsBySet.set(retention.setId, [retention]);
    }
  }

  for (const weakCard of getWeakCards(cards, stats, sets, cardRetentions)) {
    const weakCardIds = weakCardIdsBySet.get(weakCard.setId);
    if (weakCardIds) {
      weakCardIds.push(weakCard.cardId);
    } else {
      weakCardIdsBySet.set(weakCard.setId, [weakCard.cardId]);
    }
  }

  for (const session of completedSessions) {
    const summary = getSessionSummary(session, resultsBySessionId.get(session.id) ?? []);
    const existing = sessionTotalsBySet.get(session.setId);

    if (existing) {
      existing.totalReviewed += summary.totalReviewed;
      existing.correctCount += summary.correctCount;
      existing.completedSessions += 1;
      existing.timedCount += summary.timedCount;
      existing.timedTotalMs += summary.timedTotalMs;
      existing.lastReviewedAt = Math.max(existing.lastReviewedAt ?? 0, session.completedAt);
    } else {
      sessionTotalsBySet.set(session.setId, {
        totalReviewed: summary.totalReviewed,
        correctCount: summary.correctCount,
        completedSessions: 1,
        timedCount: summary.timedCount,
        timedTotalMs: summary.timedTotalMs,
        lastReviewedAt: session.completedAt,
      });
    }
  }

  const activeCards = cards.filter((card): card is Card & { id: number } => isFiniteNumber(card.id) && !card.deletedAt);
  const statByCardId = new Map(stats.map((stat) => [stat.cardId, stat]));

  for (const card of activeCards) {
    const stat = statByCardId.get(card.id);
    if (!stat) {
      continue;
    }

    const reviewCount = getStatReviewCount(stat);
    if (reviewCount <= 0) {
      continue;
    }

    const existing = statsFallbackBySet.get(card.setId);
    const timedReviewCount = isFiniteNumber(stat.avgResponseMs) ? reviewCount : 0;
    const timedTotalMs = isFiniteNumber(stat.avgResponseMs) ? stat.avgResponseMs * reviewCount : 0;

    if (existing) {
      existing.totalReviewed += reviewCount;
      existing.correctCount += stat.correctCount;
      existing.lastReviewedAt = Math.max(existing.lastReviewedAt ?? 0, stat.lastReviewedAt ?? 0) || existing.lastReviewedAt;
      existing.timedReviewCount += timedReviewCount;
      existing.timedTotalMs += timedTotalMs;
    } else {
      statsFallbackBySet.set(card.setId, {
        totalReviewed: reviewCount,
        correctCount: stat.correctCount,
        lastReviewedAt: stat.lastReviewedAt ?? null,
        timedReviewCount,
        timedTotalMs,
      });
    }
  }

  const setIds = new Set<number>([
    ...sessionTotalsBySet.keys(),
    ...statsFallbackBySet.keys(),
  ]);

  return [...setIds]
    .map((setId) => {
      const sessionTotals = sessionTotalsBySet.get(setId);
      const statsFallback = statsFallbackBySet.get(setId);
      const weakCardIds = weakCardIdsBySet.get(setId) ?? [];
      const set = setMap.get(setId);
      const retentionDetails = cardRetentions.length > 0
        ? getSetRetentionDetails(setId, set, cardById, retentionsBySet)
        : getFallbackSetRetentionDetails(set, weakCardIds);
      const totalReviewed = (sessionTotals?.totalReviewed ?? 0) > 0
        ? sessionTotals!.totalReviewed
        : statsFallback?.totalReviewed ?? 0;
      const correctCount = (sessionTotals?.totalReviewed ?? 0) > 0
        ? sessionTotals!.correctCount
        : statsFallback?.correctCount ?? 0;

      if (totalReviewed <= 0 && (sessionTotals?.completedSessions ?? 0) <= 0) {
        return null;
      }

      const averageResponseMs = (sessionTotals?.timedCount ?? 0) > 0
        ? sessionTotals!.timedTotalMs / sessionTotals!.timedCount
        : (statsFallback?.timedReviewCount ?? 0) > 0
          ? (statsFallback!.timedTotalMs / statsFallback!.timedReviewCount)
          : null;

      return {
        setId,
        title: getSetTitle(set),
        packName: getPackName(set, packMap),
        totalReviewed,
        completedSessions: sessionTotals?.completedSessions ?? 0,
        accuracy: totalReviewed > 0 ? roundPercentage(correctCount / totalReviewed) : null,
        averageResponseMs,
        lastReviewedAt: Math.max(sessionTotals?.lastReviewedAt ?? 0, statsFallback?.lastReviewedAt ?? 0) || null,
        weakCardCount: retentionDetails.weakCardIds.length > 0 ? retentionDetails.weakCardIds.length : weakCardIds.length,
        weakCardIds: retentionDetails.weakCardIds.length > 0 ? retentionDetails.weakCardIds : weakCardIds,
        canReviewWeakCards: retentionDetails.weakCardIds.length > 0 ? retentionDetails.canReviewWeakCards : Boolean(set && !set.deletedAt && weakCardIds.length > 0),
        retentionCounts: retentionDetails.retentionCounts,
        primaryRetentionStatus: retentionDetails.primaryRetentionStatus,
        focusCardIds: retentionDetails.focusCardIds,
        focusStatus: retentionDetails.focusStatus,
        canReviewFocusCards: retentionDetails.canReviewFocusCards,
      } satisfies SetPerformanceRow;
    })
    .filter((row): row is SetPerformanceRow => row !== null)
    .sort((a, b) => (
      (a.accuracy ?? 101) - (b.accuracy ?? 101)
      || b.weakCardCount - a.weakCardCount
      || b.totalReviewed - a.totalReviewed
      || a.title.localeCompare(b.title)
    ));
}

export function getSetPerformanceFromRollups(
  sets: FlashSet[],
  packs: Pack[],
  cards: Card[],
  setRollups: SetStudyRollup[],
  cardRetentions: CardRetention[],
): SetPerformanceRow[] {
  const setMap = new Map(sets.filter(hasNumericId).map((set) => [set.id, set] as const));
  const packMap = new Map(packs.filter(hasNumericId).map((pack) => [pack.id, pack] as const));
  const cardById = new Map(cards.filter(hasNumericId).map((card) => [card.id, card] as const));
  const retentionsBySet = new Map<number, CardRetention[]>();

  for (const retention of cardRetentions) {
    const existing = retentionsBySet.get(retention.setId);
    if (existing) {
      existing.push(retention);
    } else {
      retentionsBySet.set(retention.setId, [retention]);
    }
  }

  return setRollups
    .map((rollup) => {
      const set = setMap.get(rollup.setId);
      const retentionDetails = getSetRetentionDetails(rollup.setId, set, cardById, retentionsBySet);
      const weakCardCount = isFiniteNumber(rollup.weakCardCount)
        ? Math.max(0, rollup.weakCardCount)
        : retentionDetails.weakCardIds.length;

      return {
        setId: rollup.setId,
        title: getSetTitle(set),
        packName: getPackName(set, packMap),
        totalReviewed: Math.max(0, rollup.reviewedCount),
        completedSessions: Math.max(0, rollup.sessionCount),
        accuracy: rollup.reviewedCount > 0 ? roundPercentage(rollup.correctCount / rollup.reviewedCount) : null,
        averageResponseMs: isFiniteNumber(rollup.avgResponseMs) ? rollup.avgResponseMs : null,
        lastReviewedAt: isFiniteNumber(rollup.lastReviewedAt) ? rollup.lastReviewedAt : null,
        weakCardCount,
        weakCardIds: retentionDetails.weakCardIds,
        canReviewWeakCards: retentionDetails.canReviewWeakCards,
        retentionCounts: retentionDetails.retentionCounts,
        primaryRetentionStatus: retentionDetails.primaryRetentionStatus,
        focusCardIds: retentionDetails.focusCardIds,
        focusStatus: retentionDetails.focusStatus,
        canReviewFocusCards: retentionDetails.canReviewFocusCards,
      } satisfies SetPerformanceRow;
    })
    .filter((row) => row.totalReviewed > 0 || row.completedSessions > 0)
    .sort((a, b) => (
      (a.accuracy ?? 101) - (b.accuracy ?? 101)
      || b.weakCardCount - a.weakCardCount
      || b.totalReviewed - a.totalReviewed
      || a.title.localeCompare(b.title)
    ));
}

export function getRecentDays(count: number, now = Date.now()): RecentDay[] {
  const todayStart = getStartOfDay(now);
  if (todayStart === null || count <= 0) {
    return [];
  }

  const firstDayStart = shiftDay(todayStart, -(count - 1));

  return Array.from({ length: count }, (_, index) => {
    const dayStart = shiftDay(firstDayStart, index);
    return {
      dayKey: getDayKey(dayStart),
      dayStart,
      label: DAY_LABEL_FORMATTER.format(dayStart),
      fullLabel: FULL_DATE_FORMATTER.format(dayStart),
    } satisfies RecentDay;
  });
}

export function getDailyStatMap(dailyStats: DailyStudyStat[]): Map<string, DailyStudyStat> {
  return new Map(dailyStats.map((day) => [day.dayKey, day]));
}

export function getDayStartFromKey(dayKey: string): number | null {
  return parseDayKey(dayKey);
}
