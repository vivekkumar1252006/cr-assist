import React from 'react';

export function StatCard({ title, value, icon: Icon, color = 'blue', subtitle, onClick }) {
  const colors = {
    blue: {
      bg: 'bg-blue-50/70 text-blue-600 border-blue-100',
      iconBg: 'bg-blue-600 text-white shadow-blue-500/20',
      accent: 'border-l-blue-600',
    },
    emerald: {
      bg: 'bg-emerald-50/70 text-emerald-600 border-emerald-100',
      iconBg: 'bg-emerald-600 text-white shadow-emerald-500/20',
      accent: 'border-l-emerald-600',
    },
    amber: {
      bg: 'bg-amber-50/70 text-amber-600 border-amber-100',
      iconBg: 'bg-amber-600 text-white shadow-amber-500/20',
      accent: 'border-l-amber-600',
    },
    purple: {
      bg: 'bg-purple-50/70 text-purple-600 border-purple-100',
      iconBg: 'bg-purple-600 text-white shadow-purple-500/20',
      accent: 'border-l-purple-600',
    },
    rose: {
      bg: 'bg-rose-50/70 text-rose-600 border-rose-100',
      iconBg: 'bg-rose-600 text-white shadow-rose-500/20',
      accent: 'border-l-rose-600',
    },
    indigo: {
      bg: 'bg-indigo-50/70 text-indigo-600 border-indigo-100',
      iconBg: 'bg-indigo-600 text-white shadow-indigo-500/20',
      accent: 'border-l-indigo-600',
    },
  };

  const scheme = colors[color] || colors.blue;

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-2xl p-5 border border-slate-200 shadow-xs hover:shadow-md transition-all duration-200 border-l-4 ${
        scheme.accent
      } ${onClick ? 'cursor-pointer hover:-translate-y-0.5' : ''}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">{title}</p>
          <h3 className="text-2xl font-extrabold text-slate-900 tracking-tight">{value}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-1.5 font-medium">{subtitle}</p>}
        </div>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-md ${scheme.iconBg}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}
