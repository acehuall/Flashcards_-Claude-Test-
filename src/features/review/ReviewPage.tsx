import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../../db';
import { sessionRepo, resultRepo, statsRepo, activeSessionRepo } from '../../db/repositories/sessionRepo';
import {
  reviewReducer,
  buildInitialState,
  toSnapshot,
  getCorrectCount,
  getIncorrectCount,
  getFlaggedCount,
} from '../../domain/reviewEngine';
import type { ReviewCard, SessionMode, ActiveSessionSnapshot } from '../../domain/types';
import { ReviewShell } from '../../shared/layouts/ReviewShell';
import { Button } from '../../shared/components/Button';
import { LoadingSpinner } from '../../shared/components/StateViews';
import { useToast } from '../../context/ToastContext';
import { useSettings } from '../../context/SettingsContext';
import clsx from 'clsx';

type PageStatus = 'loading' | 'resuming' | 'reviewing' | 'completing';

interface ResumePromptProps {
  onResume: () => void;
  onRestart: () => void;
}

function ResumePrompt({ onResume, onRestart }: ResumePromptProps) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-6 text-center">
      <div className="w-14 h-14 rounded-full bg-app-nav/20 flex items-center justify-center text-app-nav">
        <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <div>
        <h2 className="text-xl font-bold text-app-primary mb-2">Resume previous session?</h2>
        <p className="text-sm text-app-secondary">You have an in-progress session for this set.</p>
      </div>
      <div className="flex gap-3">
        <Button onClick={onResume}>Resume</Button>
        <Button variant="secondary" onClick={onRestart}>Start fresh</Button>
      </div>
    </div>
  );
}

// ─── Flip Card ────────────────────────────────────────────────────────────────

interface FlipCardProps {
  question: string;
  answer: string;
  isFlipped: boolean;
  onFlip: () => void;
  animationEnabled: boolean;
}

function FlipCard({ question, answer, isFlipped, onFlip, animationEnabled }: FlipCardProps) {
  return (
    <div
      className="relative w-full flex-1 cursor-pointer select-none"
      style={{ perspective: '1000px', minHeight: '260px', maxHeight: '460px' }}
      onClick={onFlip}
      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onFlip(); } }}
      tabIndex={0}
      role="button"
      aria-label={isFlipped ? 'Card showing answer. Press Enter to flip back.' : 'Card showing question. Press Enter to reveal answer.'}
    >
      <div
        className={clsx(
          'relative w-full h-full',
          animationEnabled && 'transition-transform duration-300 ease-in-out',
        )}
        style={{
          transformStyle: 'preserve-3d',
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          minHeight: '260px',
        }}
      >
        {/* Question face */}
        <div
          className="absolute inset-0 rounded-card bg-app-card-q flex flex-col items-center justify-center p-8 overflow-auto"
          style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
        >
          <p className="text-xl font-medium text-app-primary text-center leading-relaxed max-h-full overflow-y-auto">
            {question}
          </p>
          {!isFlipped && (
            <p className="absolute bottom-4 text-xs text-app-secondary">
              Click or press Space to reveal answer
            </p>
          )}
        </div>

        {/* Answer face */}
        <div
          className="absolute inset-0 rounded-card bg-app-card-a border border-app-secondary/30 flex flex-col items-center justify-center p-8 overflow-auto"
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
        >
          <p className="text-xl font-medium text-app-primary text-center leading-relaxed max-h-full overflow-y-auto">
            {answer}
          </p>
        </div>
      </div>
    </div>
  );
}

interface FilmstripProps {
  cards: ReviewCard[];
  activeIndex: number;
  onSelect: (index: number) => void;
}

const SCRUBBER_BAR_WIDTH = 12;
const SCRUBBER_BAR_HEIGHT = 52;
const SCRUBBER_BAR_GAP = 10;
const SCRUBBER_BAR_STEP = SCRUBBER_BAR_WIDTH + SCRUBBER_BAR_GAP;

function clampIndex(index: number, total: number) {
  return Math.min(Math.max(index, 0), total - 1);
}

