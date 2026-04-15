import { db } from '../index';
import type { Session, Result, Stat, ActiveSession, Outcome } from '../../domain/types';

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

  async complete(id: number, score: number): Promise<void> {
    await db.sessions.update(id, { completedAt: Date.now(), score });
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
  async upsertMany(updates: Array<{ cardId: number; outcome: Outcome }>): Promise<void> {
    await db.transaction('rw', db.stats, async () => {
      for (const { cardId, outcome } of updates) {
        const existing = await db.stats.where('cardId').equals(cardId).first();
        if (existing) {
          const patch: Partial<Stat> = {
            lastResult: outcome,
            lastReviewedAt: Date.now(),
            correctCount:   existing.correctCount   + (outcome === 'correct'   ? 1 : 0),
            incorrectCount: existing.incorrectCount + (outcome === 'incorrect' ? 1 : 0),
            flaggedCount:   existing.flaggedCount   + (outcome === 'flagged'   ? 1 : 0),
          };
          await db.stats.update(existing.id!, patch);
        } else {
          const stat: Omit<Stat, 'id'> = {
            cardId,
            correctCount:   outcome === 'correct'   ? 1 : 0,
            incorrectCount: outcome === 'incorrect' ? 1 : 0,
            flaggedCount:   outcome === 'flagged'   ? 1 : 0,
            lastResult: outcome,
            lastReviewedAt: Date.now(),
          };
          await db.stats.add(stat);
        }
      }
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
