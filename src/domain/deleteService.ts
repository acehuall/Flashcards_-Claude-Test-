import { db } from '../db';

/**
 * Delete a Pack and all descendant data:
 * sets → cards → sessions → results → stats → activeSessions
 */
export async function deletePack(packId: number): Promise<void> {
  await db.transaction(
    'rw',
    [db.packs, db.sets, db.cards, db.sessions, db.results, db.stats, db.activeSessions],
    async () => {
      const sets = await db.sets.where('packId').equals(packId).toArray();
      const setIds = sets.map((s) => s.id!);

      if (setIds.length > 0) {
        await deleteSetData(setIds);
        await db.sets.bulkDelete(setIds);
      }

      await db.packs.delete(packId);
    },
  );
}

/**
 * Delete a Set and all descendant data:
 * cards → sessions → results → stats → activeSessions
 */
export async function deleteSet(setId: number): Promise<void> {
  await db.transaction(
    'rw',
    [db.sets, db.cards, db.sessions, db.results, db.stats, db.activeSessions],
    async () => {
      await deleteSetData([setId]);
      await db.sets.delete(setId);
    },
  );
}

/**
 * Delete a single Card and its stats / any result entries.
 */
export async function deleteCard(cardId: number): Promise<void> {
  await db.transaction('rw', [db.cards, db.stats, db.results], async () => {
    await db.results.where('cardId').equals(cardId).delete();
    await db.stats.where('cardId').equals(cardId).delete();
    await db.cards.delete(cardId);
  });
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function deleteSetData(setIds: number[]): Promise<void> {
  const cards = await db.cards.where('setId').anyOf(setIds).toArray();
  const cardIds = cards.map((c) => c.id!);

  const sessions = await db.sessions.where('setId').anyOf(setIds).toArray();
  const sessionIds = sessions.map((s) => s.id!);

  if (sessionIds.length > 0) {
    await db.results.where('sessionId').anyOf(sessionIds).delete();
    await db.sessions.bulkDelete(sessionIds);
  }

  if (cardIds.length > 0) {
    await db.stats.where('cardId').anyOf(cardIds).delete();
    await db.cards.bulkDelete(cardIds);
  }

  // Remove any in-progress sessions for these sets
  await db.activeSessions.where('setId').anyOf(setIds).delete();
}
