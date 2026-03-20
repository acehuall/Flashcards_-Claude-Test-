import { db } from '../index';
import type { Card } from '../../domain/types';

export const cardRepo = {
  getBySetId(setId: number): Promise<Card[]> {
    return db.cards.where('setId').equals(setId).sortBy('createdAt');
  },

  getById(id: number): Promise<Card | undefined> {
    return db.cards.get(id);
  },

  async create(data: Omit<Card, 'id' | 'createdAt'>): Promise<number> {
    return db.cards.add({ ...data, createdAt: Date.now() });
  },

  async update(id: number, data: Partial<Omit<Card, 'id' | 'setId'>>): Promise<void> {
    await db.cards.update(id, data);
  },

  delete(id: number): Promise<void> {
    return db.cards.delete(id);
  },

  async bulkCreate(cards: Omit<Card, 'id' | 'createdAt'>[]): Promise<number[]> {
    const now = Date.now();
    const withTimestamps = cards.map((c) => ({ ...c, createdAt: now }));
    // Dexie bulkAdd returns the last inserted id, but we want all keys
    const keys = await db.cards.bulkAdd(withTimestamps, { allKeys: true });
    return keys as number[];
  },

  countBySetId(setId: number): Promise<number> {
    return db.cards.where('setId').equals(setId).count();
  },
};
