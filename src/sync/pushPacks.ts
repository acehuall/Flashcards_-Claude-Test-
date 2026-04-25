import { db } from '../db';
import { supabase } from '../db/supabase';

export async function pushPacks(userId: string): Promise<number> {
  if (!supabase) throw new Error('Supabase is not configured');

  // Repair any existing packs that were created before portableId was added
  await db.packs.toCollection().modify((pack) => {
    if (!pack.portableId) pack.portableId = crypto.randomUUID();
  });

  const packs = await db.packs.toArray();
  if (packs.length === 0) return 0;

  const rows = packs.map((p) => ({
    user_id:    userId,
    portable_id: p.portableId as string,
    name:       p.name,
    description: null as string | null,
    created_at: new Date(p.createdAt).toISOString(),
    updated_at: new Date(p.updatedAt ?? p.createdAt).toISOString(),
    deleted_at: p.deletedAt ? new Date(p.deletedAt).toISOString() : null as string | null,
  }));

  const { error } = await supabase
    .from('packs')
    .upsert(rows, { onConflict: 'user_id,portable_id' });

  if (error) throw new Error(error.message);

  // Mark pushed records as synced
  const pushedIds = rows.map((r) => r.portable_id);
  await db.packs.where('portableId').anyOf(pushedIds).modify({ syncStatus: 'synced' });

  return rows.length;
}
