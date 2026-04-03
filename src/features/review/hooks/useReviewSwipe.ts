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
type InteractionInputType = 'mouse' | 'touch' | 'pen' | 'unknown';
type TouchOwnership = 'browser' | 'js' | null;

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
  gestureElement: HTMLDivElement | null;
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

function canScrollInGestureDirection(element: HTMLElement | null, deltaY: number, tolerance = 1) {
  if (!element) return false;
  if (element.scrollHeight <= element.clientHeight + tolerance) return false;

  if (deltaY < 0) {
    return element.scrollTop + element.clientHeight < element.scrollHeight - tolerance;
  }

  if (deltaY > 0) {
    return element.scrollTop > tolerance;
  }

  return false;
}

function findClosestWithinBoundary(target: EventTarget | null, boundary: HTMLElement | null, predicate: (node: HTMLElement) => boolean) {
  if (!(target instanceof HTMLElement) || !boundary) return null;
  let node: HTMLElement | null = target;
  while (node && node !== boundary) {
    if (predicate(node)) return node;
    node = node.parentElement;
  }
  if (node === boundary && predicate(node)) return node;
  return null;
}

function didGestureStartInScrollGutter(target: EventTarget | null, boundary: HTMLElement | null) {
  return Boolean(findClosestWithinBoundary(target, boundary, (node) => node.dataset.reviewScrollGutter === 'true'));
}

function findActiveReviewFace(target: EventTarget | null, boundary: HTMLElement | null): 'question' | 'answer' | null {
  const face = findClosestWithinBoundary(target, boundary, (node) => node.dataset.reviewFace === 'question' || node.dataset.reviewFace === 'answer');
  if (!face) return null;
  return face.dataset.reviewFace === 'answer' ? 'answer' : 'question';
}

function findFaceScrollContainer(target: EventTarget | null, boundary: HTMLElement | null) {
  const face = findClosestWithinBoundary(target, boundary, (node) => node.dataset.reviewFace === 'question' || node.dataset.reviewFace === 'answer');
  if (!face) return null;
  return face.querySelector<HTMLElement>('[data-review-card-scroll="true"]');
}

function isScrollContainerAtTop(element: HTMLElement | null, tolerance = 1) {
  if (!element) return true;
  return element.scrollTop <= tolerance;
}

