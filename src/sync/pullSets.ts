import { db } from '../db';
import { supabase } from '../db/supabase';

interface RemoteSet {
  portable_id: string;
  pack_portable_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/**
 * Pulls sets from Supabase and merges them into Dexie.
 * Requires packs to have been pulled first so pack_portable_id can be resolved.
 * Conflict resolution: latest updated_at wins.
 * Returns the number of records written (inserted or updated).
 */
export async function pullSets(userId: string): Promise<number> {
  if (!supabase) throw new Error('Supabase is not configured');

  const { data, error } = await supabase
    .from('sets')
    .select('portable_id, pack_portable_id, name, description, created_at, updated_at, deleted_at')
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return 0;

  // Build lookup: portableId → Dexie id for packs
  const localPacks = await db.packs.toArray();
  const packIdByPortableId = new Map(
    localPacks.filter((p) => p.portableId).map((p) => [p.portableId!, p.id!]),
  );

  // Build lookup for existing local sets
  const localSets = await db.sets.toArray();
  const localByPortableId = new Map(
    localSets.filter((s) => s.portableId).map((s) => [s.portableId!, s]),
  );

  let written = 0;

  for (const remote of data as RemoteSet[]) {
    const packId = packIdByPortableId.get(remote.pack_portable_id);
    if (packId === undefined) {
      // Parent pack not found locally — skip for now (will sync on next pull)
      continue;
    }

    const remoteUpdatedAt = new Date(remote.updated_at).getTime();
    const remoteCreatedAt = new Date(remote.created_at).getTime();
    const remoteDeletedAt = remote.deleted_at ? new Date(remote.deleted_at).getTime() : undefined;

    const local = localByPortableId.get(remote.portable_id);

    if (!local) {
      await db.sets.add({
        portableId: remote.portable_id,
        packId,
        title: remote.name,
        description: remote.description ?? undefined,
        createdAt: remoteCreatedAt,
        updatedAt: remoteUpdatedAt,
        deletedAt: remoteDeletedAt,
        syncStatus: 'synced',
      });
      written++;
    } else {
      const localUpdatedAt = local.updatedAt ?? local.createdAt;

      if (remoteUpdatedAt > localUpdatedAt) {
        await db.sets.update(local.id!, {
          title: remote.name,
          description: remote.description ?? undefined,
          updatedAt: remoteUpdatedAt,
          deletedAt: remoteDeletedAt,
          syncStatus: 'synced',
        });
        written++;
      } else if (local.syncStatus !== 'synced' && remoteUpdatedAt === localUpdatedAt) {
        await db.sets.update(local.id!, { syncStatus: 'synced' });
      }
    }
  }

  return written;
}
