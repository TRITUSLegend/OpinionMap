import type { ReactNode } from 'react';

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
}

export const MetricCard = ({ title, value, icon, trend }: MetricCardProps) => {
  return (
    <div className="glass-card p-6 rounded-xl flex flex-col justify-between hover:shadow-2xl transition-all duration-300">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-gray-400 font-medium text-sm tracking-wide">{title}</h3>
        <div className="text-accent bg-accent/10 p-2 rounded-lg">
          {icon}
        </div>
      </div>
      <div>
        <p className="text-3xl font-bold text-white mb-2">{value}</p>
        {trend && (
          <p className={`text-sm font-medium ${trend.isPositive ? 'text-accent' : 'text-red-400'}`}>
            {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}% from last week
          </p>
        )}
      </div>
    </div>
  );
};
