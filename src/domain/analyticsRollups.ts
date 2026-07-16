import type {
  Card,
  CardRetention,
  CardRetentionStatus,
  DailyStudyRollup,
  Result,
  Session,
  SetStudyRollup,
  Stat,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_ATTEMPT_LIMIT = 5;

type CompletedSession = Session & { id: number; completedAt: number };

type SessionReviewSummary = {
  reviewedCount: number;
  correctCount: number;
  incorrectCount: number;
  flaggedCount: number;
  timedCount: number;
  timedTotalMs: number;
};

type AnalyticsSourceData = {
  sessions: Session[];
  results: Result[];
  stats: Stat[];
  cards: Card[];
  now?: number;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, fractionDigits = 2): number {
  const factor = 10 ** fractionDigits;
  return Math.round(value * factor) / factor;
}

function getResultTimestamp(result: Result): number | null {
  if (isFiniteNumber(result.timestamp)) {
    return result.timestamp;
  }

  if (isFiniteNumber(result.answeredAt)) {
    return result.answeredAt;
  }

  if (isFiniteNumber(result.flippedAt)) {
    return result.flippedAt;
  }

  if (isFiniteNumber(result.shownAt)) {
    return result.shownAt;
  }

  return null;
}

function getCompletedSessions(sessions: Session[]): CompletedSession[] {
  return sessions
    .filter((session): session is CompletedSession => (
      isFiniteNumber(session.id)
      && isFiniteNumber(session.completedAt)
    ))
    .slice()
    .sort((a, b) => a.completedAt - b.completedAt);
}

function getSessionFallbackTotal(session: Pick<Session, 'totalCards' | 'correctCount' | 'incorrectCount' | 'flaggedCount'>): number {
  const countFallback = (session.correctCount ?? 0) + (session.incorrectCount ?? 0) + (session.flaggedCount ?? 0);
  return session.totalCards ?? countFallback;
}

export function getStatReviewCount(stat: Pick<Stat, 'reviewCount' | 'correctCount' | 'incorrectCount' | 'flaggedCount'>): number {
  return stat.reviewCount ?? (stat.correctCount + stat.incorrectCount + stat.flaggedCount);
}

export function getSessionDurationMs(session: Pick<Session, 'startedAt' | 'completedAt' | 'durationMs'>): number | null {
  if (isFiniteNumber(session.durationMs)) {
    return Math.max(0, session.durationMs);
  }

  if (isFiniteNumber(session.startedAt) && isFiniteNumber(session.completedAt)) {
    return Math.max(0, session.completedAt - session.startedAt);
  }

  return null;
}

export function getLocalDateKey(value: Date | number): string | null {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getLocalDayBounds(value: Date | number): { dateKey: string; dayStart: number; dayEnd: number } | null {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setHours(0, 0, 0, 0);
  const dayStart = date.getTime();
  const dateKey = getLocalDateKey(dayStart);
  if (!dateKey) {
    return null;
  }

  return {
    dateKey,
    dayStart,
    dayEnd: dayStart + DAY_MS - 1,
  };
}

type SessionDisplayModeMap = Map<number, 'flip' | 'multiple-choice'>;

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

  for (const sessionResults of resultsBySessionId.values()) {
    sessionResults.sort((a, b) => (getResultTimestamp(a) ?? 0) - (getResultTimestamp(b) ?? 0));
  }

  return resultsBySessionId;
}

function getSessionReviewSummary(session: Session, sessionResults: Result[]): SessionReviewSummary {
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
      reviewedCount: sessionResults.length,
      correctCount,
      incorrectCount,
      flaggedCount,
      timedCount,
      timedTotalMs,
    };
  }

  return {
    reviewedCount: getSessionFallbackTotal(session),
    correctCount: session.correctCount ?? 0,
    incorrectCount: session.incorrectCount ?? 0,
    flaggedCount: session.flaggedCount ?? 0,
    timedCount: 0,
    timedTotalMs: 0,
  };
}

