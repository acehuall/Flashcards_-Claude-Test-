import React from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface AccuracyTrendPoint {
  label: string;
  fullLabel: string;
  accuracy: number;
  reviewedCount: number;
}

interface AccuracyTrendChartProps {
  data: AccuracyTrendPoint[];
}

export function AccuracyTrendChart({ data }: AccuracyTrendChartProps) {
  return (
    <section className="rounded-card border border-app-border bg-app-surface p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-app-primary">Accuracy trend</h2>
          <p className="mt-1 text-xs text-app-secondary">Your daily accuracy across the last 14 days of completed study.</p>
        </div>
      </div>

      {data.length === 0 ? (
        <p className="text-sm text-app-secondary">Complete a review session to see your accuracy trend.</p>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="rgb(var(--app-border))" strokeDasharray="3 3" vertical={false} opacity={0.65} />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'rgb(var(--app-secondary))', fontSize: 12 }}
              />
              <YAxis
                domain={[0, 100]}
                width={36}
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'rgb(var(--app-secondary))', fontSize: 12 }}
                tickFormatter={(value) => `${value}%`}
              />
              <Tooltip
                formatter={(value: number) => [`${value}%`, 'Accuracy']}
                labelFormatter={(_, payload) => {
                  const point = payload?.[0]?.payload as AccuracyTrendPoint | undefined;
                  return point ? `${point.fullLabel} • ${point.reviewedCount} card${point.reviewedCount === 1 ? '' : 's'}` : '';
                }}
                contentStyle={{
                  borderRadius: '16px',
                  border: '1px solid rgb(var(--app-border))',
                  backgroundColor: 'rgb(var(--app-surface))',
                  color: 'rgb(var(--app-primary))',
                }}
                itemStyle={{ color: 'rgb(var(--app-primary))' }}
                labelStyle={{ color: 'rgb(var(--app-secondary))' }}
              />
              <Line
                type="monotone"
                dataKey="accuracy"
                stroke="rgb(var(--app-nav))"
                strokeWidth={3}
                dot={{ r: 4, strokeWidth: 0, fill: 'rgb(var(--app-nav))' }}
                activeDot={{ r: 5, fill: 'rgb(var(--app-nav-dark))', strokeWidth: 0 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
