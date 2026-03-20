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
  }
}

export const db = new FlashcardDatabase();
