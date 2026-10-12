import type { ReactNode } from 'react';

interface MetricCardProps {
  title: string;
  value: ReactNode;
  icon: ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
}

export const MetricCard = ({ title, value, icon, trend }: MetricCardProps) => {
  return (
    <div className="card p-5 flex flex-col justify-between gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="caption">{title}</h3>
        <div className="text-subtle" aria-hidden="true">
          {icon}
        </div>
      </div>
      <div>
        <p className="text-3xl font-semibold tracking-tight text-fg tabular-nums">{value}</p>
        {trend && (
          <p className={`text-sm font-medium mt-1 tabular-nums ${trend.isPositive ? 'text-success' : 'text-danger'}`}>
            {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}% from last week
          </p>
        )}
      </div>
    </div>
  );
};
