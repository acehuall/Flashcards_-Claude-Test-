import { db } from '../index';
import type { Pack } from '../../domain/types';

export const packRepo = {
  getAll(): Promise<Pack[]> {
    return db.packs.orderBy('createdAt').reverse().toArray();
  },

  getById(id: number): Promise<Pack | undefined> {
    return db.packs.get(id);
  },

  async create(data: Omit<Pack, 'id' | 'createdAt'>): Promise<number> {
    return db.packs.add({ ...data, createdAt: Date.now() });
  },

  async update(id: number, data: Partial<Omit<Pack, 'id'>>): Promise<void> {
    await db.packs.update(id, data);
  },

  delete(id: number): Promise<void> {
    return db.packs.delete(id);
  },
};
