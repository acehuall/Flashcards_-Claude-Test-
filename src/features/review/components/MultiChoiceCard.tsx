import React, { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import type { MCQOption } from '../../../domain/multiChoiceUtils';
import { MCQ_OPTION_LABELS } from '../../../domain/multiChoiceUtils';

interface MultiChoiceCardProps {
  question: string;
  options: MCQOption[];
  onAnswer: (selectedText: string, isCorrect: boolean) => void;
  feedbackDelayMs?: number;
  disabled?: boolean;
}

type SelectionState =
  | { phase: 'idle' }
  | { phase: 'selected'; selectedIndex: number; isCorrect: boolean };

export function MultiChoiceCard({
  question,
  options,
  onAnswer,
  feedbackDelayMs = 800,
  disabled = false,
}: MultiChoiceCardProps) {
  const [selection, setSelection] = useState<SelectionState>({ phase: 'idle' });
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setSelection({ phase: 'idle' });
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [options]);

  const handleSelect = (index: number) => {
    if (disabled || selection.phase !== 'idle') return;
    const option = options[index];
    if (!option) return;

    setSelection({ phase: 'selected', selectedIndex: index, isCorrect: option.isCorrect });

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      onAnswer(option.text, option.isCorrect);
    }, feedbackDelayMs);
  };

  useEffect(() => {
    if (disabled || selection.phase !== 'idle') return;

    const handler = (e: KeyboardEvent) => {
      const index = ['a', 'b', 'c', 'd'].indexOf(e.key.toLowerCase());
      if (index === -1 || index >= options.length) return;
      e.preventDefault();
      handleSelect(index);
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [disabled, selection.phase, options]);

  const correctIndex = options.findIndex((o) => o.isCorrect);

  return (
    <div className="review-card-frame flex flex-col gap-4 mx-auto">
      <div className="rounded-card border border-app-border-strong/90 bg-app-card-q p-8 flex items-center justify-center min-h-[9rem]">
        <p className="text-xl font-medium text-app-primary text-center leading-relaxed">{question}</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((option, index) => {
          const label = MCQ_OPTION_LABELS[index];
          const isSelected = selection.phase === 'selected' && selection.selectedIndex === index;
          const isCorrectOption = index === correctIndex;
          const showResult = selection.phase === 'selected';
          let borderClass = 'border-app-border hover:border-app-border-strong hover:bg-app-surface-2/50';
          let bgClass = 'bg-app-surface';
          let textClass = 'text-app-primary';
          let labelBgClass = 'bg-app-surface-2 text-app-secondary';

          if (showResult) {
            if (isCorrectOption) {
              borderClass = 'border-app-correct/60';
              bgClass = 'bg-app-correct/10';
              labelBgClass = 'bg-app-correct/20 text-app-correct';
            } else if (isSelected && !option.isCorrect) {
              borderClass = 'border-app-incorrect/60';
              bgClass = 'bg-app-incorrect/10';
              labelBgClass = 'bg-app-incorrect/20 text-app-incorrect';
            } else {
              borderClass = 'border-app-border opacity-50';
            }
          }

          return (
            <button key={index} type="button" onClick={() => handleSelect(index)} disabled={disabled || selection.phase !== 'idle'}
              className={clsx('flex items-start gap-3 rounded-card border px-4 py-3 text-left transition-all duration-150', 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-nav-dark focus-visible:ring-offset-2 focus-visible:ring-offset-app-bg', 'disabled:cursor-default', bgClass, borderClass)}
              aria-pressed={isSelected} aria-label={`Option ${label}: ${option.text}`}>
              <span className={clsx('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors', labelBgClass)}>{label}</span>
              <span className={clsx('text-sm leading-relaxed', textClass)}>{option.text}</span>
            </button>
          );
        })}
      </div>
      <p className="text-center text-xs text-app-secondary/50 hidden sm:block">Press A · B · C · D to select</p>
    </div>
  );
}
