import { db } from '../db';

/**
 * Soft-delete a Pack and all descendant sets + cards.
 * Sessions, results, stats and activeSessions are hard-deleted (they are not synced).
 */
export async function deletePack(packId: number): Promise<void> {
  await db.transaction(
    'rw',
    [db.packs, db.sets, db.cards, db.sessions, db.results, db.stats, db.activeSessions],
    async () => {
      const now = Date.now();
      const sets = await db.sets.where('packId').equals(packId).toArray();
      const setIds = sets.map((s) => s.id!);

      if (setIds.length > 0) {
        await hardDeleteSetDependencies(setIds);
        // Soft-delete cards belonging to these sets
        await db.cards.where('setId').anyOf(setIds).modify({
          deletedAt: now, updatedAt: now, syncStatus: 'pending',
        });
        // Soft-delete the sets
        await db.sets.where('id').anyOf(setIds).modify({
          deletedAt: now, updatedAt: now, syncStatus: 'pending',
        });
      }

      // Soft-delete the pack
      await db.packs.update(packId, { deletedAt: now, updatedAt: now, syncStatus: 'pending' });
    },
  );
}

/**
 * Soft-delete a Set and all its cards.
 * Sessions, results, stats and activeSessions are hard-deleted.
 */
export async function deleteSet(setId: number): Promise<void> {
  await db.transaction(
    'rw',
    [db.sets, db.cards, db.sessions, db.results, db.stats, db.activeSessions],
    async () => {
      const now = Date.now();
      await hardDeleteSetDependencies([setId]);
      // Soft-delete cards
      await db.cards.where('setId').equals(setId).modify({
        deletedAt: now, updatedAt: now, syncStatus: 'pending',
      });
      // Soft-delete the set
      await db.sets.update(setId, { deletedAt: now, updatedAt: now, syncStatus: 'pending' });
    },
  );
}

/**
 * Soft-delete a single Card.
 * Stats and results are hard-deleted (not synced).
 */
export async function deleteCard(cardId: number): Promise<void> {
  await db.transaction('rw', [db.cards, db.stats, db.results], async () => {
    const now = Date.now();
    await db.results.where('cardId').equals(cardId).delete();
    await db.stats.where('cardId').equals(cardId).delete();
    await db.cards.update(cardId, { deletedAt: now, updatedAt: now, syncStatus: 'pending' });
  });
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Hard-delete non-synced data for the given set IDs:
 * sessions → results → stats → activeSessions.
 * Does NOT touch the set or card records themselves.
 */
async function hardDeleteSetDependencies(setIds: number[]): Promise<void> {
  const sessions = await db.sessions.where('setId').anyOf(setIds).toArray();
  const sessionIds = sessions.map((s) => s.id!);

  const cards = await db.cards.where('setId').anyOf(setIds).toArray();
  const cardIds = cards.map((c) => c.id!);

  if (sessionIds.length > 0) {
    await db.results.where('sessionId').anyOf(sessionIds).delete();
    await db.sessions.bulkDelete(sessionIds);
  }

  if (cardIds.length > 0) {
    await db.stats.where('cardId').anyOf(cardIds).delete();
  }

  await db.activeSessions.where('setId').anyOf(setIds).delete();
}
