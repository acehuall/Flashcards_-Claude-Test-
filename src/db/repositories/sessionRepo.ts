import { db } from '../index';
import { markAnalyticsRollupsDirtyInTransaction } from './analyticsRepo';
import type { Session, Result, Stat, ActiveSession, Outcome } from '../../domain/types';

interface SessionCompletionSummary {
  completedAt?: number;
  totalCards?: number;
  correctCount?: number;
  incorrectCount?: number;
  flaggedCount?: number;
  durationMs?: number;
}

interface StatUpdate {
  cardId: number;
  outcome: Outcome;
  reviewedAt?: number;
  responseMs?: number;
}

interface SessionCompletionPayload {
  sessionId: number;
  score: number;
  summary?: SessionCompletionSummary;
  results: Omit<Result, 'id'>[];
  statsUpdates: StatUpdate[];
}

interface SessionCompletionOutcome {
  status: 'completed' | 'already-completed';
  sessionId: number;
  completedAt: number;
}

function getStatReviewCount(stat: Pick<Stat, 'reviewCount' | 'correctCount' | 'incorrectCount' | 'flaggedCount'>): number {
  return stat.reviewCount ?? (stat.correctCount + stat.incorrectCount + stat.flaggedCount);
}

async function applyStatUpdates(updates: StatUpdate[]): Promise<void> {
  for (const { cardId, outcome, reviewedAt, responseMs } of updates) {
    const existing = await db.stats.where('cardId').equals(cardId).first();
    const timestamp = reviewedAt ?? Date.now();

    if (existing) {
      const reviewCount = getStatReviewCount(existing);
      const currentCorrectStreak = existing.currentCorrectStreak ?? 0;
      const currentIncorrectStreak = existing.currentIncorrectStreak ?? 0;
      const nextCorrectStreak = outcome === 'correct' ? currentCorrectStreak + 1 : 0;
      const nextIncorrectStreak = outcome === 'incorrect'
        ? currentIncorrectStreak + 1
        : outcome === 'correct'
          ? 0
          : currentIncorrectStreak;
      const patch: Partial<Stat> = {
        lastResult: outcome,
        lastReviewedAt: timestamp,
        correctCount:   existing.correctCount   + (outcome === 'correct'   ? 1 : 0),
        incorrectCount: existing.incorrectCount + (outcome === 'incorrect' ? 1 : 0),
        flaggedCount:   existing.flaggedCount   + (outcome === 'flagged'   ? 1 : 0),
        reviewCount: reviewCount + 1,
        currentCorrectStreak: nextCorrectStreak,
        bestCorrectStreak: Math.max(existing.bestCorrectStreak ?? 0, nextCorrectStreak),
        currentIncorrectStreak: nextIncorrectStreak,
      };

      if (responseMs !== undefined) {
        patch.avgResponseMs = existing.avgResponseMs !== undefined
          ? ((existing.avgResponseMs * reviewCount) + responseMs) / (reviewCount + 1)
          : responseMs;
        patch.fastestResponseMs = existing.fastestResponseMs !== undefined
          ? Math.min(existing.fastestResponseMs, responseMs)
          : responseMs;
        patch.slowestResponseMs = existing.slowestResponseMs !== undefined
          ? Math.max(existing.slowestResponseMs, responseMs)
          : responseMs;
      }

      await db.stats.update(existing.id!, patch);
      continue;
    }

    const stat: Omit<Stat, 'id'> = {
      cardId,
      correctCount:   outcome === 'correct'   ? 1 : 0,
      incorrectCount: outcome === 'incorrect' ? 1 : 0,
      flaggedCount:   outcome === 'flagged'   ? 1 : 0,
      lastResult: outcome,
      lastReviewedAt: timestamp,
      reviewCount: 1,
      currentCorrectStreak: outcome === 'correct' ? 1 : 0,
      bestCorrectStreak: outcome === 'correct' ? 1 : 0,
      currentIncorrectStreak: outcome === 'incorrect' ? 1 : 0,
      avgResponseMs: responseMs,
      fastestResponseMs: responseMs,
      slowestResponseMs: responseMs,
      firstReviewedAt: timestamp,
    };
    await db.stats.add(stat);
  }
}