export function useReviewSwipe({
  enabled,
  canSwipe,
  gestureElement,
  onTap,
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
}: UseReviewSwipeOptions) {
  const pointerIdRef = useRef<number | null>(null);
  const touchIdRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const lastXRef = useRef(0);
  const lastYRef = useRef(0);
  const interactionInputRef = useRef<InteractionInputType>('unknown');
  const touchOwnershipRef = useRef<TouchOwnership>(null);
  const touchEligibleForVerticalActionRef = useRef(false);
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
    touchIdRef.current = null;
    intentRef.current = 'idle';
    interactionInputRef.current = 'unknown';
    touchOwnershipRef.current = null;
    touchEligibleForVerticalActionRef.current = false;
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

  const beginInteraction = useCallback((params: {
    clientX: number;
    clientY: number;
    target: EventTarget | null;
    currentTarget: HTMLElement;
    inputType: InteractionInputType;
  }) => {
    const { clientX, clientY, target, currentTarget, inputType } = params;
    if (!enabled || isSwipeCommitRef.current) return;

    startXRef.current = clientX;
    startYRef.current = clientY;
    lastXRef.current = clientX;
    lastYRef.current = clientY;
    interactionInputRef.current = inputType;
    touchOwnershipRef.current = inputType === 'touch' ? 'js' : null;
    intentRef.current = 'idle';
    movedPastTapSlopRef.current = false;
    startTargetRef.current = target;
    containerWidthRef.current = currentTarget.getBoundingClientRect().width;
    suppressClickRef.current = false;

    setState({
      offset: { x: 0, y: 0 },
      isDragging: false,
      isAnimating: false,
      swipeAxis: null,
      cancelClick: false,
    });
  }, [enabled]);

  const moveInteraction = useCallback((params: {
    clientX: number;
    clientY: number;
    currentTarget: HTMLElement;
  }) => {
    const { clientX, clientY, currentTarget } = params;
    if (!enabled || isSwipeCommitRef.current) return;

    lastXRef.current = clientX;
    lastYRef.current = clientY;

    const deltaX = clientX - startXRef.current;
    const deltaY = clientY - startYRef.current;
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

      const scrollableAncestor = findScrollableAncestor(startTargetRef.current, currentTarget);
      const horizontalIntent = absX > absY * 1.15;
      const upwardIntent = deltaY < 0 && absY > absX * 1.15;

      if (canSwipe && horizontalIntent) {
        intentRef.current = 'horizontal';
      } else if (canSwipe && upwardIntent && !canScrollInGestureDirection(scrollableAncestor, deltaY)) {
        if (interactionInputRef.current === 'touch' && !touchEligibleForVerticalActionRef.current) {
          intentRef.current = 'scroll';
          return;
        }
        intentRef.current = 'vertical';
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

  const endInteraction = useCallback(() => {
    if (!enabled || isSwipeCommitRef.current) return;

    const deltaX = lastXRef.current - startXRef.current;
    const deltaY = lastYRef.current - startYRef.current;
    const intent = intentRef.current;

    pointerIdRef.current = null;
    touchIdRef.current = null;
    startTargetRef.current = null;
    intentRef.current = 'idle';
    interactionInputRef.current = 'unknown';
    touchOwnershipRef.current = null;
    touchEligibleForVerticalActionRef.current = false;

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
  }, [animateSwipeOut, animateToRest, canSwipe, enabled, onSwipeLeft, onSwipeRight, onSwipeUp, onTap, reset]);

  const cancelInteraction = useCallback(() => {
    if (isSwipeCommitRef.current) return;
    suppressClickRef.current = true;
    reset();
  }, [reset]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!enabled || !event.isPrimary || isSwipeCommitRef.current) return;
    if (event.pointerType === 'touch') return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    pointerIdRef.current = event.pointerId;
    touchIdRef.current = null;
    beginInteraction({
      clientX: event.clientX,
      clientY: event.clientY,
      target: event.target,
      currentTarget: event.currentTarget,
      inputType: event.pointerType === 'mouse' || event.pointerType === 'pen'
        ? event.pointerType
        : 'unknown',
    });
  }, [beginInteraction, enabled]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    const previousIntent = intentRef.current;

    moveInteraction({
      clientX: event.clientX,
      clientY: event.clientY,
      currentTarget: event.currentTarget,
    });

    const currentIntent = intentRef.current;
    if (
      (previousIntent === 'idle' || previousIntent === 'scroll')
      && (currentIntent === 'horizontal' || currentIntent === 'vertical')
      && !event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }, [moveInteraction]);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    endInteraction();
  }, [endInteraction]);

  const handlePointerCancel = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    cancelInteraction();
  }, [cancelInteraction]);

  const handleTouchStart = useCallback((_event: React.TouchEvent<HTMLElement>) => {
    if (!enabled) return;
  }, [enabled]);

  const handleTouchMove = useCallback((event: React.TouchEvent<HTMLElement>) => {
    if (touchIdRef.current === null) return;
    const touch = Array.from(event.changedTouches).find((entry) => entry.identifier === touchIdRef.current);
    if (!touch) return;

    moveInteraction({
      clientX: touch.clientX,
      clientY: touch.clientY,
      currentTarget: event.currentTarget,
    });

    if (touchOwnershipRef.current === 'js' && (intentRef.current === 'horizontal' || intentRef.current === 'vertical')) {
      event.preventDefault();
    }
  }, [moveInteraction]);

  const handleTouchEnd = useCallback((event: React.TouchEvent<HTMLElement>) => {
    if (touchIdRef.current === null) return;
    const touch = Array.from(event.changedTouches).find((entry) => entry.identifier === touchIdRef.current);
    if (!touch) return;

    lastXRef.current = touch.clientX;
    lastYRef.current = touch.clientY;
    endInteraction();
  }, [endInteraction]);

  const handleTouchCancel = useCallback((event: React.TouchEvent<HTMLElement>) => {
    if (touchIdRef.current === null) return;
    const touch = Array.from(event.changedTouches).find((entry) => entry.identifier === touchIdRef.current);
    if (!touch) return;
    cancelInteraction();
  }, [cancelInteraction]);

  useEffect(() => {
    if (!gestureElement) return;

    const handleNativeTouchStart = (event: TouchEvent) => {
      if (!enabled || isSwipeCommitRef.current || pointerIdRef.current !== null || touchIdRef.current !== null) return;
      const touch = event.changedTouches[0];
      if (!touch) return;

      const activeFace = findActiveReviewFace(event.target, gestureElement);
      if (activeFace !== 'answer') {
        touchOwnershipRef.current = 'browser';
        touchEligibleForVerticalActionRef.current = false;
        return;
      }

      const startedInGutter = didGestureStartInScrollGutter(event.target, gestureElement);
      const scrollContainer = findFaceScrollContainer(event.target, gestureElement);
      const isAtTop = isScrollContainerAtTop(scrollContainer, 1);
      const shouldJsOwnTouch = canSwipe && !startedInGutter && isAtTop;

      touchOwnershipRef.current = shouldJsOwnTouch ? 'js' : 'browser';
      touchEligibleForVerticalActionRef.current = shouldJsOwnTouch;

      if (!shouldJsOwnTouch) return;

      event.preventDefault();
      touchIdRef.current = touch.identifier;
      beginInteraction({
        clientX: touch.clientX,
        clientY: touch.clientY,
        target: event.target,
        currentTarget: gestureElement,
        inputType: 'touch',
      });
    };

    gestureElement.addEventListener('touchstart', handleNativeTouchStart, { passive: false });
    return () => {
      gestureElement.removeEventListener('touchstart', handleNativeTouchStart);
    };
  }, [beginInteraction, canSwipe, enabled, gestureElement]);

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
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
    handleClick,
    reset,
  };
}
