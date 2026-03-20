import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { db } from '../../db';
import { StandardShell } from '../../shared/layouts/StandardShell';
import { Button } from '../../shared/components/Button';
import { Field, Input } from '../../shared/components/FormField';
import { PageHeader } from '../../shared/components/StateViews';
import { PACK_COLORS } from '../../shared/components/PackColors';
import { useToast } from '../../context/ToastContext';
import clsx from 'clsx';

interface FormValues {
  name: string;
  color: string;
}

export function CreatePackPage() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormValues>({
    defaultValues: { name: '', color: PACK_COLORS[0] },
  });

  const selectedColor = watch('color');

  const onSubmit = async (data: FormValues) => {
    try {
      const id = await db.packs.add({ name: data.name.trim(), color: data.color, createdAt: Date.now() });
      addToast(`Pack "${data.name}" created`, 'success');
      navigate(`/pack/${id}`);
    } catch {
      addToast('Failed to create pack', 'error');
    }
  };

  return (
    <StandardShell>
      <div className="max-w-md">
        <PageHeader
          title="New Pack"
          subtitle="Packs are top-level groupings like a subject or course."
          back={{ label: 'Back to packs', to: '/' }}
        />

        <form onSubmit={handleSubmit(onSubmit)} className="bg-app-surface border border-app-border rounded-card p-6 space-y-6">
          <Field
            label="Pack name"
            htmlFor="name"
            error={errors.name?.message}
            required
          >
            <Input
              id="name"
              placeholder="e.g. Medical School, Coding, Geography"
              autoFocus
              error={!!errors.name}
              {...register('name', {
                required: 'Pack name is required',
                validate: (v) => v.trim().length > 0 || 'Pack name cannot be blank',
              })}
            />
          </Field>

          <div>
            <p className="text-sm font-medium text-app-primary mb-3">Colour</p>
            <div className="flex flex-wrap gap-2.5">
              {PACK_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setValue('color', color)}
                  className={clsx(
                    'w-8 h-8 rounded-full transition-all duration-150 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-app-surface outline-none',
                    selectedColor === color
                      ? 'ring-2 ring-white ring-offset-2 ring-offset-app-surface scale-110'
                      : 'hover:scale-105',
                  )}
                  style={{ backgroundColor: color }}
                  aria-label={`Select colour ${color}`}
                  aria-pressed={selectedColor === color}
                />
              ))}
            </div>
          </div>

          {/* Hidden input for color */}
          <input type="hidden" {...register('color')} />

          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={isSubmitting} fullWidth>
              Create Pack
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate('/')}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </StandardShell>
  );
}
