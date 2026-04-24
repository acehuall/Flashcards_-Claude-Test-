import { db } from '../db';
import { supabase } from '../db/supabase';

export async function pushSets(userId: string): Promise<number> {
  if (!supabase) throw new Error('Supabase is not configured');

  // Repair any existing sets that were created before portableId was added
  await db.sets.toCollection().modify((set) => {
    if (!set.portableId) set.portableId = crypto.randomUUID();
  });

  const sets = await db.sets.toArray();
  if (sets.length === 0) return 0;

  // Build a map of pack Dexie id → portableId for the foreign-key column
  const packs = await db.packs.toArray();
  const packPortableId = new Map(packs.map((p) => [p.id!, p.portableId as string]));

  const rows = sets
    .filter((s) => packPortableId.has(s.packId))
    .map((s) => ({
      user_id:          userId,
      portable_id:      s.portableId as string,
      pack_portable_id: packPortableId.get(s.packId)!,
      name:             s.title,
      description:      s.description ?? null as string | null,
      created_at:       new Date(s.createdAt).toISOString(),
      updated_at:       new Date(s.updatedAt ?? s.createdAt).toISOString(),
      deleted_at:       s.deletedAt ? new Date(s.deletedAt).toISOString() : null as string | null,
    }));

  if (rows.length === 0) return 0;

  const { error } = await supabase
    .from('sets')
    .upsert(rows, { onConflict: 'user_id,portable_id' });

  if (error) throw new Error(error.message);

  // Mark pushed records as synced
  const pushedIds = rows.map((r) => r.portable_id);
  await db.sets.where('portableId').anyOf(pushedIds).modify({ syncStatus: 'synced' });

  return rows.length;
}
