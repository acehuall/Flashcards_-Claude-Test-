import { db } from '../db';
import { supabase } from '../db/supabase';

export async function pushCards(userId: string): Promise<number> {
  if (!supabase) throw new Error('Supabase is not configured');

  // Repair any existing cards that were created before portableId was added
  await db.cards.toCollection().modify((card) => {
    if (!card.portableId) card.portableId = crypto.randomUUID();
  });

  const cards = await db.cards.toArray();
  if (cards.length === 0) return 0;

  // Build a map of set Dexie id → portableId for the foreign-key column
  const sets = await db.sets.toArray();
  const setPortableId = new Map(sets.map((s) => [s.id!, s.portableId as string]));

  const rows = cards
    .filter((c) => setPortableId.has(c.setId))
    .map((c) => ({
      user_id:        userId,
      portable_id:    c.portableId as string,
      set_portable_id: setPortableId.get(c.setId)!,
      front:          c.question,
      back:           c.answer,
      created_at:     new Date(c.createdAt).toISOString(),
      updated_at:     new Date(c.updatedAt ?? c.createdAt).toISOString(),
      deleted_at:     c.deletedAt ? new Date(c.deletedAt).toISOString() : null as string | null,
    }));

  if (rows.length === 0) return 0;

  const { error } = await supabase
    .from('cards')
    .upsert(rows, { onConflict: 'user_id,portable_id' });

  if (error) throw new Error(error.message);

  // Mark pushed records as synced
  const pushedIds = rows.map((r) => r.portable_id);
  await db.cards.where('portableId').anyOf(pushedIds).modify({ syncStatus: 'synced' });

  return rows.length;
}
