import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';

const TAP_SLOP = 8;
const INTENT_LOCK_DISTANCE = 16;
const HORIZONTAL_SWIPE_THRESHOLD = 72;
const VERTICAL_SWIPE_THRESHOLD = 64;
const MAX_DRAG_X = 132;
const MAX_DRAG_Y = 112;
const SWIPE_OUT_DURATION_MS = 180;
const SETTLE_DURATION_MS = 180;

type GestureIntent = 'idle' | 'horizontal' | 'vertical' | 'scroll';
export type SwipeAxis = 'horizontal' | 'vertical';

export interface ReviewSwipeState {
  offset: { x: number; y: number };
  isDragging: boolean;
  isAnimating: boolean;
  swipeAxis: SwipeAxis | null;
  cancelClick: boolean;
}

interface UseReviewSwipeOptions {
  enabled: boolean;
  canSwipe: boolean;
  onTap: () => void;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onSwipeUp: () => void;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function findScrollableAncestor(target: EventTarget | null, boundary: HTMLElement | null) {
  if (!(target instanceof HTMLElement) || !boundary) return null;

  let node: HTMLElement | null = target;
  while (node && node !== boundary) {
    if (node.dataset.reviewCardScroll === 'true') {
      return node;
    }
    node = node.parentElement;
  }

  return null;
}

function canScrollInGestureDirection(element: HTMLElement | null, deltaY: number) {
  if (!element) return false;
  if (element.scrollHeight <= element.clientHeight + 1) return false;

  if (deltaY < 0) {
    return element.scrollTop + element.clientHeight < element.scrollHeight - 1;
  }

  if (deltaY > 0) {
    return element.scrollTop > 0;
  }

  return false;
}

export function useReviewSwipe({
  enabled,
  canSwipe,
  onTap,
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
}: UseReviewSwipeOptions) {
  const pointerIdRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const intentRef = useRef<GestureIntent>('idle');
  const movedPastTapSlopRef = useRef(false);
  const startTargetRef = useRef<EventTarget | null>(null);
  const containerWidthRef = useRef(0);
  const animationTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const isSwipeCommitRef = useRef(false);
  const [state, setState] = useState<ReviewSwipeState>({
    offset: { x: 0, y: 0 },
    isDragging: false,
    isAnimating: false,
    swipeAxis: null,
    cancelClick: false,
  });

  const clearAnimationTimer = useCallback(() => {
    if (animationTimerRef.current !== null) {
      window.clearTimeout(animationTimerRef.current);
      animationTimerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearAnimationTimer();
    pointerIdRef.current = null;
    intentRef.current = 'idle';
    movedPastTapSlopRef.current = false;
    startTargetRef.current = null;
    containerWidthRef.current = 0;
    isSwipeCommitRef.current = false;
    setState({
      offset: { x: 0, y: 0 },
      isDragging: false,
      isAnimating: false,
      swipeAxis: null,
      cancelClick: false,
    });
  }, [clearAnimationTimer]);

  useEffect(() => reset, [reset]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!enabled || !event.isPrimary || event.button !== 0 || isSwipeCommitRef.current) return;

    pointerIdRef.current = event.pointerId;
    startXRef.current = event.clientX;
    startYRef.current = event.clientY;
    intentRef.current = 'idle';
    movedPastTapSlopRef.current = false;
    startTargetRef.current = event.target;
    containerWidthRef.current = event.currentTarget.getBoundingClientRect().width;
    suppressClickRef.current = false;

    setState({
      offset: { x: 0, y: 0 },
      isDragging: false,
      isAnimating: false,
      swipeAxis: null,
      cancelClick: false,
    });
  }, [enabled]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!enabled || pointerIdRef.current !== event.pointerId || isSwipeCommitRef.current) return;

    const deltaX = event.clientX - startXRef.current;
    const deltaY = event.clientY - startYRef.current;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (!movedPastTapSlopRef.current && (absX > TAP_SLOP || absY > TAP_SLOP)) {
      movedPastTapSlopRef.current = true;
      setState((previous) => ({ ...previous, cancelClick: true }));
    }

    if (intentRef.current === 'scroll') {
      return;
    }

    if (intentRef.current === 'idle') {
      if (absX < INTENT_LOCK_DISTANCE && absY < INTENT_LOCK_DISTANCE) {
        return;
      }

      const scrollableAncestor = findScrollableAncestor(startTargetRef.current, event.currentTarget);
      const horizontalIntent = absX > absY * 1.15;
      const upwardIntent = deltaY < 0 && absY > absX * 1.15;

      if (canSwipe && horizontalIntent) {
        intentRef.current = 'horizontal';
        event.currentTarget.setPointerCapture(event.pointerId);
      } else if (canSwipe && upwardIntent && !canScrollInGestureDirection(scrollableAncestor, deltaY)) {
        intentRef.current = 'vertical';
        event.currentTarget.setPointerCapture(event.pointerId);
      } else {
        intentRef.current = 'scroll';
        return;
      }
    }