function getMostRecentSetId(history: Result[], sessionById: Map<number, CompletedSession>): number | undefined {
  let latestTimestamp = Number.NEGATIVE_INFINITY;
  let latestSetId: number | undefined;

  for (const result of history) {
    const session = sessionById.get(result.sessionId);
    if (!session) {
      continue;
    }

    const timestamp = getResultTimestamp(result) ?? session.completedAt;
    if (timestamp > latestTimestamp) {
      latestTimestamp = timestamp;
      latestSetId = session.setId;
    }
  }

  return latestSetId;
}

function getDaysSinceLastReview(lastReviewedAt: number, now: number): number | undefined {
  const reviewDay = getLocalDayBounds(lastReviewedAt)?.dayStart;
  const today = getLocalDayBounds(now)?.dayStart;
  if (!isFiniteNumber(reviewDay) || !isFiniteNumber(today)) {
    return undefined;
  }

  return Math.max(0, Math.floor((today - reviewDay) / DAY_MS));
}

function getRecencyScore(daysSinceLastReview: number | undefined): number {
  if (!isFiniteNumber(daysSinceLastReview)) {
    return 0;
  }

  if (daysSinceLastReview <= 1) {
    return 20;
  }

  if (daysSinceLastReview <= 7) {
    return 15;
  }

  if (daysSinceLastReview <= 14) {
    return 10;
  }

  if (daysSinceLastReview <= 30) {
    return 5;
  }

  return 0;
}

function getRetentionScore(recentAccuracy: number, lifetimeAccuracy: number, daysSinceLastReview: number | undefined): number {
  const score = (clamp(recentAccuracy, 0, 1) * 60)
    + (clamp(lifetimeAccuracy, 0, 1) * 20)
    + getRecencyScore(daysSinceLastReview);

  return Math.round(clamp(score, 0, 100));
}

export function getCardRetentionStatus(input: {
  reviewCount: number;
  recentAccuracy: number;
  lifetimeAccuracy: number;
  daysSinceLastReview?: number;
  retentionScore: number;
}): CardRetentionStatus {
  if (input.reviewCount === 0) {
    return 'not-reviewed-recently';
  }

  if (isFiniteNumber(input.daysSinceLastReview) && input.daysSinceLastReview >= 30 && input.retentionScore >= 75) {
    return 'not-reviewed-recently';
  }

  if (isFiniteNumber(input.daysSinceLastReview) && input.daysSinceLastReview >= 14 && input.retentionScore < 75) {
    return 'due';
  }

  if (input.recentAccuracy < 0.6) {
    return 'needs-practice';
  }

  if (input.recentAccuracy >= 0.8 && input.retentionScore >= 75) {
    return 'strong';
  }

  if (input.recentAccuracy > input.lifetimeAccuracy && input.recentAccuracy >= 0.6) {
    return 'improving';
  }

  return 'needs-practice';
}

export function isWeakRetentionStatus(status: CardRetentionStatus): boolean {
  return status === 'needs-practice' || status === 'due';
}

export function isWeakCardRetention(retention: CardRetention, stat?: Stat, card?: Card): boolean {
  if (card?.deletedAt) {
    return false;
  }

  if (isWeakRetentionStatus(retention.status)) {
    return true;
  }

  const reviewCount = Math.max(retention.reviewCount, stat ? getStatReviewCount(stat) : 0);
  if (reviewCount <= 0) {
    return false;
  }

  const incorrectCount = stat?.incorrectCount ?? Math.max(0, reviewCount - Math.round(retention.lifetimeAccuracy * reviewCount));
  const flaggedCount = stat?.flaggedCount ?? 0;
  const missedCount = incorrectCount + flaggedCount;
  if (missedCount <= 0) {
    return false;
  }

  const missRate = missedCount / reviewCount;
  if (missRate >= 0.3) {
    return true;
  }

  return reviewCount <= 3;
}

function isCardRetention(value: CardRetention | null): value is CardRetention {
  return value !== null;
}

