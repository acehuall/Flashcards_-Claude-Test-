import { db } from '../index';
import type { FlashSet } from '../../domain/types';

export const setRepo = {
  getAll(): Promise<FlashSet[]> {
    return db.sets.orderBy('createdAt').toArray();
  },

  getByPackId(packId: number): Promise<FlashSet[]> {
    return db.sets.where('packId').equals(packId).sortBy('createdAt');
  },

  getById(id: number): Promise<FlashSet | undefined> {
    return db.sets.get(id);
  },

  async create(data: Omit<FlashSet, 'id' | 'createdAt'>): Promise<number> {
    return db.sets.add({ ...data, createdAt: Date.now() });
  },

  async update(id: number, data: Partial<Omit<FlashSet, 'id'>>): Promise<void> {
    await db.sets.update(id, data);
  },

  delete(id: number): Promise<void> {
    return db.sets.delete(id);
  },
};
