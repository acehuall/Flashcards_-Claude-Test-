import { pullPacks } from './pullPacks';
import { pullSets } from './pullSets';
import { pullCards } from './pullCards';
import { pushPacks } from './pushPacks';
import { pushSets } from './pushSets';
import { pushCards } from './pushCards';

export interface SyncAllResult {
  pulled: { packs: number; sets: number; cards: number };
  pushed: { packs: number; sets: number; cards: number };
}

/**
 * Full two-way sync in dependency order:
 *   1. Pull packs → sets → cards  (remote changes land in Dexie first)
 *   2. Push packs → sets → cards  (local pending changes go to Supabase)
 *
 * "Latest updated_at wins" is applied during the pull phase.
 * After pull, any locally-newer records retain syncStatus:'pending' and are
 * picked up by the push phase.
 */
export async function syncAll(userId: string): Promise<SyncAllResult> {
  // ── Pull phase ────────────────────────────────────────────────────────────
  const pulledPacks = await pullPacks(userId);
  const pulledSets  = await pullSets(userId);
  const pulledCards = await pullCards(userId);

  // ── Push phase ────────────────────────────────────────────────────────────
  const pushedPacks = await pushPacks(userId);
  const pushedSets  = await pushSets(userId);
  const pushedCards = await pushCards(userId);

  return {
    pulled: { packs: pulledPacks, sets: pulledSets, cards: pulledCards },
    pushed: { packs: pushedPacks, sets: pushedSets, cards: pushedCards },
  };
}
