import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { StandardShell } from '../../shared/layouts/StandardShell';
import { Button } from '../../shared/components/Button';
import { Field, Textarea } from '../../shared/components/FormField';
import { PageHeader, LoadingSpinner, NotFound } from '../../shared/components/StateViews';
import { useToast } from '../../context/ToastContext';

interface FormValues {
  question: string;
  answer: string;
}

// ─── Create Card ──────────────────────────────────────────────────────────────

export function CreateCardPage() {
  const { setId } = useParams<{ setId: string }>();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const id = setId ? parseInt(setId, 10) : NaN;

  const set = useLiveQuery(() => (isNaN(id) ? undefined : db.sets.get(id)), [id]);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    defaultValues: { question: '', answer: '' },
  });

  const onSubmit = async (data: FormValues, event?: React.BaseSyntheticEvent) => {
    try {
      await db.cards.add({ setId: id, question: data.question.trim(), answer: data.answer.trim(), createdAt: Date.now() });
      addToast('Card added', 'success');
      reset();
      // focus back to question field for quick entry
    } catch {
      addToast('Failed to add card', 'error');
    }
  };

  if (set === undefined) return <StandardShell><LoadingSpinner /></StandardShell>;
  if (set === null || isNaN(id)) return <StandardShell><NotFound message="Set not found" /></StandardShell>;

  return (
    <StandardShell>
      <div className="max-w-lg">
        <PageHeader
          title="Add Card"
          subtitle={`Adding to "${set.title}"`}
          back={{ label: set.title, to: `/set/${set.id}` }}
        />

        <form onSubmit={handleSubmit(onSubmit)} className="bg-app-surface border border-app-border rounded-card p-6 space-y-5">
          <Field label="Question" htmlFor="question" error={errors.question?.message} required>
            <Textarea
              id="question"
              placeholder="Enter the question side of the card"
              rows={3}
              autoFocus
              error={!!errors.question}
              {...register('question', {
                required: 'Question is required',
                validate: (v) => v.trim().length > 0 || 'Question cannot be blank',
              })}
            />
          </Field>

          <Field label="Answer" htmlFor="answer" error={errors.answer?.message} required>
            <Textarea
              id="answer"
              placeholder="Enter the answer side of the card"
              rows={3}
              error={!!errors.answer}
              {...register('answer', {
                required: 'Answer is required',
                validate: (v) => v.trim().length > 0 || 'Answer cannot be blank',
              })}
            />
          </Field>

          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={isSubmitting} fullWidth>
              Add Card
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate(`/set/${id}`)}>
              Done
            </Button>
          </div>
        </form>

        <p className="mt-3 text-xs text-app-secondary text-center">
          After adding, the form resets so you can add another card. Click "Done" when finished.
        </p>
      </div>
    </StandardShell>
  );
}

// ─── Edit Card ────────────────────────────────────────────────────────────────

export function EditCardPage() {
  const { cardId } = useParams<{ cardId: string }>();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const id = cardId ? parseInt(cardId, 10) : NaN;

  const card = useLiveQuery(() => (isNaN(id) ? undefined : db.cards.get(id)), [id]);
  const set = useLiveQuery(
    () => (card?.setId ? db.sets.get(card.setId) : undefined),
    [card?.setId],
  );

  const { register, handleSubmit, formState: { errors, isSubmitting, isDirty } } = useForm<FormValues>({
    values: card ? { question: card.question, answer: card.answer } : { question: '', answer: '' },
  });

  const onSubmit = async (data: FormValues) => {
    try {
      await db.cards.update(id, { question: data.question.trim(), answer: data.answer.trim() });
      addToast('Card updated', 'success');
      navigate(`/set/${card?.setId}`);
    } catch {
      addToast('Failed to update card', 'error');
    }
  };

  if (card === undefined) return <StandardShell><LoadingSpinner /></StandardShell>;
  if (card === null || isNaN(id)) return <StandardShell><NotFound message="Card not found" /></StandardShell>;

  return (
    <StandardShell>
      <div className="max-w-lg">
        <PageHeader
          title="Edit Card"
          subtitle={set ? `In "${set.title}"` : undefined}
          back={{ label: set ? set.title : 'Back', to: `/set/${card.setId}` }}
        />

        <form onSubmit={handleSubmit(onSubmit)} className="bg-app-surface border border-app-border rounded-card p-6 space-y-5">
          <Field label="Question" htmlFor="question" error={errors.question?.message} required>
            <Textarea
              id="question"
              rows={3}
              autoFocus
              error={!!errors.question}
              {...register('question', {
                required: 'Question is required',
                validate: (v) => v.trim().length > 0 || 'Question cannot be blank',
              })}
            />
          </Field>

          <Field label="Answer" htmlFor="answer" error={errors.answer?.message} required>
            <Textarea
              id="answer"
              rows={3}
              error={!!errors.answer}
              {...register('answer', {
                required: 'Answer is required',
                validate: (v) => v.trim().length > 0 || 'Answer cannot be blank',
              })}
            />
          </Field>

          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={isSubmitting} disabled={!isDirty} fullWidth>
              Save Changes
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate(`/set/${card.setId}`)}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </StandardShell>
  );
}
