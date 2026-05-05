import { db } from '../index';
import {
  buildAnalyticsRollups,
  buildCardRetentions,
  buildDailyStudyRollups,
  buildSetStudyRollups,
  getLocalDayBounds,
} from '../../domain/analyticsRollups';
import type { AnalyticsMeta, CardRetention, DailyStudyRollup, SetStudyRollup, Session } from '../../domain/types';

export const ANALYTICS_ROLLUPS_META_KEY = 'rollups';
export const ANALYTICS_ROLLUPS_VERSION = 1;

type AnalyticsMetaSnapshot = Pick<AnalyticsMeta, 'dirty' | 'version'> | null | undefined;

export function shouldRebuildAnalyticsFromMeta(meta: AnalyticsMetaSnapshot): boolean {
  return !meta || meta.dirty || meta.version !== ANALYTICS_ROLLUPS_VERSION;
}

async function markAnalyticsRollupsCleanInTransaction(rebuiltAt = Date.now()): Promise<void> {
  const existing = await db.analyticsMeta.get(ANALYTICS_ROLLUPS_META_KEY);

  await db.analyticsMeta.put({
    key: ANALYTICS_ROLLUPS_META_KEY,
    dirty: false,
    version: ANALYTICS_ROLLUPS_VERSION,
    lastRebuiltAt: rebuiltAt,
    lastMarkedDirtyAt: existing?.lastMarkedDirtyAt,
  });
}

export async function markAnalyticsRollupsDirtyInTransaction(reason: string, markedAt = Date.now()): Promise<void> {
  const existing = await db.analyticsMeta.get(ANALYTICS_ROLLUPS_META_KEY);

  await db.analyticsMeta.put({
    key: ANALYTICS_ROLLUPS_META_KEY,
    dirty: true,
    version: ANALYTICS_ROLLUPS_VERSION,
    lastRebuiltAt: existing?.lastRebuiltAt,
    lastMarkedDirtyAt: markedAt,
    reason,
  });
}

export async function markAnalyticsRollupsDirty(reason: string): Promise<void> {
  await db.transaction('rw', db.analyticsMeta, async () => {
    await markAnalyticsRollupsDirtyInTransaction(reason);
  });
}

export function getAnalyticsMeta(): Promise<AnalyticsMeta | undefined> {
  return db.analyticsMeta.get(ANALYTICS_ROLLUPS_META_KEY);
}

function hasCompletedSession(session: Session): session is Session & { id: number; completedAt: number } {
  return typeof session.id === 'number' && typeof session.completedAt === 'number' && Number.isFinite(session.completedAt);
}

async function getResultsForSessionIds(sessionIds: number[]) {
  if (sessionIds.length === 0) {
    return [];
  }

  return db.results.where('sessionId').anyOf(sessionIds).toArray();
}

async function getStatsForCardIds(cardIds: number[]) {
  if (cardIds.length === 0) {
    return [];
  }

  return db.stats.where('cardId').anyOf(cardIds).toArray();
}

async function upsertDailyRollup(rollup: DailyStudyRollup): Promise<void> {
  const existing = await db.dailyStudyRollups.where('dateKey').equals(rollup.dateKey).first();
  await db.dailyStudyRollups.put(existing ? { ...rollup, id: existing.id } : rollup);
}

async function upsertSetRollup(rollup: SetStudyRollup): Promise<void> {
  const existing = await db.setStudyRollups.where('setId').equals(rollup.setId).first();
  await db.setStudyRollups.put(existing ? { ...rollup, id: existing.id } : rollup);
}

async function shouldRebuildAllRollups(): Promise<boolean> {
  const [completedSessionCount, dailyCount, setCount, retentionCount, analyticsMeta] = await Promise.all([
    db.sessions.where('completedAt').above(0).count(),
    db.dailyStudyRollups.count(),
    db.setStudyRollups.count(),
    db.cardRetentions.count(),
    getAnalyticsMeta(),
  ]);

  return completedSessionCount > 0 && (
    shouldRebuildAnalyticsFromMeta(analyticsMeta)
    || dailyCount === 0
    || setCount === 0
    || retentionCount === 0
  );
}

