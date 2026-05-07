import React from 'react';

interface StudyHeatmapDay {
  dayKey: string;
  fullLabel: string;
  reviewedCount: number;
}

interface StudyHeatmapProps {
  days: StudyHeatmapDay[];
}

function getIntensityClass(reviewedCount: number, maxReviewedCount: number): string {
  if (reviewedCount <= 0 || maxReviewedCount <= 0) {
    return 'bg-app-surface-2';
  }

  const ratio = reviewedCount / maxReviewedCount;
  if (ratio < 0.34) {
    return 'bg-app-nav/30';
  }

  if (ratio < 0.67) {
    return 'bg-app-nav/60';
  }

  return 'bg-app-nav';
}

export function StudyHeatmap({ days }: StudyHeatmapProps) {
  const maxReviewedCount = days.reduce((max, day) => Math.max(max, day.reviewedCount), 0);
  const activeDays = days.filter((day) => day.reviewedCount > 0).length;

  return (
    <section className="rounded-card border border-app-border bg-app-surface p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-app-primary">Study consistency</h2>
          <p className="mt-1 text-xs text-app-secondary">A 28-day view of how often you showed up to study.</p>
        </div>
        <div className="rounded-pill border border-app-border bg-app-surface-2 px-3 py-1 text-xs text-app-secondary">
          {activeDays} active day{activeDays === 1 ? '' : 's'}
        </div>
      </div>

      {days.length === 0 || maxReviewedCount === 0 ? (
        <p className="text-sm text-app-secondary">No study activity in the last 28 days yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-2">
            {days.map((day) => (
              <div
                key={day.dayKey}
                title={`${day.fullLabel}: ${day.reviewedCount} card${day.reviewedCount === 1 ? '' : 's'}`}
                aria-label={`${day.fullLabel}: ${day.reviewedCount} card${day.reviewedCount === 1 ? '' : 's'} reviewed`}
                className={`aspect-square rounded-md border border-app-border/70 ${getIntensityClass(day.reviewedCount, maxReviewedCount)}`}
              />
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-app-secondary">
            <span>{days[0]?.fullLabel}</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <span>Less</span>
              <div className="h-3 w-3 rounded-sm border border-app-border bg-app-surface-2" />
              <div className="h-3 w-3 rounded-sm border border-app-border bg-app-nav/30" />
              <div className="h-3 w-3 rounded-sm border border-app-border bg-app-nav/60" />
              <div className="h-3 w-3 rounded-sm border border-app-border bg-app-nav" />
              <span>More</span>
            </div>
            <span>{days[days.length - 1]?.fullLabel}</span>
          </div>
        </>
      )}
    </section>
  );
}