export function buildDailyStudyRollups(sessions: Session[], results: Result[], now = Date.now()): DailyStudyRollup[] {
  const completedSessions = getCompletedSessions(sessions);
  const resultsBySessionId = buildCompletedResultMap(completedSessions, results);
  const dailyMap = new Map<string, DailyStudyRollup & { timedCount: number; timedTotalMs: number }>();

  for (const session of completedSessions) {
    const day = getLocalDayBounds(session.completedAt);
    if (!day) {
      continue;
    }

    const summary = getSessionReviewSummary(session, resultsBySessionId.get(session.id) ?? []);
    const durationMs = getSessionDurationMs(session) ?? 0;
    const existing = dailyMap.get(day.dateKey);

    if (existing) {
      existing.reviewedCount += summary.reviewedCount;
      existing.correctCount += summary.correctCount;
      existing.incorrectCount += summary.incorrectCount;
      existing.flaggedCount += summary.flaggedCount;
      existing.totalDurationMs += durationMs;
      existing.sessionCount += 1;
      existing.timedCount += summary.timedCount;
      existing.timedTotalMs += summary.timedTotalMs;
      existing.updatedAt = now;
      continue;
    }

    dailyMap.set(day.dateKey, {
      dateKey: day.dateKey,
      reviewedCount: summary.reviewedCount,
      correctCount: summary.correctCount,
      incorrectCount: summary.incorrectCount,
      flaggedCount: summary.flaggedCount,
      totalDurationMs: durationMs,
      sessionCount: 1,
      updatedAt: now,
      timedCount: summary.timedCount,
      timedTotalMs: summary.timedTotalMs,
    });
  }

  return [...dailyMap.values()]
    .map(({ timedCount, timedTotalMs, ...rollup }) => ({
      ...rollup,
      avgResponseMs: timedCount > 0 ? roundTo(timedTotalMs / timedCount, 2) : undefined,
    }))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

export function buildCardRetentions({ sessions, results, stats, cards, now = Date.now() }: AnalyticsSourceData, sessionDisplayModeMap?: SessionDisplayModeMap): CardRetention[] {
  const completedSessions = getCompletedSessions(sessions);
  const sessionById = new Map(completedSessions.map((session) => [session.id, session] as const));
  const completedSessionIds = new Set(completedSessions.map((session) => session.id));
  const resultsByCardId = new Map<number, Result[]>();
  const statByCardId = new Map(stats.map((stat) => [stat.cardId, stat] as const));
  const cardById = new Map(cards.filter((card): card is Card & { id: number } => isFiniteNumber(card.id)).map((card) => [card.id, card] as const));
  const sourceCardIds = new Set<number>();

  for (const card of cards) {
    if (isFiniteNumber(card.id) && !card.deletedAt) {
      sourceCardIds.add(card.id);
    }
  }

  for (const result of results) {
    if (!completedSessionIds.has(result.sessionId)) {
      continue;
    }

    const history = resultsByCardId.get(result.cardId);
    if (history) {
      history.push(result);
    } else {
      resultsByCardId.set(result.cardId, [result]);
    }
    sourceCardIds.add(result.cardId);
  }

  for (const stat of stats) {
    if (getStatReviewCount(stat) > 0) {
      sourceCardIds.add(stat.cardId);
    }
  }

  for (const history of resultsByCardId.values()) {
    history.sort((a, b) => (getResultTimestamp(a) ?? 0) - (getResultTimestamp(b) ?? 0));
  }

  return [...sourceCardIds]
    .map<CardRetention | null>((cardId) => {
      const card = cardById.get(cardId);
      const stat = statByCardId.get(cardId);
      const history = resultsByCardId.get(cardId) ?? [];
      const statReviewCount = stat ? getStatReviewCount(stat) : 0;
      const hasHistory = history.length > 0 || statReviewCount > 0;

      if (!card && !hasHistory) {
        return null;
      }

      if (card?.deletedAt && !hasHistory) {
        return null;
      }

      const setId = card?.setId ?? getMostRecentSetId(history, sessionById);
      if (!isFiniteNumber(setId)) {
        return null;
      }

      const resultReviewCount = history.length;
      const reviewCount = resultReviewCount > 0 ? Math.max(resultReviewCount, statReviewCount) : statReviewCount;
      const resultCorrectCount = history.filter((result) => result.outcome === 'correct').length;
      const lifetimeAccuracy = reviewCount > 0
        ? clamp(
          statReviewCount > resultReviewCount && stat
            ? stat.correctCount / statReviewCount
            : resultReviewCount > 0
              ? resultCorrectCount / resultReviewCount
              : 0,
          0,
          1,
        )
        : 0;
      const recentHistory = history.slice(-RECENT_ATTEMPT_LIMIT);
      const recentAccuracy = recentHistory.length > 0
        ? clamp(recentHistory.filter((result) => result.outcome === 'correct').length / recentHistory.length, 0, 1)
        : lifetimeAccuracy;

      const timedResults = history.filter((result) => isFiniteNumber(result.responseMs) && result.responseMs >= 0);
      const avgResponseMs = timedResults.length > 0
        ? roundTo(timedResults.reduce((sum, result) => sum + (result.responseMs ?? 0), 0) / timedResults.length, 2)
        : isFiniteNumber(stat?.avgResponseMs)
          ? roundTo(stat.avgResponseMs, 2)
          : undefined;

      const lastHistoryTimestamp = history.length > 0 ? getResultTimestamp(history[history.length - 1]) : null;
      const lastReviewedAt = Math.max(lastHistoryTimestamp ?? 0, stat?.lastReviewedAt ?? 0) || undefined;
      const daysSinceLastReview = lastReviewedAt ? getDaysSinceLastReview(lastReviewedAt, now) : undefined;
      const weightedRecentAccuracy = recentHistory.length > 0
        ? recentHistory.reduce((sum, result) => {
          const isFromMCQ = sessionDisplayModeMap?.get(result.sessionId) === 'multiple-choice';
          const weight = isFromMCQ ? 0.7 : 1.0;
          return sum + (result.outcome === 'correct' ? weight : 0);
        }, 0) / recentHistory.reduce((sum, result) => sum + (sessionDisplayModeMap?.get(result.sessionId) === 'multiple-choice' ? 0.7 : 1.0), 0)
        : lifetimeAccuracy;
      const retentionScore = getRetentionScore(weightedRecentAccuracy, lifetimeAccuracy, daysSinceLastReview);
      const mcqReviewCount = history.filter((r) => sessionDisplayModeMap?.get(r.sessionId) === 'multiple-choice').length;
      const status = getCardRetentionStatus({
        reviewCount,
        recentAccuracy,
        lifetimeAccuracy,
        daysSinceLastReview,
        retentionScore,
      });

      return {
        cardId,
        setId,
        reviewCount,
        mcqReviewCount,
        recentAccuracy: roundTo(recentAccuracy, 4),
        lifetimeAccuracy: roundTo(lifetimeAccuracy, 4),
        avgResponseMs,
        lastReviewedAt,
        daysSinceLastReview,
        retentionScore,
        status,
        updatedAt: now,
      } satisfies CardRetention;
    })
    .filter(isCardRetention)
    .sort((a, b) => a.cardId - b.cardId);
}

export function buildSetStudyRollups(
  sessions: Session[],
  results: Result[],
  stats: Stat[],
  cards: Card[],
  cardRetentions: CardRetention[],
  now = Date.now(),
): SetStudyRollup[] {
  const completedSessions = getCompletedSessions(sessions);
  const resultsBySessionId = buildCompletedResultMap(completedSessions, results);
  const statByCardId = new Map(stats.map((stat) => [stat.cardId, stat] as const));
  const cardById = new Map(cards.filter((card): card is Card & { id: number } => isFiniteNumber(card.id)).map((card) => [card.id, card] as const));
  const activeCardIdsBySet = new Map<number, number[]>();
  const retentionByCardId = new Map(cardRetentions.map((retention) => [retention.cardId, retention] as const));
  const setMap = new Map<number, SetStudyRollup & { timedCount: number; timedTotalMs: number; mcqSessions: number; flipSessions: number; mcqCorrect: number; mcqReviewed: number; flipCorrect: number; flipReviewed: number }>();

  for (const card of cards) {
    if (!isFiniteNumber(card.id) || card.deletedAt) {
      continue;
    }

    const existing = activeCardIdsBySet.get(card.setId);
    if (existing) {
      existing.push(card.id);
    } else {
      activeCardIdsBySet.set(card.setId, [card.id]);
    }
  }

  for (const session of completedSessions) {
    const summary = getSessionReviewSummary(session, resultsBySessionId.get(session.id) ?? []);
    const durationMs = getSessionDurationMs(session) ?? 0;
    const existing = setMap.get(session.setId);
    const isSessionMCQ = session.displayMode === 'multiple-choice';

    if (existing) {
      existing.reviewedCount += summary.reviewedCount;
      existing.correctCount += summary.correctCount;
      existing.incorrectCount += summary.incorrectCount;
      existing.flaggedCount += summary.flaggedCount;
      existing.sessionCount += 1;
      existing.totalDurationMs += durationMs;
      existing.timedCount += summary.timedCount;
      existing.timedTotalMs += summary.timedTotalMs;
      existing.lastReviewedAt = Math.max(existing.lastReviewedAt ?? 0, session.completedAt);
      existing.updatedAt = now;
      if (isSessionMCQ) {
        existing.mcqSessions += 1;
        existing.mcqCorrect += summary.correctCount;
        existing.mcqReviewed += summary.reviewedCount;
      } else {
        existing.flipSessions += 1;
        existing.flipCorrect += summary.correctCount;
        existing.flipReviewed += summary.reviewedCount;
      }
      continue;
    }

    setMap.set(session.setId, {
      setId: session.setId,
      reviewedCount: summary.reviewedCount,
      correctCount: summary.correctCount,
      incorrectCount: summary.incorrectCount,
      flaggedCount: summary.flaggedCount,
      sessionCount: 1,
      totalDurationMs: durationMs,
      lastReviewedAt: session.completedAt,
      updatedAt: now,
      timedCount: summary.timedCount,
      timedTotalMs: summary.timedTotalMs,
      mcqSessions: isSessionMCQ ? 1 : 0,
      flipSessions: isSessionMCQ ? 0 : 1,
      mcqCorrect: isSessionMCQ ? summary.correctCount : 0,
      mcqReviewed: isSessionMCQ ? summary.reviewedCount : 0,
      flipCorrect: isSessionMCQ ? 0 : summary.correctCount,
      flipReviewed: isSessionMCQ ? 0 : summary.reviewedCount,
    });
  }

  return [...setMap.values()]
    .map(({ timedCount, timedTotalMs, mcqSessions, flipSessions, mcqCorrect, mcqReviewed, flipCorrect, flipReviewed, ...rollup }) => {
      const activeCardIds = activeCardIdsBySet.get(rollup.setId) ?? [];
      const weakCardCount = activeCardIds.reduce((count, cardId) => {
        const card = cardById.get(cardId);
        const retention = retentionByCardId.get(cardId);
        if (!retention) {
          return count;
        }

        return isWeakCardRetention(retention, statByCardId.get(cardId), card) ? count + 1 : count;
      }, 0);

      return {
        ...rollup,
        avgResponseMs: timedCount > 0 ? roundTo(timedTotalMs / timedCount, 2) : undefined,
        weakCardCount,
        mcqSessionCount: mcqSessions,
        flipSessionCount: flipSessions,
        mcqCorrectCount: mcqCorrect,
        mcqReviewedCount: mcqReviewed,
        flipCorrectCount: flipCorrect,
        flipReviewedCount: flipReviewed,
      } satisfies SetStudyRollup;
    })
    .sort((a, b) => a.setId - b.setId);
}

export function buildAnalyticsRollups({ sessions, results, stats, cards, now = Date.now() }: AnalyticsSourceData): {
  dailyStudyRollups: DailyStudyRollup[];
  setStudyRollups: SetStudyRollup[];
  cardRetentions: CardRetention[];
} {
  const dailyStudyRollups = buildDailyStudyRollups(sessions, results, now);
  const sessionDisplayModeMap = new Map<number, 'flip' | 'multiple-choice'>(
    sessions.filter((s): s is Session & { id: number } => typeof s.id === 'number').map((s) => [s.id, s.displayMode ?? 'flip']),
  );
  const cardRetentions = buildCardRetentions({ sessions, results, stats, cards, now }, sessionDisplayModeMap);
  const setStudyRollups = buildSetStudyRollups(sessions, results, stats, cards, cardRetentions, now);

  return {
    dailyStudyRollups,
    setStudyRollups,
    cardRetentions,
  };
}
