import type { ReviewCard } from './types';

export interface MCQOption {
  text: string;
  isCorrect: boolean;
}

export function generateOptions(
  correctCard: ReviewCard,
  pool: ReviewCard[],
  targetCount = 4,
): MCQOption[] {
  const distractors = pool
    .filter((c) => c.id !== correctCard.id)
    .map((c) => c.answer.trim())
    .filter((answer, index, self) => {
      const normalised = answer.toLowerCase();
      const correctNormalised = correctCard.answer.trim().toLowerCase();
      return normalised !== correctNormalised && self.indexOf(answer) === index;
    });

  for (let i = distractors.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [distractors[i], distractors[j]] = [distractors[j], distractors[i]];
  }

  const chosenDistractors = distractors.slice(0, targetCount - 1);

  const options: MCQOption[] = [
    { text: correctCard.answer.trim(), isCorrect: true },
    ...chosenDistractors.map((text) => ({ text, isCorrect: false })),
  ];

  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }

  return options;
}

export function isMCQViable(pool: ReviewCard[]): boolean {
  return pool.length >= 2;
}

export const MCQ_OPTION_LABELS = ['A', 'B', 'C', 'D'] as const;
