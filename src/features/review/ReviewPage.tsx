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
import type { ReviewCard, SessionMode, ActiveSessionSnapshot, Outcome } from '../../domain/types';
import { ReviewShell } from '../../shared/layouts/ReviewShell';
import { Button } from '../../shared/components/Button';
import { LoadingSpinner } from '../../shared/components/StateViews';
import { useToast } from '../../context/ToastContext';
import { useSettings } from '../../context/SettingsContext';
import clsx from 'clsx';
import { useReviewSwipe } from './hooks/useReviewSwipe';

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
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLDivElement>) => void;
  onTouchStart: (event: React.TouchEvent<HTMLDivElement>) => void;
  onTouchMove: (event: React.TouchEvent<HTMLDivElement>) => void;
  onTouchEnd: (event: React.TouchEvent<HTMLDivElement>) => void;
  onTouchCancel: (event: React.TouchEvent<HTMLDivElement>) => void;
  onClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  swipeOffset: { x: number; y: number };
  swipeActive: boolean;
  swipeAnimating: boolean;
  swipeDirection: 'horizontal' | 'vertical' | null;
  swipeEnabled: boolean;
  canSwipe: boolean;
}

function FlipCard({
  question,
  answer,
  isFlipped,
  onFlip,
  animationEnabled,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onTouchCancel,
  onClick,
  swipeOffset,
  swipeActive,
  swipeAnimating,
  swipeDirection,
  swipeEnabled,
  canSwipe
}: FlipCardProps) {
  const swipeFeedbackOpacity = swipeDirection === 'horizontal'
    ? Math.min(Math.abs(swipeOffset.x) / 56, 1)
    : swipeOffset.y < 0
      ? Math.min(Math.abs(swipeOffset.y) / 52, 1)
      : 0;

  return (
    <div className="review-card-frame review-card-settle">
      <div
        className="review-card-gesture review-card-shell relative w-full h-full cursor-pointer select-none"
        style={{
          perspective: '1000px',
          touchAction: swipeEnabled && canSwipe ? 'pan-y pinch-zoom' : 'auto',
          transform: `translate3d(${swipeOffset.x}px, ${swipeOffset.y}px, 0) rotate(${swipeOffset.x * 0.045}deg)`,
          transition: swipeActive ? 'none' : swipeAnimating ? 'transform 180ms ease-out' : undefined,
        }}
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            onFlip();
          }
        }}
        tabIndex={0}
        role="button"
        aria-label={isFlipped ? 'Card showing answer. Press Enter to flip back.' : 'Card showing question. Press Enter to reveal answer.'}
      >
      {canSwipe && swipeDirection && (
        <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden rounded-card">
          <div
            className={clsx(
              'absolute inset-0 transition-opacity duration-150',
              swipeDirection === 'horizontal'
                ? swipeOffset.x >= 0
                  ? 'bg-app-correct/30'
                  : 'bg-app-incorrect/30'
                : 'bg-app-flag/28',
            )}
            style={{ opacity: swipeFeedbackOpacity }}
          />

          <div className="pointer-events-none absolute inset-x-4 top-4 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.24em] text-app-secondary/80">
            <span className={clsx('transition-opacity duration-150', swipeOffset.x > 12 ? 'opacity-100' : 'opacity-0')}>Correct</span>
            <span className={clsx('transition-opacity duration-150', swipeOffset.x < -12 ? 'opacity-100' : 'opacity-0')}>Incorrect</span>
          </div>

          <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center text-[11px] font-semibold uppercase tracking-[0.24em] text-app-secondary/80">
            <span className={clsx('transition-opacity duration-150', swipeOffset.y < -12 ? 'opacity-100' : 'opacity-0')}>Flag</span>
          </div>
        </div>
      )}

      <div
        className={clsx(
          'review-card-flipper relative z-10',
          animationEnabled && 'transition-transform duration-300 ease-in-out',
        )}
        style={{
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        <div
          className="review-card-face review-card-face--question rounded-card bg-app-card-q p-8"
        >
          <div className="review-card-face-content">
            <div className="review-card-scrollable review-card-scroll-region" data-review-card-scroll="true">
              <div className="review-card-face-center">
                <p className="text-xl font-medium text-app-primary text-center leading-relaxed">
                  {question}
                </p>
              </div>
            </div>
            <div className="review-card-hint pointer-events-none" aria-hidden="true">
              {!isFlipped && (
                <p className="text-xs text-app-secondary">
                  Tap or press Space to reveal answer
                </p>
              )}
            </div>
          </div>
        </div>

        <div
          className="review-card-face review-card-face--answer review-card-face--back rounded-card bg-app-card-a p-8"
        >
          <div className="review-card-face-content">
            <div className="review-card-scrollable review-card-scroll-region" data-review-card-scroll="true">
              <div className="review-card-face-center">
                <p className="text-xl font-medium text-app-primary text-center leading-relaxed">
                  {answer}
                </p>
              </div>
            </div>
            <div className="review-card-hint pointer-events-none" aria-hidden="true">
              <p className="invisible text-xs">Tap or press Space to reveal answer</p>
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}

interface FilmstripProps {
  cards: ReviewCard[];
  activeIndex: number;
  outcomes: Record<number, Outcome>;
  onSelect: (index: number) => void;
}

const SCRUBBER_BAR_WIDTH = 12;
const SCRUBBER_BAR_HEIGHT = 52;
const SCRUBBER_BAR_GAP = 10;

function Filmstrip({ cards, activeIndex, outcomes, onSelect }: FilmstripProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const barRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndexRef = useRef(activeIndex);
  const [edgeSpacerWidth, setEdgeSpacerWidth] = useState(0);
  const rafRef = useRef<number | null>(null);
  const isProgrammaticScrollRef = useRef(false);
  const scrollTargetLeftRef = useRef<number | null>(null);
  const programmaticResetTimeoutRef = useRef<number | null>(null);
  const skipNextCenteringRef = useRef(false);
  const hasInitialCenteringRef = useRef(false);
  const hasMeasuredSpacerRef = useRef(false);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  const selectClosestToCenter = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || cards.length === 0) return;

    const viewportRect = viewport.getBoundingClientRect();
    const centerX = viewportRect.left + (viewportRect.width / 2);

    let closestIndex = activeIndexRef.current;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < cards.length; index += 1) {
      const bar = barRefs.current[index];
      if (!bar) continue;
      const rect = bar.getBoundingClientRect();
      const barCenterX = rect.left + (rect.width / 2);
      const distance = Math.abs(barCenterX - centerX);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    }

    if (closestIndex !== activeIndexRef.current) {
      activeIndexRef.current = closestIndex;
      skipNextCenteringRef.current = true;
      onSelect(closestIndex);
    }
  }, [cards.length, onSelect]);

  const scheduleSelectionSync = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (isProgrammaticScrollRef.current) return;
      selectClosestToCenter();
    });
  }, [selectClosestToCenter]);

  const centerIndex = useCallback((index: number, behavior: ScrollBehavior) => {
    const viewport = viewportRef.current;
    const bar = barRefs.current[index];
    if (!viewport || !bar) return;

    const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const targetLeft = Math.min(Math.max(0, bar.offsetLeft - ((viewport.clientWidth - bar.offsetWidth) / 2)), maxScrollLeft);
    const needsScroll = Math.abs(viewport.scrollLeft - targetLeft) > 1;
    if (!needsScroll) return;

    isProgrammaticScrollRef.current = true;
    scrollTargetLeftRef.current = targetLeft;
    if (programmaticResetTimeoutRef.current !== null) {
      window.clearTimeout(programmaticResetTimeoutRef.current);
    }
    programmaticResetTimeoutRef.current = window.setTimeout(() => {
      isProgrammaticScrollRef.current = false;
      scrollTargetLeftRef.current = null;
      programmaticResetTimeoutRef.current = null;
    }, 800);
    viewport.scrollTo({ left: targetLeft, behavior });
  }, []);

  useEffect(() => {
    barRefs.current.length = cards.length;
  }, [cards.length]);

  useEffect(() => {
    if (!hasMeasuredSpacerRef.current) return;

    if (!hasInitialCenteringRef.current) {
      hasInitialCenteringRef.current = true;
      centerIndex(activeIndex, 'auto');
      return;
    }

    if (skipNextCenteringRef.current) {
      skipNextCenteringRef.current = false;
      return;
    }

    centerIndex(activeIndex, 'smooth');
  }, [activeIndex, cards.length, centerIndex, edgeSpacerWidth]);

  useEffect(() => () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }
    if (programmaticResetTimeoutRef.current !== null) {
      window.clearTimeout(programmaticResetTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const updateEdgeSpacer = () => {
      const nextWidth = Math.max(0, (viewport.clientWidth / 2) - (SCRUBBER_BAR_WIDTH / 2));
      hasMeasuredSpacerRef.current = true;
      setEdgeSpacerWidth((prev) => (Math.abs(prev - nextWidth) < 0.5 ? prev : nextWidth));
    };

    updateEdgeSpacer();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateEdgeSpacer);
      return () => window.removeEventListener('resize', updateEdgeSpacer);
    }

    const resizeObserver = new ResizeObserver(updateEdgeSpacer);
    resizeObserver.observe(viewport);
    return () => resizeObserver.disconnect();
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1 text-[11px] uppercase tracking-[0.22em] text-app-secondary/60">
        <span>Scrub</span>
        <span>{activeIndex + 1} / {cards.length}</span>
      </div>

      <div className="relative h-20 overflow-hidden rounded-full bg-app-surface border border-app-border" aria-label="Card scrubber">


        <div
          ref={viewportRef}
          className="h-full overflow-x-auto overflow-y-hidden"
          onScroll={() => {
            if (isProgrammaticScrollRef.current) {
              const viewport = viewportRef.current;
              const targetLeft = scrollTargetLeftRef.current;
              if (viewport && targetLeft !== null && Math.abs(viewport.scrollLeft - targetLeft) <= 1) {
                isProgrammaticScrollRef.current = false;
                scrollTargetLeftRef.current = null;
                if (programmaticResetTimeoutRef.current !== null) {
                  window.clearTimeout(programmaticResetTimeoutRef.current);
                  programmaticResetTimeoutRef.current = null;
                }
              }
              return;
            }
            scheduleSelectionSync();
          }}
          onWheel={(event) => {
            if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
            const viewport = viewportRef.current;
            if (!viewport) return;
            event.preventDefault();
            viewport.scrollLeft += event.deltaY;
          }}
          style={{
            touchAction: 'pan-x',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          <div className="inline-flex h-full items-center min-w-max">
            <div aria-hidden="true" className="shrink-0" style={{ width: `${edgeSpacerWidth}px` }} />
            {cards.map((card, index) => {
              const distanceFromCenter = Math.abs(index - activeIndex);
              const proximity = Math.max(0, 1 - (distanceFromCenter / 6));
              const isActive = index === activeIndex;
              const opacity = 0.08 + (proximity * 0.92);
              const scale = 0.35 + (proximity * 0.65);
              const outcome = outcomes[card.id];
              const backgroundColor = isActive
                ? 'rgb(var(--app-nav))'
                : outcome === 'correct'
                  ? 'rgb(var(--app-correct))'
                  : outcome === 'incorrect'
                    ? 'rgb(var(--app-incorrect))'
                    : outcome === 'flagged'
                      ? 'rgb(var(--app-flag))'
                      : 'rgb(var(--app-border) / 0.85)';

              return (
                <button
                  key={card.id}
                  ref={(node) => { barRefs.current[index] = node; }}
                  type="button"
                  onClick={() => onSelect(index)}
                  className="relative shrink-0 rounded-full transition-[opacity,transform,background-color] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-nav/50"
                  style={{
                    width: `${SCRUBBER_BAR_WIDTH}px`,
                    height: `${SCRUBBER_BAR_HEIGHT}px`,
                    marginRight: index === cards.length - 1 ? 0 : `${SCRUBBER_BAR_GAP}px`,
                    opacity,
                    transform: `scaleY(${scale})`,
                    backgroundColor,
                  }}
                  aria-label={`Go to card ${index + 1}`}
                  aria-pressed={index === activeIndex}
                >
                  <span className="sr-only">Card {index + 1}</span>
                </button>
              );
            })}
            <div aria-hidden="true" className="shrink-0" style={{ width: `${edgeSpacerWidth}px` }} />
          </div>
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

  const currentCard = state.queue[state.currentIndex];
  const currentCardAnswered = currentCard ? Boolean(state.outcomes[currentCard.id]) : false;

  const swipeHandlers = useReviewSwipe({
    enabled: settings.swipeGestures,
    canSwipe: Boolean(state.isFlipped && currentCard && !currentCardAnswered),
    onTap: () => dispatch({ type: 'FLIP' }),
    onSwipeLeft: () => dispatch({ type: 'MARK_INCORRECT' }),
    onSwipeRight: () => dispatch({ type: 'MARK_CORRECT' }),
    onSwipeUp: () => dispatch({ type: 'MARK_FLAGGED' }),
  });

  const resetSwipeGesture = swipeHandlers.reset;

  useEffect(() => {
    resetSwipeGesture();
  }, [resetSwipeGesture, state.currentIndex, state.isFlipped]);

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

  const answered = Object.keys(state.outcomes).length;
  const correctCount = getCorrectCount(state.outcomes);
  const incorrectCount = getIncorrectCount(state.outcomes);
  const flaggedCount = getFlaggedCount(state.outcomes);
  const currentProgress = answered;

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
              outcomes={state.outcomes}
              onSelect={navigateToCard}
            />

            {/* Card */}
            <div className="flex w-full justify-center">
              <FlipCard
                key={currentCard.id}
                question={currentCard.question}
                answer={currentCard.answer}
                isFlipped={state.isFlipped}
                onFlip={() => dispatch({ type: 'FLIP' })}
                animationEnabled={settings.flipAnimation}
                onPointerDown={swipeHandlers.handlePointerDown}
                onPointerMove={swipeHandlers.handlePointerMove}
                onPointerUp={swipeHandlers.handlePointerUp}
                onPointerCancel={swipeHandlers.handlePointerCancel}
                onTouchStart={swipeHandlers.handleTouchStart}
                onTouchMove={swipeHandlers.handleTouchMove}
                onTouchEnd={swipeHandlers.handleTouchEnd}
                onTouchCancel={swipeHandlers.handleTouchCancel}
                onClick={swipeHandlers.handleClick}
                swipeOffset={swipeHandlers.dragOffset}
                swipeActive={swipeHandlers.isDragging}
                swipeAnimating={swipeHandlers.isAnimating}
                swipeDirection={swipeHandlers.swipeAxis}
                swipeEnabled={settings.swipeGestures}
                canSwipe={Boolean(state.isFlipped && currentCard && !currentCardAnswered)}
              />
            </div>

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
            <p className="hidden text-center text-xs text-app-secondary/50 sm:block">
              Space to flip · ←/→ navigate · 1 incorrect · 2 flag · 3 correct
            </p>
            <p className="text-center text-xs text-app-secondary/50 sm:hidden">
              Tap to flip · Swipe right correct · left incorrect · flag with button
            </p>
          </>
        ) : null}
      </div>
    </ReviewShell>
  );
}