function Filmstrip({ cards, activeIndex, onSelect }: FilmstripProps) {
  const dragOffsetRef = useRef(0);
  const dragStartXRef = useRef(0);
  const activeIndexRef = useRef(activeIndex);
  const pointerIdRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const pendingClientXRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const didDragRef = useRef(false);
  const ignoreClickRef = useRef(false);
  const [dragOffset, setDragOffset] = useState(0);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  const updateSelectionFromOffset = useCallback((clientX: number) => {
    const delta = clientX - dragStartXRef.current;
    const stepShift = delta > 0
      ? Math.floor(delta / SCRUBBER_BAR_STEP)
      : Math.ceil(delta / SCRUBBER_BAR_STEP);

    if (stepShift !== 0) {
      const nextIndex = clampIndex(activeIndexRef.current - stepShift, cards.length);
      const appliedShift = activeIndexRef.current - nextIndex;

      if (appliedShift !== 0) {
        activeIndexRef.current = nextIndex;
        dragStartXRef.current += appliedShift * SCRUBBER_BAR_STEP;
        onSelect(nextIndex);
      }
    }

    dragOffsetRef.current = clientX - dragStartXRef.current;
    setDragOffset(dragOffsetRef.current);
  }, [cards.length, onSelect]);

  const flushPendingPointerMove = useCallback(() => {
    if (pendingClientXRef.current === null) return;
    updateSelectionFromOffset(pendingClientXRef.current);
    pendingClientXRef.current = null;
    animationFrameRef.current = null;
  }, [updateSelectionFromOffset]);

  const resetDrag = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    pendingClientXRef.current = null;
    pointerIdRef.current = null;
    isDraggingRef.current = false;
    dragOffsetRef.current = 0;
    setDragOffset(0);
  }, []);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (cards.length <= 1) return;
    pointerIdRef.current = event.pointerId;
    isDraggingRef.current = true;
    didDragRef.current = false;
    ignoreClickRef.current = false;
    pendingClientXRef.current = null;
    dragStartXRef.current = event.clientX;
    dragOffsetRef.current = 0;
    setDragOffset(0);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [cards.length]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || pointerIdRef.current !== event.pointerId) return;
    if (Math.abs(event.clientX - dragStartXRef.current) > 4) {
      didDragRef.current = true;
    }
    pendingClientXRef.current = event.clientX;
    if (animationFrameRef.current === null) {
      animationFrameRef.current = requestAnimationFrame(flushPendingPointerMove);
    }
  }, [flushPendingPointerMove]);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    if (animationFrameRef.current !== null) {
      flushPendingPointerMove();
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    ignoreClickRef.current = didDragRef.current;
    resetDrag();
  }, [flushPendingPointerMove, resetDrag]);

  const handlePointerLeave = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || pointerIdRef.current !== event.pointerId) return;
    if (animationFrameRef.current !== null) {
      flushPendingPointerMove();
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    ignoreClickRef.current = didDragRef.current;
    resetDrag();
  }, [flushPendingPointerMove, resetDrag]);

  useEffect(() => () => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1 text-[11px] uppercase tracking-[0.22em] text-app-secondary/60">
        <span>Scrub</span>
        <span>{activeIndex + 1} / {cards.length}</span>
      </div>

      <div
        className="relative h-20 overflow-hidden rounded-full border border-app-border/60 bg-app-surface/70 px-6"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        style={{ touchAction: 'pan-x' }}
        aria-label="Card scrubber"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.14),_transparent_62%)]" />
        <div className="pointer-events-none absolute inset-y-3 left-1/2 w-px -translate-x-1/2 bg-app-nav/20" />

        <div
          className="absolute left-1/2 top-1/2 flex -translate-y-1/2 items-end"
          style={{
            transform: `translate(${dragOffset - (activeIndex * SCRUBBER_BAR_STEP) - (SCRUBBER_BAR_WIDTH / 2)}px, -50%)`,
            transition: isDraggingRef.current ? 'none' : 'transform 180ms ease-out',
          }}
        >
          {cards.map((card, index) => {
            const distanceFromCenter = Math.abs(index - activeIndex - (dragOffset / SCRUBBER_BAR_STEP));
            const proximity = Math.max(0, 1 - (distanceFromCenter / 6));
            const isActive = distanceFromCenter < 0.35;
            const opacity = 0.08 + (proximity * 0.92);
            const scale = 0.35 + (proximity * 0.65);

            return (
              <button
                key={card.id}
                type="button"
                onClick={() => {
                  if (!isDraggingRef.current) {
                    if (ignoreClickRef.current) {
                      ignoreClickRef.current = false;
                      return;
                    }
                    onSelect(index);
                  }
                }}
                className="relative shrink-0 rounded-full transition-[opacity,transform,background-color,box-shadow] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-nav/50"
                style={{
                  width: `${SCRUBBER_BAR_WIDTH}px`,
                  height: `${SCRUBBER_BAR_HEIGHT}px`,
                  marginRight: index === cards.length - 1 ? 0 : `${SCRUBBER_BAR_GAP}px`,
                  opacity,
                  transform: `scaleY(${scale})`,
                  backgroundColor: isActive ? '#3F51B5' : 'rgba(255, 255, 255, 0.34)',
                  boxShadow: isActive ? '0 0 0 1px rgba(63, 81, 181, 0.55), 0 0 18px rgba(63, 81, 181, 0.28)' : 'none',
                }}
                aria-label={`Go to card ${index + 1}`}
                aria-pressed={index === activeIndex}
              >
                <span className="sr-only">Card {index + 1}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Review Page ──────────────────────────────────────────────────────────────

export function ReviewPage({ mode = 'full', seedCardIds }: { mode?: SessionMode; seedCardIds?: number[] }) {
  const { setId } = useParams<{ setId: string }>();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { settings } = useSettings();
  const id = setId ? parseInt(setId, 10) : NaN;

  const [pageStatus, setPageStatus] = useState<PageStatus>('loading');
  const [pendingSnapshot, setPendingSnapshot] = useState<ActiveSessionSnapshot | null>(null);

  const [state, dispatch] = useReducer(reviewReducer, {
    queue: [],
    currentIndex: 0,
    isFlipped: false,
    outcomes: {},
    flaggedCardIds: [],
    sessionId: null,
    setId: id,
    mode,
    isComplete: false,
    totalCards: 0,
  });

  // Save snapshot periodically and on change
  const saveSnapshot = useCallback(async (s: typeof state) => {
    if (!s.sessionId || s.isComplete) return;
    try {
      await activeSessionRepo.save({
        setId: id,
        sessionId: s.sessionId,
        snapshot: JSON.stringify(toSnapshot(s)),
        savedAt: Date.now(),
      });
    } catch { /* non-critical */ }
  }, [id]);

  // ─── Bootstrap ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (isNaN(id)) return;
    let cancelled = false;

    const init = async () => {
      // Check for active session
      const existing = await activeSessionRepo.getBySetId(id);
      if (existing) {
        try {
          const snapshot: ActiveSessionSnapshot = JSON.parse(existing.snapshot);
          // Validate that cards in snapshot still exist
          const cardIds = snapshot.queue.map((c) => c.id);
          if (cardIds.length > 0) {
            const dbCards = await db.cards.bulkGet(cardIds);
            const allExist = dbCards.every(Boolean);
            if (allExist) {
              if (!cancelled) {
                setPendingSnapshot(snapshot);
                setPageStatus('resuming');
                return;
              }
            }
          }
          // Snapshot corrupt/stale — discard
          await activeSessionRepo.deleteBySetId(id);
        } catch {
          await activeSessionRepo.deleteBySetId(id);
        }
      }
      if (!cancelled) await startFresh();
    };

    init();
    return () => { cancelled = true; };
  }, [id]);

  const startFresh = async () => {
    try {
      let cards: ReviewCard[];

      if (seedCardIds) {
        const fetched = await db.cards.bulkGet(seedCardIds);
        cards = fetched.filter(Boolean).map((c) => ({ id: c!.id!, question: c!.question, answer: c!.answer }));
      } else {
        const dbCards = await db.cards.where('setId').equals(id).toArray();
        cards = dbCards.map((c) => ({ id: c.id!, question: c.question, answer: c.answer }));
      }

      if (cards.length === 0) {
        addToast('No cards available to review', 'error');
        navigate(`/set/${id}`);
        return;
      }

      const sessionId = await sessionRepo.create({
        setId: id,
        startedAt: Date.now(),
        mode,
      });

      const initialState = buildInitialState(cards, sessionId, id, mode, settings.shuffleCards);
      dispatch({ type: 'RESTORE', payload: toSnapshot(initialState) });
      setPageStatus('reviewing');
    } catch {
      addToast('Failed to start review session', 'error');
      navigate(`/set/${id}`);
    }
  };

  const discardPendingSession = useCallback(async () => {
    if (!pendingSnapshot) return;
    await Promise.all([
      activeSessionRepo.deleteBySetId(id),
      sessionRepo.delete(pendingSnapshot.sessionId),
    ]);
    setPendingSnapshot(null);
  }, [id, pendingSnapshot]);

  const handleResume = () => {
    if (!pendingSnapshot) return;
    dispatch({ type: 'RESTORE', payload: pendingSnapshot });
    setPendingSnapshot(null);
    setPageStatus('reviewing');
  };

  // ─── Complete session ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!state.isComplete || !state.sessionId) return;
    let cancelled = false;

    const complete = async () => {
      setPageStatus('completing');
      try {
        const sessionId = state.sessionId!;
        const correct = getCorrectCount(state.outcomes);
        const total = Object.keys(state.outcomes).length;

        // Persist results
        const resultEntries = Object.entries(state.outcomes).map(([cardId, outcome]) => ({
          sessionId,
          cardId: parseInt(cardId, 10),
          outcome,
          timestamp: Date.now(),
        }));
        await resultRepo.bulkCreate(resultEntries);

        // Update stats
        const statsUpdates = Object.entries(state.outcomes).map(([cardId, outcome]) => ({
          cardId: parseInt(cardId, 10),
          outcome,
        }));
        await statsRepo.upsertMany(statsUpdates);

        // Mark session complete
        await sessionRepo.complete(sessionId, total > 0 ? Math.round((correct / total) * 100) : 0);

        // Clear active session
        await activeSessionRepo.deleteBySetId(id);

        if (!cancelled) navigate(`/results/${sessionId}`);
      } catch (err) {
        console.error(err);
        addToast('Error saving session results', 'error');
        navigate(`/set/${id}`);
      }
    };

    complete();
    return () => { cancelled = true; };
  }, [state.isComplete]);

  // Auto-save snapshot on state changes during review
  useEffect(() => {
    if (pageStatus !== 'reviewing') return;
    const timer = setTimeout(() => saveSnapshot(state), 500);
    return () => clearTimeout(timer);
  }, [state, pageStatus, saveSnapshot]);

  // Auto-show answer after configured delay
  useEffect(() => {
    if (pageStatus !== 'reviewing') return;
    if (settings.autoShowAnswer === 0) return;
    if (state.isFlipped) return;
    const timer = setTimeout(
      () => dispatch({ type: 'FLIP' }),
      settings.autoShowAnswer * 1000,
    );
    return () => clearTimeout(timer);
  }, [pageStatus, state.currentIndex, state.isFlipped, settings.autoShowAnswer]);

  const navigateToCard = useCallback((index: number) => {
    dispatch({ type: 'NAVIGATE_TO', payload: index });
  }, []);

  // ─── Keyboard shortcuts ──────────────────────────────────────────────────────

  useEffect(() => {
    if (pageStatus !== 'reviewing') return;
    const handler = (e: KeyboardEvent) => {
      // Don't intercept if user is in an input
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          dispatch({ type: 'FLIP' });
          break;
        case 'ArrowLeft':
          dispatch({ type: 'NAVIGATE_PREV' });
          break;
        case 'ArrowRight':
          dispatch({ type: 'NAVIGATE_NEXT' });
          break;
        case '1':
          if (state.isFlipped) dispatch({ type: 'MARK_INCORRECT' });
          break;
        case '2':
          if (state.isFlipped) dispatch({ type: 'MARK_FLAGGED' });
          break;
        case '3':
          if (state.isFlipped) dispatch({ type: 'MARK_CORRECT' });
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pageStatus, state.isFlipped]);

  // ─── Render ──────────────────────────────────────────────────────────────────

  const currentCard = state.queue[state.currentIndex];
  const answered = Object.keys(state.outcomes).length;
  const correctCount = getCorrectCount(state.outcomes);
  const incorrectCount = getIncorrectCount(state.outcomes);
  const flaggedCount = getFlaggedCount(state.outcomes);
  const currentProgress = state.isComplete
    ? state.totalCards
    : Math.min(answered + 1, state.totalCards);

  if (pageStatus === 'loading' || pageStatus === 'completing') {
    return (
      <ReviewShell exitTo={`/set/${id}`}>
        <LoadingSpinner message={pageStatus === 'completing' ? 'Saving results…' : 'Loading…'} />
      </ReviewShell>
    );
  }

  if (pageStatus === 'resuming') {
    return (
      <ReviewShell exitTo={`/set/${id}`}>
        <ResumePrompt
          onResume={handleResume}
          onRestart={async () => {
            await discardPendingSession();
            await startFresh();
          }}
        />
      </ReviewShell>
    );
  }

  return (
    <ReviewShell
      exitTo={`/set/${id}`}
      progress={{
        current: currentProgress,
        total: state.totalCards,
        correct: correctCount,
        incorrect: incorrectCount,
        flagged: flaggedCount,
      }}
    >
      <div className="flex flex-col flex-1 gap-6" aria-live="polite" aria-atomic="false">
        {currentCard ? (
          <>
            <Filmstrip
              cards={state.queue}
              activeIndex={state.currentIndex}
              onSelect={navigateToCard}
            />

            {/* Card */}
            <FlipCard
              question={currentCard.question}
              answer={currentCard.answer}
              isFlipped={state.isFlipped}
              onFlip={() => dispatch({ type: 'FLIP' })}
              animationEnabled={settings.flipAnimation}
            />

            {/* Actions */}
            <div className="flex items-center justify-center gap-4 pb-4">
              {/* Back arrow */}
              <button
                onClick={() => dispatch({ type: 'NAVIGATE_PREV' })}
                disabled={state.currentIndex === 0}
                className="w-11 h-11 rounded-full bg-app-surface border border-app-border flex items-center justify-center text-app-secondary hover:text-app-primary hover:border-app-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                aria-label="Previous card"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              {/* Outcome buttons — only shown when flipped */}
              <div
                className={clsx(
                  'flex items-center gap-3 transition-all duration-200',
                  state.isFlipped ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none',
                )}
              >
                <button
                  onClick={() => dispatch({ type: 'MARK_INCORRECT' })}
                  className="flex flex-col items-center gap-1 group"
                  aria-label="Mark incorrect (key: 1)"
                >
                  <div className="w-14 h-14 rounded-full bg-app-incorrect/10 border-2 border-app-incorrect/40 flex items-center justify-center text-app-incorrect group-hover:bg-app-incorrect/20 group-hover:border-app-incorrect transition-all active:scale-95">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <span className="text-xs text-app-secondary">Incorrect</span>
                </button>

                <button
                  onClick={() => dispatch({ type: 'MARK_FLAGGED' })}
                  className="flex flex-col items-center gap-1 group"
                  aria-label="Flag for review (key: 2)"
                >
                  <div className="w-12 h-12 rounded-full bg-app-flag/10 border-2 border-app-flag/40 flex items-center justify-center text-app-flag group-hover:bg-app-flag/20 group-hover:border-app-flag transition-all active:scale-95">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2z" />
                    </svg>
                  </div>
                  <span className="text-xs text-app-secondary">Flag</span>
                </button>

                <button
                  onClick={() => dispatch({ type: 'MARK_CORRECT' })}
                  className="flex flex-col items-center gap-1 group"
                  aria-label="Mark correct (key: 3)"
                >
                  <div className="w-14 h-14 rounded-full bg-app-correct/10 border-2 border-app-correct/40 flex items-center justify-center text-app-correct group-hover:bg-app-correct/20 group-hover:border-app-correct transition-all active:scale-95">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-xs text-app-secondary">Correct</span>
                </button>
              </div>

              {/* Forward arrow */}
              <button
                onClick={() => dispatch({ type: 'NAVIGATE_NEXT' })}
                disabled={state.currentIndex >= state.queue.length - 1}
                className="w-11 h-11 rounded-full bg-app-surface border border-app-border flex items-center justify-center text-app-secondary hover:text-app-primary hover:border-app-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                aria-label="Next card"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Keyboard hints */}
            <p className="text-center text-xs text-app-secondary/50">
              Space to flip · ←/→ navigate · 1 incorrect · 2 flag · 3 correct
            </p>
          </>
        ) : null}
      </div>
    </ReviewShell>
  );
}
