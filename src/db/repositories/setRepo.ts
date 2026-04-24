import { db } from '../index';
import type { FlashSet } from '../../domain/types';

export const setRepo = {
  async getAll(): Promise<FlashSet[]> {
    const all = await db.sets.orderBy('createdAt').toArray();
    return all.filter((s) => !s.deletedAt);
  },

  async getByPackId(packId: number): Promise<FlashSet[]> {
    const all = await db.sets.where('packId').equals(packId).sortBy('createdAt');
    return all.filter((s) => !s.deletedAt);
  },

  async getById(id: number): Promise<FlashSet | undefined> {
    const s = await db.sets.get(id);
    return s && !s.deletedAt ? s : undefined;
  },

  async create(data: Omit<FlashSet, 'id' | 'createdAt'>): Promise<number> {
    const now = Date.now();
    return db.sets.add({
      ...data,
      portableId: data.portableId ?? globalThis.crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    });
  },

  async update(id: number, data: Partial<Omit<FlashSet, 'id'>>): Promise<void> {
    await db.sets.update(id, { ...data, updatedAt: Date.now(), syncStatus: 'pending' });
  },

  async delete(id: number): Promise<void> {
    const now = Date.now();
    await db.sets.update(id, { deletedAt: now, updatedAt: now, syncStatus: 'pending' });
  },
};
