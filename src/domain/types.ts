// ─── Core Entity Types ────────────────────────────────────────────────────────

export interface Pack {
  id?: number;
  name: string;
  color: string;
  createdAt: number;
}

export interface FlashSet {
  id?: number;
  packId: number;
  title: string;
  description?: string;
  createdAt: number;
}

export interface Card {
  id?: number;
  setId: number;
  question: string;
  answer: string;
  createdAt: number;
}

// ─── Session & Results ────────────────────────────────────────────────────────

export type Outcome = 'correct' | 'incorrect' | 'flagged';
export type SessionMode = 'full' | 'flagged' | 'incorrect-only';

export interface Session {
  id?: number;
  setId: number;
  startedAt: number;
  completedAt?: number;
  score?: number;
  mode: SessionMode;
}

export interface Result {
  id?: number;
  sessionId: number;
  cardId: number;
  outcome: Outcome;
  timestamp: number;
}

export interface Stat {
  id?: number;
  cardId: number;
  correctCount: number;
  incorrectCount: number;
  flaggedCount: number;
  lastResult?: Outcome;
  lastReviewedAt?: number;
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

export interface AppSettings {
  shuffleCards: boolean;
  flipAnimation: boolean;
  autoShowAnswer: 0 | 3 | 5 | 10;
  swipeGestures: boolean;    // stored but not implemented in Phase A
  studyReminders: boolean;   // stored but not implemented in Phase A
}

export const DEFAULT_SETTINGS: AppSettings = {
  shuffleCards: true,
  flipAnimation: true,
  autoShowAnswer: 0,
  swipeGestures: true,
  studyReminders: false,
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
