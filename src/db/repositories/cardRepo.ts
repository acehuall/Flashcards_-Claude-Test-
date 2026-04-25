import { db } from '../index';
import type { Card } from '../../domain/types';

export const cardRepo = {
  async getBySetId(setId: number): Promise<Card[]> {
    const all = await db.cards.where('setId').equals(setId).sortBy('createdAt');
    return all.filter((c) => !c.deletedAt);
  },

  async getById(id: number): Promise<Card | undefined> {
    const c = await db.cards.get(id);
    return c && !c.deletedAt ? c : undefined;
  },

  async create(data: Omit<Card, 'id' | 'createdAt'>): Promise<number> {
    const now = Date.now();
    return db.cards.add({
      ...data,
      portableId: data.portableId ?? globalThis.crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    });
  },

  async update(id: number, data: Partial<Omit<Card, 'id' | 'setId'>>): Promise<void> {
    await db.cards.update(id, { ...data, updatedAt: Date.now(), syncStatus: 'pending' });
  },

  async delete(id: number): Promise<void> {
    const now = Date.now();
    await db.cards.update(id, { deletedAt: now, updatedAt: now, syncStatus: 'pending' });
  },

  async bulkCreate(cards: Omit<Card, 'id' | 'createdAt'>[]): Promise<number[]> {
    const now = Date.now();
    const rows = cards.map((c) => ({
      ...c,
      portableId: c.portableId ?? globalThis.crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending' as const,
    }));
    const keys = await db.cards.bulkAdd(rows, { allKeys: true });
    return keys as number[];
  },

  async countBySetId(setId: number): Promise<number> {
    const all = await db.cards.where('setId').equals(setId).toArray();
    return all.filter((c) => !c.deletedAt).length;
  },
};
