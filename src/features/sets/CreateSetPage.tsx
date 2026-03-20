import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { StandardShell } from '../../shared/layouts/StandardShell';
import { Button } from '../../shared/components/Button';
import { Field, Input, Textarea } from '../../shared/components/FormField';
import { PageHeader, LoadingSpinner, NotFound } from '../../shared/components/StateViews';
import { useToast } from '../../context/ToastContext';

interface FormValues {
  title: string;
  description: string;
}

export function CreateSetPage() {
  const { packId } = useParams<{ packId: string }>();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const id = packId ? parseInt(packId, 10) : NaN;

  const pack = useLiveQuery(() => (isNaN(id) ? undefined : db.packs.get(id)), [id]);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    defaultValues: { title: '', description: '' },
  });

  const onSubmit = async (data: FormValues) => {
    try {
      const setId = await db.sets.add({
        packId: id,
        title: data.title.trim(),
        description: data.description.trim() || undefined,
        createdAt: Date.now(),
      });
      addToast(`Set "${data.title}" created`, 'success');
      navigate(`/set/${setId}`);
    } catch {
      addToast('Failed to create set', 'error');
    }
  };

  if (pack === undefined) return <StandardShell><LoadingSpinner /></StandardShell>;
  if (pack === null || isNaN(id)) return <StandardShell><NotFound message="Pack not found" /></StandardShell>;

  return (
    <StandardShell>
      <div className="max-w-md">
        <PageHeader
          title="New Set"
          subtitle={`Adding to "${pack.name}"`}
          back={{ label: `Back to ${pack.name}`, to: `/pack/${pack.id}` }}
        />

        <form onSubmit={handleSubmit(onSubmit)} className="bg-app-surface border border-app-border rounded-card p-6 space-y-5">
          <Field label="Set title" htmlFor="title" error={errors.title?.message} required>
            <Input
              id="title"
              placeholder="e.g. Chapter 4 — Cardiology"
              autoFocus
              error={!!errors.title}
              {...register('title', {
                required: 'Set title is required',
                validate: (v) => v.trim().length > 0 || 'Title cannot be blank',
              })}
            />
          </Field>

          <Field label="Description" htmlFor="description" hint="Optional — shown under the set title">
            <Textarea
              id="description"
              placeholder="Brief description of what this set covers"
              rows={3}
              {...register('description')}
            />
          </Field>

          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={isSubmitting} fullWidth>
              Create Set
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate(`/pack/${id}`)}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </StandardShell>
  );
}
