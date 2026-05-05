import Dexie, { type Table } from 'dexie';
import type {
  AnalyticsMeta,
  Pack,
  FlashSet,
  Card,
  CardRetention,
  DailyStudyRollup,
  Session,
  Result,
  SetStudyRollup,
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
  dailyStudyRollups!: Table<DailyStudyRollup, number>;
  setStudyRollups!: Table<SetStudyRollup, number>;
  cardRetentions!: Table<CardRetention, number>;
  analyticsMeta!: Table<AnalyticsMeta, string>;

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

    // v3: add syncStatus index (for querying pending records) to the three synced tables.
    // updatedAt / deletedAt are stored as plain fields and filtered in JS — no index needed.
    // No upgrade() required: new fields default to undefined on existing records.
    this.version(3).stores({
      packs: '++id, &portableId, name, createdAt, syncStatus',
      sets:  '++id, &portableId, packId, title, createdAt, syncStatus',
      cards: '++id, &portableId, setId, createdAt, syncStatus',
    });

    // v4: add analytics-oriented indexes for local sessions, results, and stats.
    // Existing records safely keep new optional analytics fields undefined until written.
    this.version(4).stores({
      packs:          '++id, &portableId, name, createdAt, syncStatus',
      sets:           '++id, &portableId, packId, title, createdAt, syncStatus',
      cards:          '++id, &portableId, setId, createdAt, syncStatus',
      sessions:       '++id, &portableId, setId, startedAt, completedAt, mode',
      results:        '++id, sessionId, cardId, outcome, timestamp, [cardId+timestamp]',
      stats:          '++id, &cardId, lastReviewedAt, lastResult',
      activeSessions: '++id, setId, sessionId',
    });

    this.version(5).stores({
      packs:             '++id, &portableId, name, createdAt, syncStatus',
      sets:              '++id, &portableId, packId, title, createdAt, syncStatus',
      cards:             '++id, &portableId, setId, createdAt, syncStatus',
      sessions:          '++id, &portableId, setId, startedAt, completedAt, mode',
      results:           '++id, sessionId, cardId, outcome, timestamp, [cardId+timestamp]',
      stats:             '++id, &cardId, lastReviewedAt, lastResult',
      activeSessions:    '++id, setId, sessionId',
      dailyStudyRollups: '++id, &dateKey, updatedAt',
      setStudyRollups:   '++id, &setId, lastReviewedAt, updatedAt',
      cardRetentions:    '++id, &cardId, setId, retentionScore, status, lastReviewedAt, updatedAt',
    });

    this.version(6).stores({
      packs:             '++id, &portableId, name, createdAt, syncStatus',
      sets:              '++id, &portableId, packId, title, createdAt, syncStatus',
      cards:             '++id, &portableId, setId, createdAt, syncStatus',
      sessions:          '++id, &portableId, setId, startedAt, completedAt, mode',
      results:           '++id, sessionId, cardId, outcome, timestamp, [cardId+timestamp]',
      stats:             '++id, &cardId, lastReviewedAt, lastResult',
      activeSessions:    '++id, setId, sessionId',
      dailyStudyRollups: '++id, &dateKey, updatedAt',
      setStudyRollups:   '++id, &setId, lastReviewedAt, updatedAt',
      cardRetentions:    '++id, &cardId, setId, retentionScore, status, lastReviewedAt, updatedAt',
      analyticsMeta:     '&key, dirty, version, lastRebuiltAt, lastMarkedDirtyAt',
    });
  }
}

export const db = new FlashcardDatabase();
