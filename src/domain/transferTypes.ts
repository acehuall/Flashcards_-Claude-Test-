import type { Outcome, SessionMode } from './types';

export type ExportScope = 'set' | 'pack' | 'library';
export type ImportMode = 'copy' | 'merge' | 'replace';
export type IdentityMode = 'portable' | 'heuristic';

export interface PortableCard {
  sourceId: number;
  portableId?: string;
  question: string;
  answer: string;
  createdAt: number;
}

export interface PortableSet {
  sourceId: number;
  portableId?: string;
  title: string;
  description?: string;
  createdAt: number;
  cards: PortableCard[];
}

export interface PortablePack {
  sourceId: number;
  portableId?: string;
  name: string;
  color: string;
  createdAt: number;
  sets: PortableSet[];
}

export interface PortableSession {
  sourceId: number;
  portableId?: string;
  setSourceId: number;
  setPortableId?: string;
  startedAt: number;
  completedAt?: number;
  score?: number;
  mode: SessionMode;
}

export interface PortableResult {
  sourceId: number;
  sessionSourceId: number;
  sessionPortableId?: string;
  cardSourceId: number;
  cardPortableId?: string;
  outcome: Outcome;
  timestamp: number;
}

export interface PortableStat {
  cardSourceId: number;
  cardPortableId?: string;
  correctCount: number;
  incorrectCount: number;
  flaggedCount: number;
  lastResult?: Outcome;
  lastReviewedAt?: number;
}

export interface PortableLibrary {
  packs: PortablePack[];
  stats: PortableStat[];
  sessions: PortableSession[];
  results: PortableResult[];
}

export interface ImportConflict {
  entity: 'pack' | 'set' | 'card' | 'session' | 'result' | 'stat';
  message: string;
  sourceId?: number;
  portableId?: string;
}

export interface ImportWarning {
  code: string;
  message: string;
}

export interface ImportPreview {
  scope: ExportScope;
  target: string;
  version: number;
  identityMode: IdentityMode;
  mode: ImportMode;
  includeStats: boolean;
  includeSessions: boolean;
  counts: {
    packs: number;
    sets: number;
    cards: number;
    stats: number;
    sessions: number;
    results: number;
  };
  duplicates: number;
  conflicts: ImportConflict[];
  warnings: ImportWarning[];
  affectedActiveSessions: number;
  plannedCreates: number;
  plannedMerges: number;
  plannedReplacements: number;
}

export interface ImportPlan {
  mode: ImportMode;
  creates: number;
  merges: number;
  replacements: number;
  skipped: number;
  warnings: ImportWarning[];
  conflicts: ImportConflict[];
}

export interface ExportOptions {
  includeStats: boolean;
  includeSessions: boolean;
}
