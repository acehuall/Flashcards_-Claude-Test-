import {
  DEFAULT_ACCENT_BY_BASE,
  DEFAULT_ACCENT_HEX,
  DEFAULT_BASE_THEME_ID,
} from '../theme/themePresets';

// ─── Core Entity Types ────────────────────────────────────────────────────────

export type SyncStatus = 'pending' | 'synced';

export interface Pack {
  id?: number;
  portableId?: string;
  name: string;
  color: string;
  createdAt: number;
  updatedAt?: number;
  deletedAt?: number;
  syncStatus?: SyncStatus;
}

export interface FlashSet {
  id?: number;
  portableId?: string;
  packId: number;
  title: string;
  description?: string;
  createdAt: number;
  updatedAt?: number;
  deletedAt?: number;
  syncStatus?: SyncStatus;
}

export interface Card {
  id?: number;
  portableId?: string;
  setId: number;
  question: string;
  answer: string;
  createdAt: number;
  updatedAt?: number;
  deletedAt?: number;
  syncStatus?: SyncStatus;
}

// ─── Session & Results ────────────────────────────────────────────────────────

export type Outcome = 'correct' | 'incorrect' | 'flagged';
export type SessionMode = 'full' | 'flagged' | 'incorrect-only';
export type AnswerMethod = 'button' | 'keyboard' | 'swipe';

export interface Session {
  id?: number;
  portableId?: string;
  setId: number;
  startedAt: number;
  completedAt?: number;
  score?: number;
  mode: SessionMode;
  totalCards?: number;
  correctCount?: number;
  incorrectCount?: number;
  flaggedCount?: number;
  durationMs?: number;
}

export interface Result {
  id?: number;
  sessionId: number;
  cardId: number;
  outcome: Outcome;
  timestamp: number;
  shownAt?: number;
  flippedAt?: number;
  answeredAt?: number;
  responseMs?: number;
  wasAutoShown?: boolean;
  answerMethod?: AnswerMethod;
}

export interface Stat {
  id?: number;
  cardId: number;
  correctCount: number;
  incorrectCount: number;
  flaggedCount: number;
  lastResult?: Outcome;
  lastReviewedAt?: number;
  reviewCount?: number;
  currentCorrectStreak?: number;
  bestCorrectStreak?: number;
  currentIncorrectStreak?: number;
  avgResponseMs?: number;
  fastestResponseMs?: number;
  slowestResponseMs?: number;
  firstReviewedAt?: number;
}

// ─── Local Analytics Rollups ──────────────────────────────────────────────────

export interface DailyStudyRollup {
  id?: number;
  dateKey: string; // yyyy-mm-dd, local date
  reviewedCount: number;
  correctCount: number;
  incorrectCount: number;
  flaggedCount: number;
  totalDurationMs: number;
  sessionCount: number;
  avgResponseMs?: number;
  updatedAt: number;
}

export interface SetStudyRollup {
  id?: number;
  setId: number;
  reviewedCount: number;
  correctCount: number;
  incorrectCount: number;
  flaggedCount: number;
  sessionCount: number;
  totalDurationMs: number;
  avgResponseMs?: number;
  weakCardCount?: number;
  lastReviewedAt?: number;
  updatedAt: number;
}

export type CardRetentionStatus = 'strong' | 'improving' | 'needs-practice' | 'not-reviewed-recently' | 'due';

export interface CardRetention {
  id?: number;
  cardId: number;
  setId: number;
  reviewCount: number;
  recentAccuracy: number; // 0 to 1
  lifetimeAccuracy: number; // 0 to 1
  avgResponseMs?: number;
  lastReviewedAt?: number;
  daysSinceLastReview?: number;
  retentionScore: number; // 0 to 100
  status: CardRetentionStatus;
  updatedAt: number;
}

export interface AnalyticsMeta {
  key: 'rollups';
  dirty: boolean;
  version: number;
  lastRebuiltAt?: number;
  lastMarkedDirtyAt?: number;
  reason?: string;
}

// ─── Active Session Snapshot ──────────────────────────────────────────────────

export interface ReviewCard {
  id: number;
  question: string;
  answer: string;
}

export interface ActiveSessionSnapshot {
  sessionId: number;
  setId: number;
  mode: SessionMode;
  queue: ReviewCard[];
  currentIndex: number;
  outcomes: Record<number, Outcome>;
  flaggedCardIds: number[];
}

export interface ActiveSession {
  id?: number;
  setId: number;
  sessionId: number;
  snapshot: string; // JSON stringified ActiveSessionSnapshot
  savedAt: number;
}

// ─── App Settings ─────────────────────────────────────────────────────────────

export type BaseThemeId = 'graphite' | 'midnight' | 'ivory' | 'forest' | 'crimson';

export interface AppSettings {
  shuffleCards: boolean;
  flipAnimation: boolean;
  autoShowAnswer: 0 | 3 | 5 | 10;
  swipeGestures: boolean;    // stored but not implemented in Phase A
  studyReminders: boolean;   // stored but not implemented in Phase A
  baseThemeId: BaseThemeId;
  accentHex: string;
  accentByBase?: Partial<Record<BaseThemeId, string>>;
}

export const DEFAULT_SETTINGS: AppSettings = {
  shuffleCards: true,
  flipAnimation: true,
  autoShowAnswer: 0,
  swipeGestures: true,
  studyReminders: false,
  baseThemeId: DEFAULT_BASE_THEME_ID,
  accentHex: DEFAULT_ACCENT_HEX,
  accentByBase: { ...DEFAULT_ACCENT_BY_BASE },
};

// ─── CSV ──────────────────────────────────────────────────────────────────────

export interface CsvImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

// ─── Review Engine ────────────────────────────────────────────────────────────

export interface ReviewState {
  queue: ReviewCard[];
  currentIndex: number;
  isFlipped: boolean;
  outcomes: Record<number, Outcome>;
  flaggedCardIds: number[];
  sessionId: number | null;
  setId: number;
  mode: SessionMode;
  isComplete: boolean;
  totalCards: number;        // original queue size for progress display
}

export type ReviewAction =
  | { type: 'FLIP' }
  | { type: 'MARK_CORRECT' }
  | { type: 'MARK_INCORRECT' }
  | { type: 'MARK_FLAGGED' }
  | { type: 'NAVIGATE_PREV' }
  | { type: 'NAVIGATE_NEXT' }
  | { type: 'NAVIGATE_TO'; payload: number }
  | { type: 'RESTORE'; payload: ActiveSessionSnapshot };