// ─── Session Repo ─────────────────────────────────────────────────────────────

export const sessionRepo = {
  async create(data: Omit<Session, 'id'>): Promise<number> {
    return db.sessions.add({
      ...data,
      portableId: data.portableId ?? globalThis.crypto.randomUUID(),
    });
  },

  async delete(id: number): Promise<void> {
    await db.sessions.delete(id);
  },

  async complete(id: number, score: number, summary: SessionCompletionSummary = {}): Promise<void> {
    const completedAt = summary.completedAt ?? Date.now();
    await db.sessions.update(id, {
      completedAt,
      score,
      totalCards: summary.totalCards,
      correctCount: summary.correctCount,
      incorrectCount: summary.incorrectCount,
      flaggedCount: summary.flaggedCount,
      durationMs: summary.durationMs,
    });
  },

  async completeSessionWithResults({
    sessionId,
    score,
    summary = {},
    results,
    statsUpdates,
  }: SessionCompletionPayload): Promise<SessionCompletionOutcome> {
    let completionOutcome: SessionCompletionOutcome | undefined;

    await db.transaction('rw', db.sessions, db.results, db.stats, db.activeSessions, db.analyticsMeta, async () => {
      const session = await db.sessions.get(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      if (typeof session.completedAt === 'number' && Number.isFinite(session.completedAt)) {
        completionOutcome = {
          status: 'already-completed',
          sessionId,
          completedAt: session.completedAt,
        };
        return;
      }

      const completedAt = summary.completedAt ?? Date.now();

      await db.sessions.update(sessionId, {
        completedAt,
        score,
        totalCards: summary.totalCards,
        correctCount: summary.correctCount,
        incorrectCount: summary.incorrectCount,
        flaggedCount: summary.flaggedCount,
        durationMs: summary.durationMs,
      });

      if (results.length > 0) {
        await db.results.bulkAdd(results);
      }

      await applyStatUpdates(statsUpdates);
      await db.activeSessions.where('sessionId').equals(sessionId).delete();
      await markAnalyticsRollupsDirtyInTransaction('session-completed', completedAt);

      completionOutcome = {
        status: 'completed',
        sessionId,
        completedAt,
      };
    });

    if (!completionOutcome) {
      throw new Error('Session completion did not finish');
    }

    return completionOutcome;
  },

  getById(id: number): Promise<Session | undefined> {
    return db.sessions.get(id);
  },

  getBySetId(setId: number): Promise<Session[]> {
    return db.sessions.where('setId').equals(setId).toArray();
  },
};

// ─── Result Repo ──────────────────────────────────────────────────────────────

export const resultRepo = {
  async bulkCreate(results: Omit<Result, 'id'>[]): Promise<void> {
    await db.results.bulkAdd(results);
  },

  getBySessionId(sessionId: number): Promise<Result[]> {
    return db.results.where('sessionId').equals(sessionId).toArray();
  },
};

// ─── Stats Repo ───────────────────────────────────────────────────────────────

export const statsRepo = {
  async upsertMany(updates: StatUpdate[]): Promise<void> {
    await db.transaction('rw', db.stats, async () => {
      await applyStatUpdates(updates);
    });
  },

  getByCardId(cardId: number): Promise<Stat | undefined> {
    return db.stats.where('cardId').equals(cardId).first();
  },
};

// ─── Active Session Repo ──────────────────────────────────────────────────────

export const activeSessionRepo = {
  async save(data: Omit<ActiveSession, 'id'>): Promise<void> {
    const existing = await db.activeSessions.where('setId').equals(data.setId).first();
    if (existing) {
      await db.activeSessions.update(existing.id!, { ...data, savedAt: Date.now() });
    } else {
      await db.activeSessions.add({ ...data, savedAt: Date.now() });
    }
  },

  getBySetId(setId: number): Promise<ActiveSession | undefined> {
    return db.activeSessions.where('setId').equals(setId).first();
  },

  async deleteBySetId(setId: number): Promise<void> {
    await db.activeSessions.where('setId').equals(setId).delete();
  },
};
