import type {
  ReviewState,
  ReviewAction,
  ReviewCard,
  Outcome,
  SessionMode,
  ActiveSessionSnapshot,
} from './types';

// ─── Pure Helper Functions ────────────────────────────────────────────────────

export function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function buildInitialState(
  cards: ReviewCard[],
  sessionId: number,
  setId: number,
  mode: SessionMode,
  shouldShuffle: boolean,
): ReviewState {
  const queue = shouldShuffle ? shuffle(cards) : [...cards];
  return {
    queue,
    currentIndex: 0,
    isFlipped: false,
    outcomes: {},
    flaggedCardIds: [],
    sessionId,
    setId,
    mode,
    isComplete: queue.length === 0,
    totalCards: queue.length,
  };
}

export function buildStateFromSnapshot(snapshot: ActiveSessionSnapshot): ReviewState {
  return {
    queue: snapshot.queue,
    currentIndex: snapshot.currentIndex,
    isFlipped: false,
    outcomes: snapshot.outcomes,
    flaggedCardIds: snapshot.flaggedCardIds,
    sessionId: snapshot.sessionId,
    setId: snapshot.setId,
    mode: snapshot.mode,
    isComplete: false,
    totalCards: snapshot.queue.length + Object.keys(snapshot.outcomes).length,
  };
}

export function toSnapshot(state: ReviewState): ActiveSessionSnapshot {
  return {
    sessionId: state.sessionId!,
    setId: state.setId,
    mode: state.mode,
    queue: state.queue,
    currentIndex: state.currentIndex,
    outcomes: state.outcomes,
    flaggedCardIds: state.flaggedCardIds,
  };
}

export function getCorrectCount(outcomes: Record<number, Outcome>): number {
  return Object.values(outcomes).filter((o) => o === 'correct').length;
}

export function getIncorrectCount(outcomes: Record<number, Outcome>): number {
  return Object.values(outcomes).filter((o) => o === 'incorrect').length;
}

export function getFlaggedCount(outcomes: Record<number, Outcome>): number {
  return Object.values(outcomes).filter((o) => o === 'flagged').length;
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

export function reviewReducer(
  state: ReviewState,
  action: ReviewAction,
): ReviewState {
  if (state.isComplete && action.type !== 'RESTORE') return state;

  switch (action.type) {
    case 'FLIP': {
      return { ...state, isFlipped: !state.isFlipped };
    }

    case 'MARK_CORRECT': {
      const card = state.queue[state.currentIndex];
      if (!card) return state;

      const newOutcomes = { ...state.outcomes, [card.id]: 'correct' as Outcome };
      const newQueue = state.queue.filter((_, i) => i !== state.currentIndex);
      const isComplete = newQueue.length === 0;

      return {
        ...state,
        queue: newQueue,
        isFlipped: false,
        outcomes: newOutcomes,
        isComplete,
        // currentIndex stays — the next card shifts into the same slot
        currentIndex: Math.min(state.currentIndex, newQueue.length - 1),
      };
    }

    case 'MARK_INCORRECT': {
      const card = state.queue[state.currentIndex];
      if (!card) return state;

      const newOutcomes = { ...state.outcomes, [card.id]: 'incorrect' as Outcome };
      const newQueue = state.queue.filter((_, i) => i !== state.currentIndex);
      const isComplete = newQueue.length === 0;

      return {
        ...state,
        queue: newQueue,
        isFlipped: false,
        outcomes: newOutcomes,
        isComplete,
        currentIndex: Math.min(state.currentIndex, newQueue.length - 1),
      };
    }

    case 'MARK_FLAGGED': {
      const card = state.queue[state.currentIndex];
      if (!card) return state;

      const newOutcomes = { ...state.outcomes, [card.id]: 'flagged' as Outcome };
      const newFlagged = state.flaggedCardIds.includes(card.id)
        ? state.flaggedCardIds
        : [...state.flaggedCardIds, card.id];
      const newQueue = state.queue.filter((_, i) => i !== state.currentIndex);
      const isComplete = newQueue.length === 0;

      return {
        ...state,
        queue: newQueue,
        isFlipped: false,
        outcomes: newOutcomes,
        flaggedCardIds: newFlagged,
        isComplete,
        currentIndex: Math.min(state.currentIndex, newQueue.length - 1),
      };
    }

    case 'NAVIGATE_PREV': {
      return {
        ...state,
        currentIndex: Math.max(0, state.currentIndex - 1),
        isFlipped: false,
      };
    }

    case 'NAVIGATE_NEXT': {
      return {
        ...state,
        currentIndex: Math.min(state.queue.length - 1, state.currentIndex + 1),
        isFlipped: false,
      };
    }

    case 'RESTORE': {
      return buildStateFromSnapshot(action.payload);
    }

    default:
      return state;
  }
}