    if (intentRef.current === 'horizontal') {
      setState({
        offset: { x: clamp(deltaX, -MAX_DRAG_X, MAX_DRAG_X), y: clamp(deltaY * 0.18, -24, 24) },
        isDragging: true,
        isAnimating: false,
        swipeAxis: 'horizontal',
        cancelClick: true,
      });
      return;
    }

    if (intentRef.current === 'vertical') {
      setState({
        offset: { x: clamp(deltaX * 0.12, -18, 18), y: clamp(Math.min(deltaY, 0), -MAX_DRAG_Y, 0) },
        isDragging: true,
        isAnimating: false,
        swipeAxis: 'vertical',
        cancelClick: true,
      });
    }
  }, [canSwipe, enabled]);

  const animateToRest = useCallback(() => {
    setState((previous) => ({
      ...previous,
      offset: { x: 0, y: 0 },
      isDragging: false,
      isAnimating: true,
      swipeAxis: previous.swipeAxis,
      cancelClick: previous.cancelClick,
    }));

    clearAnimationTimer();
    animationTimerRef.current = window.setTimeout(() => {
      setState((previous) => ({
        ...previous,
        isAnimating: false,
        swipeAxis: null,
        cancelClick: false,
      }));
    }, SETTLE_DURATION_MS);
  }, [clearAnimationTimer]);

  const animateSwipeOut = useCallback((axis: SwipeAxis, deltaX: number, deltaY: number, onComplete: () => void) => {
    const distance = Math.max(containerWidthRef.current || 0, 240);
    isSwipeCommitRef.current = true;

    setState({
      offset: axis === 'horizontal'
        ? { x: deltaX > 0 ? distance : -distance, y: clamp(deltaY * 0.2, -40, 40) }
        : { x: clamp(deltaX * 0.12, -24, 24), y: -distance },
      isDragging: false,
      isAnimating: true,
      swipeAxis: axis,
      cancelClick: true,
    });

    clearAnimationTimer();
    animationTimerRef.current = window.setTimeout(() => {
      onComplete();
      reset();
    }, SWIPE_OUT_DURATION_MS);
  }, [clearAnimationTimer, reset]);

  const releaseCaptureIfNeeded = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const finishInteraction = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!enabled || pointerIdRef.current !== event.pointerId || isSwipeCommitRef.current) return;

    const deltaX = event.clientX - startXRef.current;
    const deltaY = event.clientY - startYRef.current;
    const intent = intentRef.current;

    releaseCaptureIfNeeded(event);
    pointerIdRef.current = null;
    startTargetRef.current = null;
    intentRef.current = 'idle';

    if (intent === 'horizontal' && canSwipe) {
      if (deltaX >= HORIZONTAL_SWIPE_THRESHOLD) {
        animateSwipeOut('horizontal', deltaX, deltaY, onSwipeRight);
        return;
      }

      if (deltaX <= -HORIZONTAL_SWIPE_THRESHOLD) {
        animateSwipeOut('horizontal', deltaX, deltaY, onSwipeLeft);
        return;
      }

      animateToRest();
      return;
    }

    if (intent === 'vertical' && canSwipe) {
      if (deltaY <= -VERTICAL_SWIPE_THRESHOLD) {
        animateSwipeOut('vertical', deltaX, deltaY, onSwipeUp);
        return;
      }

      animateToRest();
      return;
    }

    if (!movedPastTapSlopRef.current) {
      suppressClickRef.current = true;
      onTap();
      reset();
      return;
    }

    suppressClickRef.current = true;
    reset();
  }, [animateSwipeOut, animateToRest, canSwipe, enabled, onSwipeLeft, onSwipeRight, onSwipeUp, onTap, releaseCaptureIfNeeded, reset]);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLElement>) => {
    finishInteraction(event);
  }, [finishInteraction]);

  const handlePointerCancel = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (pointerIdRef.current !== event.pointerId || isSwipeCommitRef.current) return;
    suppressClickRef.current = true;
    releaseCaptureIfNeeded(event);
    reset();
  }, [releaseCaptureIfNeeded, reset]);

  const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (isSwipeCommitRef.current || suppressClickRef.current) {
      suppressClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (state.cancelClick) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    onTap();
  }, [onTap, state.cancelClick]);

  return {
    dragOffset: state.offset,
    isDragging: state.isDragging,
    isAnimating: state.isAnimating,
    swipeAxis: state.swipeAxis,
    shouldCancelClick: state.cancelClick,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleClick,
    reset,
  };
}
