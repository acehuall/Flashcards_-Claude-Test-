import Dexie, { type Table } from 'dexie';
import type {
  Pack,
  FlashSet,
  Card,
  Session,
  Result,
  Stat,
  ActiveSession,
} from '../domain/types';

type PortableEntity = {
  portableId?: string;
};

const createPortableId = (): string => globalThis.crypto.randomUUID();

async function assignPortableIds<T extends PortableEntity>(table: Table<T, number>): Promise<void> {
  await table.toCollection().modify((record) => {
    if (!record.portableId) {
      record.portableId = createPortableId();
    }
  });
}

export class FlashcardDatabase extends Dexie {
  packs!: Table<Pack, number>;
  sets!: Table<FlashSet, number>;
  cards!: Table<Card, number>;
  sessions!: Table<Session, number>;
  results!: Table<Result, number>;
  stats!: Table<Stat, number>;
  activeSessions!: Table<ActiveSession, number>;

  constructor() {
    super('FlashcardAppDB');

    this.version(1).stores({
      packs:          '++id, name, createdAt',
      sets:           '++id, packId, title, createdAt',
      cards:          '++id, setId, createdAt',
      sessions:       '++id, setId, startedAt, completedAt',
      results:        '++id, sessionId, cardId, outcome',
      stats:          '++id, cardId',
      activeSessions: '++id, setId, sessionId',
    });

    this.version(2)
      .stores({
        packs:          '++id, &portableId, name, createdAt',
        sets:           '++id, &portableId, packId, title, createdAt',
        cards:          '++id, &portableId, setId, createdAt',
        sessions:       '++id, &portableId, setId, startedAt, completedAt',
        results:        '++id, sessionId, cardId, outcome',
        stats:          '++id, cardId',
        activeSessions: '++id, setId, sessionId',
      })
      .upgrade(async (tx) => {
        await assignPortableIds(tx.table<Pack, number>('packs'));
        await assignPortableIds(tx.table<FlashSet, number>('sets'));
        await assignPortableIds(tx.table<Card, number>('cards'));
        await assignPortableIds(tx.table<Session, number>('sessions'));
      });
  }
}

export const db = new FlashcardDatabase();
