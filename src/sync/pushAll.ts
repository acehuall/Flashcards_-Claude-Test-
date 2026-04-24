import { pushPacks } from './pushPacks';
import { pushSets } from './pushSets';
import { pushCards } from './pushCards';

export interface PushAllResult {
  packs: number;
  sets: number;
  cards: number;
}

// Pushes packs → sets → cards in dependency order.
// Each step repairs missing portableIds before syncing.
export async function pushAll(userId: string): Promise<PushAllResult> {
  const packs = await pushPacks(userId);
  const sets  = await pushSets(userId);
  const cards = await pushCards(userId);
  return { packs, sets, cards };
}
