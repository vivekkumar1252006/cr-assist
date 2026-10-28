import React from 'react';
import { Menu, Bell, Shield, Calendar, ExternalLink } from 'lucide-react';
import { useAuth } from '@shared/context/AuthContext.jsx';

export function Header({ onToggleSidebar, title = 'Dashboard' }) {
  const { user } = useAuth();
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <header className="h-16 bg-white border-b border-slate-200 sticky top-0 z-30 flex items-center justify-between px-4 lg:px-8">
      {/* Left: Mobile Menu + Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
          aria-label="Toggle menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">{title}</h1>
        </div>
      </div>

      {/* Right: Actions, Date, Status & Profile */}
      <div className="flex items-center gap-4">
        {/* System Online Badge */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-700">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Live MySQL API</span>
        </div>

        {/* Date Display */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          <span>{today}</span>
        </div>

        {/* Admin Avatar Pill */}
        <div className="flex items-center gap-2.5 pl-2 border-l border-slate-200">
          <div className="w-9 h-9 rounded-full bg-blue-600 text-white font-bold text-sm flex items-center justify-center shadow-xs">
            {user?.fullName?.charAt(0) || 'A'}
          </div>
          <div className="hidden xl:block text-left">
            <div className="text-sm font-semibold text-slate-800 leading-tight">{user?.fullName || 'Administrator'}</div>
            <div className="text-[11px] text-blue-600 font-medium">Super Admin</div>
          </div>
        </div>
      </div>
    </header>
  );
}
