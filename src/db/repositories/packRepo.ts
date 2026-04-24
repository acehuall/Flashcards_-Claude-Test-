import { db } from '../index';
import type { Pack } from '../../domain/types';

export const packRepo = {
  async getAll(): Promise<Pack[]> {
    const all = await db.packs.orderBy('createdAt').reverse().toArray();
    return all.filter((p) => !p.deletedAt);
  },

  async getById(id: number): Promise<Pack | undefined> {
    const p = await db.packs.get(id);
    return p && !p.deletedAt ? p : undefined;
  },

  async create(data: Omit<Pack, 'id' | 'createdAt'>): Promise<number> {
    const now = Date.now();
    return db.packs.add({
      ...data,
      portableId: data.portableId ?? globalThis.crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    });
  },

  async update(id: number, data: Partial<Omit<Pack, 'id'>>): Promise<void> {
    await db.packs.update(id, { ...data, updatedAt: Date.now(), syncStatus: 'pending' });
  },

  async delete(id: number): Promise<void> {
    const now = Date.now();
    await db.packs.update(id, { deletedAt: now, updatedAt: now, syncStatus: 'pending' });
  },
};