export async function rebuildAnalyticsRollups(): Promise<void> {
  const rebuiltAt = Date.now();
  const [sessions, results, stats, cards] = await Promise.all([
    db.sessions.toArray(),
    db.results.toArray(),
    db.stats.toArray(),
    db.cards.toArray(),
  ]);
  const rollups = buildAnalyticsRollups({
    sessions,
    results,
    stats,
    cards,
    now: rebuiltAt,
  });

  await db.transaction('rw', db.dailyStudyRollups, db.setStudyRollups, db.cardRetentions, db.analyticsMeta, async () => {
    await Promise.all([
      db.dailyStudyRollups.clear(),
      db.setStudyRollups.clear(),
      db.cardRetentions.clear(),
    ]);

    if (rollups.dailyStudyRollups.length > 0) {
      await db.dailyStudyRollups.bulkAdd(rollups.dailyStudyRollups);
    }

    if (rollups.setStudyRollups.length > 0) {
      await db.setStudyRollups.bulkAdd(rollups.setStudyRollups);
    }

    if (rollups.cardRetentions.length > 0) {
      await db.cardRetentions.bulkAdd(rollups.cardRetentions);
    }

    await markAnalyticsRollupsCleanInTransaction(rebuiltAt);
  });
}

export async function updateRollupsForCompletedSession(sessionId: number): Promise<void> {
  try {
    const session = await db.sessions.get(sessionId);
    if (!session?.completedAt) {
      return;
    }

    if (await shouldRebuildAllRollups()) {
      await rebuildAnalyticsRollups();
      return;
    }

    const dayBounds = getLocalDayBounds(session.completedAt);
    if (!dayBounds) {
      return;
    }

    const now = Date.now();

    await db.transaction(
      'rw',
      [db.sessions, db.results, db.stats, db.cards, db.dailyStudyRollups, db.setStudyRollups, db.cardRetentions, db.analyticsMeta],
      async () => {
        const daySessions = (await db.sessions.where('completedAt').between(dayBounds.dayStart, dayBounds.dayEnd, true, true).toArray())
          .filter(hasCompletedSession);
        const dayResults = await getResultsForSessionIds(daySessions.map((completedSession) => completedSession.id));
        const [dailyRollup] = buildDailyStudyRollups(daySessions, dayResults, now);

        if (dailyRollup) {
          await upsertDailyRollup(dailyRollup);
        } else {
          await db.dailyStudyRollups.where('dateKey').equals(dayBounds.dateKey).delete();
        }

        const setSessions = (await db.sessions.where('setId').equals(session.setId).toArray())
          .filter(hasCompletedSession);
        const setResults = await getResultsForSessionIds(setSessions.map((completedSession) => completedSession.id));
        const setCards = await db.cards.where('setId').equals(session.setId).toArray();
        const setCardIds = setCards
          .map((card) => card.id)
          .filter((cardId): cardId is number => typeof cardId === 'number' && Number.isFinite(cardId));
        const setStats = await getStatsForCardIds(setCardIds);
        const setCardRetentions = buildCardRetentions({
          sessions: setSessions,
          results: setResults,
          stats: setStats,
          cards: setCards,
          now,
        });

        await db.cardRetentions.where('setId').equals(session.setId).delete();
        if (setCardRetentions.length > 0) {
          await db.cardRetentions.bulkAdd(setCardRetentions);
        }

        const [setRollup] = buildSetStudyRollups(
          setSessions,
          setResults,
          setStats,
          setCards,
          setCardRetentions,
          now,
        );

        if (setRollup) {
          await upsertSetRollup(setRollup);
        } else {
          await db.setStudyRollups.where('setId').equals(session.setId).delete();
        }

        await markAnalyticsRollupsCleanInTransaction(now);
      },
    );
  } catch (error) {
    try {
      await markAnalyticsRollupsDirty(`session-rollup-failed:${sessionId}`);
    } catch (metaError) {
      console.error('Failed to mark analytics dirty after rollup failure', metaError);
    }

    throw error;
  }
}

export function getDailyRollups(): Promise<DailyStudyRollup[]> {
  return db.dailyStudyRollups.orderBy('dateKey').toArray();
}

export function getSetRollups(): Promise<SetStudyRollup[]> {
  return db.setStudyRollups.toArray();
}

export function getCardRetentions(): Promise<CardRetention[]> {
  return db.cardRetentions.toArray();
}

export function getRetentionForCard(cardId: number): Promise<CardRetention | undefined> {
  return db.cardRetentions.where('cardId').equals(cardId).first();
}
