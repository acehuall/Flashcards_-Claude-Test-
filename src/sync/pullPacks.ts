import { db } from '../db';
import { supabase } from '../db/supabase';

interface RemotePack {
  portable_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/**
 * Pulls packs from Supabase and merges them into Dexie.
 * Conflict resolution: latest updated_at wins.
 * Returns the number of records written (inserted or updated).
 */
export async function pullPacks(userId: string): Promise<number> {
  if (!supabase) throw new Error('Supabase is not configured');

  const { data, error } = await supabase
    .from('packs')
    .select('portable_id, name, created_at, updated_at, deleted_at')
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return 0;

  const localPacks = await db.packs.toArray();
  const localByPortableId = new Map(
    localPacks.filter((p) => p.portableId).map((p) => [p.portableId!, p]),
  );

  let written = 0;

  for (const remote of data as RemotePack[]) {
    const remoteUpdatedAt = new Date(remote.updated_at).getTime();
    const remoteCreatedAt = new Date(remote.created_at).getTime();
    const remoteDeletedAt = remote.deleted_at ? new Date(remote.deleted_at).getTime() : undefined;

    const local = localByPortableId.get(remote.portable_id);

    if (!local) {
      // New pack from server — insert into Dexie
      await db.packs.add({
        portableId: remote.portable_id,
        name: remote.name,
        color: '#6366f1', // default; color is a local-only UI preference
        createdAt: remoteCreatedAt,
        updatedAt: remoteUpdatedAt,
        deletedAt: remoteDeletedAt,
        syncStatus: 'synced',
      });
      written++;
    } else {
      const localUpdatedAt = local.updatedAt ?? local.createdAt;

      if (remoteUpdatedAt > localUpdatedAt) {
        // Remote is newer — overwrite local fields (keep local color)
        await db.packs.update(local.id!, {
          name: remote.name,
          updatedAt: remoteUpdatedAt,
          deletedAt: remoteDeletedAt,
          syncStatus: 'synced',
        });
        written++;
      } else if (local.syncStatus !== 'synced') {
        // Local is same age or newer — local will be pushed; just mark synced
        // if timestamps match exactly (means server already has this version)
        if (remoteUpdatedAt === localUpdatedAt) {
          await db.packs.update(local.id!, { syncStatus: 'synced' });
        }
        // else: local is newer → leave as 'pending', will be pushed
      }
    }
  }

  return written;
}
