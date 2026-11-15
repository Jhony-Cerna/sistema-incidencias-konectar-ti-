import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  tone?: 'blue' | 'amber' | 'emerald' | 'rose' | 'indigo' | 'slate';
}

export function StatCard({ title, value, subtitle, icon: Icon, tone = 'blue' }: StatCardProps) {
  const toneStyles = {
    blue: {
      iconBg: 'bg-blue-50 text-blue-600 ring-blue-100',
      accent: 'border-l-blue-600',
    },
    amber: {
      iconBg: 'bg-amber-50 text-amber-600 ring-amber-100',
      accent: 'border-l-amber-500',
    },
    emerald: {
      iconBg: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
      accent: 'border-l-emerald-500',
    },
    rose: {
      iconBg: 'bg-rose-50 text-rose-600 ring-rose-100',
      accent: 'border-l-rose-500',
    },
    indigo: {
      iconBg: 'bg-indigo-50 text-indigo-600 ring-indigo-100',
      accent: 'border-l-indigo-600',
    },
    slate: {
      iconBg: 'bg-slate-100 text-slate-700 ring-slate-200',
      accent: 'border-l-slate-700',
    },
  }[tone];

  return (
    <div
      className={`rounded-xl bg-white border border-slate-200 border-l-4 ${toneStyles.accent} p-5 shadow-xs hover:shadow-md transition-shadow`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
          <p className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{value}</p>
          {subtitle && <p className="mt-1.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        <div className={`rounded-xl p-2.5 ring-1 ${toneStyles.iconBg}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
