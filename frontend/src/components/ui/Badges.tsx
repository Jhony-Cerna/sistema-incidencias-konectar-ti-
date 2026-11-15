import { CheckCircle2, Clock, PlayCircle } from 'lucide-react';
import { TicketPriority, TicketStatus, CategoryCode } from '../../types';

export function StatusBadge({ status, size = 'sm' }: { status: TicketStatus; size?: 'sm' | 'md' }) {
  const config = {
    PENDIENTE: {
      label: 'Pendiente',
      classes: 'bg-amber-50 text-amber-800 border-amber-200 ring-amber-500/20',
      Icon: Clock,
      iconColor: 'text-amber-600',
    },
    EN_PROCESO: {
      label: 'En proceso',
      classes: 'bg-blue-50 text-blue-800 border-blue-200 ring-blue-500/20',
      Icon: PlayCircle,
      iconColor: 'text-blue-600',
    },
    RESUELTO: {
      label: 'Resuelto',
      classes: 'bg-emerald-50 text-emerald-800 border-emerald-200 ring-emerald-500/20',
      Icon: CheckCircle2,
      iconColor: 'text-emerald-600',
    },
  }[status] || {
    label: status,
    classes: 'bg-slate-100 text-slate-700 border-slate-200',
    Icon: Clock,
    iconColor: 'text-slate-500',
  };

  const { Icon } = config;
  const padding = size === 'md' ? 'px-3 py-1 text-xs' : 'px-2.5 py-0.5 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold whitespace-nowrap ${padding} ${config.classes}`}
    >
      <Icon className={`h-3.5 w-3.5 ${config.iconColor}`} />
      {config.label}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const config = {
    CRITICA: {
      label: 'Crítica',
      classes: 'bg-rose-50 text-rose-700 border-rose-200',
      dot: 'bg-rose-600',
    },
    ALTA: {
      label: 'Alta',
      classes: 'bg-orange-50 text-orange-700 border-orange-200',
      dot: 'bg-orange-500',
    },
    MEDIA: {
      label: 'Media',
      classes: 'bg-sky-50 text-sky-700 border-sky-200',
      dot: 'bg-sky-500',
    },
    BAJA: {
      label: 'Baja',
      classes: 'bg-slate-100 text-slate-700 border-slate-200',
      dot: 'bg-slate-400',
    },
  }[priority] || {
    label: priority,
    classes: 'bg-slate-100 text-slate-700 border-slate-200',
    dot: 'bg-slate-400',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${config.classes}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

export function CategoryBadge({ code, name }: { code: CategoryCode | string; name: string }) {
  const styles: Record<string, string> = {
    HARDWARE: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    SOFTWARE: 'bg-violet-50 text-violet-700 border-violet-200',
    CONECTIVIDAD: 'bg-cyan-50 text-cyan-800 border-cyan-200',
  };

  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${
        styles[code] || 'bg-slate-100 text-slate-700 border-slate-200'
      }`}
    >
      {name}
    </span>
  );
}
