import type { Result, Session } from '../../domain/types';

type TimedResult = Result & { responseMs: number };

const WEAK_OUTCOME_PRIORITY: Record<Result['outcome'], number> = {
  incorrect: 0,
  flagged: 1,
  correct: 2,
};

function isTimedResult(result: Result): result is TimedResult {
  return typeof result.responseMs === 'number'
    && Number.isFinite(result.responseMs)
    && result.responseMs >= 0;
}

export function formatDuration(ms: number, options: { decimalSeconds?: boolean } = {}): string {
  const safeMs = Math.max(0, ms);
  const totalSeconds = safeMs / 1000;

  if (safeMs < 60000) {
    if (options.decimalSeconds) {
      return `${totalSeconds.toFixed(1)}s`;
    }

    return `${Math.round(totalSeconds)}s`;
  }

  const roundedSeconds = Math.round(totalSeconds);
  const minutes = Math.floor(roundedSeconds / 60);
  const seconds = roundedSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

export function formatPerCardDuration(ms: number): string {
  return `${formatDuration(ms, { decimalSeconds: true })}/card`;
}

export function getAverageResponseMs(results: Result[]): number | null {
  const timedResults = results.filter(isTimedResult);
  if (timedResults.length === 0) return null;

  const total = timedResults.reduce((sum, result) => sum + result.responseMs, 0);
  return total / timedResults.length;
}

export function getFastestResult(results: Result[]): TimedResult | null {
  const timedResults = results.filter(isTimedResult);
  if (timedResults.length === 0) return null;

  return timedResults.reduce((fastest, result) => (
    result.responseMs < fastest.responseMs ? result : fastest
  ));
}

export function getSlowestResults(results: Result[], limit = 3): TimedResult[] {
  return results
    .filter(isTimedResult)
    .slice()
    .sort((a, b) => b.responseMs - a.responseMs)
    .slice(0, limit);
}

export function getWeakResults(results: Result[]): Result[] {
  return results
    .filter((result) => result.outcome === 'incorrect' || result.outcome === 'flagged')
    .slice()
    .sort((a, b) => WEAK_OUTCOME_PRIORITY[a.outcome] - WEAK_OUTCOME_PRIORITY[b.outcome]);
}

export function getSessionDurationMs(session: Pick<Session, 'startedAt' | 'completedAt' | 'durationMs'>): number | null {
  if (typeof session.durationMs === 'number' && Number.isFinite(session.durationMs)) {
    return Math.max(0, session.durationMs);
  }

  if (typeof session.startedAt === 'number' && typeof session.completedAt === 'number') {
    return Math.max(0, session.completedAt - session.startedAt);
  }

  return null;
}

export function getScorePercentage(
  session: Pick<Session, 'score' | 'correctCount' | 'totalCards'>,
  results: Result[],
): number | null {
  if (results.length > 0) {
    const correct = results.filter((result) => result.outcome === 'correct').length;
    return Math.round((correct / results.length) * 100);
  }

  if (typeof session.score === 'number' && Number.isFinite(session.score)) {
    return session.score;
  }

  if (
    typeof session.correctCount === 'number'
    && typeof session.totalCards === 'number'
    && session.totalCards > 0
  ) {
    return Math.round((session.correctCount / session.totalCards) * 100);
  }

  return null;
}

export function getCorrectCount(
  session: Pick<Session, 'correctCount'>,
  results: Result[],
): number | null {
  if (results.length > 0) {
    return results.filter((result) => result.outcome === 'correct').length;
  }

  if (typeof session.correctCount === 'number' && Number.isFinite(session.correctCount)) {
    return session.correctCount;
  }

  return null;
}

export function getPreviousSession(sessions: Session[], currentSession: Session): Session | null {
  const currentCompletedAt = currentSession.completedAt;

  if (typeof currentCompletedAt !== 'number') {
    return null;
  }

  return sessions
    .filter((session) => (
      session.id !== currentSession.id
      && session.setId === currentSession.setId
      && typeof session.completedAt === 'number'
      && session.completedAt < currentCompletedAt
    ))
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))[0] ?? null;
}

export function getScoreDelta(currentScore: number | null, previousScore: number | null): number | null {
  if (currentScore === null || previousScore === null) {
    return null;
  }

  return currentScore - previousScore;
}
