import { db } from '../db';
import { supabase } from '../db/supabase';

interface RemoteCard {
  portable_id: string;
  set_portable_id: string;
  front: string;
  back: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/**
 * Pulls cards from Supabase and merges them into Dexie.
 * Requires sets to have been pulled first so set_portable_id can be resolved.
 * Conflict resolution: latest updated_at wins.
 * Returns the number of records written (inserted or updated).
 */
export async function pullCards(userId: string): Promise<number> {
  if (!supabase) throw new Error('Supabase is not configured');

  const { data, error } = await supabase
    .from('cards')
    .select('portable_id, set_portable_id, front, back, created_at, updated_at, deleted_at')
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return 0;

  // Build lookup: portableId → Dexie id for sets
  const localSets = await db.sets.toArray();
  const setIdByPortableId = new Map(
    localSets.filter((s) => s.portableId).map((s) => [s.portableId!, s.id!]),
  );

  // Build lookup for existing local cards
  const localCards = await db.cards.toArray();
  const localByPortableId = new Map(
    localCards.filter((c) => c.portableId).map((c) => [c.portableId!, c]),
  );

  let written = 0;

  for (const remote of data as RemoteCard[]) {
    const setId = setIdByPortableId.get(remote.set_portable_id);
    if (setId === undefined) {
      // Parent set not found locally — skip for now
      continue;
    }

    const remoteUpdatedAt = new Date(remote.updated_at).getTime();
    const remoteCreatedAt = new Date(remote.created_at).getTime();
    const remoteDeletedAt = remote.deleted_at ? new Date(remote.deleted_at).getTime() : undefined;

    const local = localByPortableId.get(remote.portable_id);

    if (!local) {
      await db.cards.add({
        portableId: remote.portable_id,
        setId,
        question: remote.front,
        answer: remote.back,
        createdAt: remoteCreatedAt,
        updatedAt: remoteUpdatedAt,
        deletedAt: remoteDeletedAt,
        syncStatus: 'synced',
      });
      written++;
    } else {
      const localUpdatedAt = local.updatedAt ?? local.createdAt;

      if (remoteUpdatedAt > localUpdatedAt) {
        await db.cards.update(local.id!, {
          question: remote.front,
          answer: remote.back,
          updatedAt: remoteUpdatedAt,
          deletedAt: remoteDeletedAt,
          syncStatus: 'synced',
        });
        written++;
      } else if (local.syncStatus !== 'synced' && remoteUpdatedAt === localUpdatedAt) {
        await db.cards.update(local.id!, { syncStatus: 'synced' });
      }
    }
  }

  return written;
}
