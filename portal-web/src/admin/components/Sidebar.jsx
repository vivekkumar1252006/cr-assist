import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  GraduationCap,
  Building2,
  QrCode,
  AlertCircle,
  Settings,
  LogOut,
  ShieldCheck,
  ChevronRight,
  ContactRound,
  ClipboardList,
  Smartphone,
  Info,
  MessageSquare,
} from 'lucide-react';
import { useAuth } from '@shared/context/AuthContext.jsx';

export function Sidebar({ pendingComplaintsCount = 0, isOpen, onClose }) {
  const { logout, user } = useAuth();

  const menuItems = [
    { label: 'Students', path: '/admin/students', icon: GraduationCap },
    { label: 'Departments', path: '/admin/classes', icon: Building2 },
    { label: 'Attendance', path: '/admin/attendance', icon: QrCode },
    {
      label: 'Complaints',
      path: '/admin/complaints',
      icon: AlertCircle,
      badge: pendingComplaintsCount > 0 ? pendingComplaintsCount : null,
    },
    { label: 'Attendance Complaints', path: '/admin/attendance-complaints', icon: ClipboardList },
    { label: 'Manage In-Charge', path: '/admin/incharges', icon: ContactRound },
    { label: 'Manage APK', path: '/admin/manage-apk', icon: Smartphone },
    { label: 'About Page', path: '/admin/about-management', icon: Info },
    { label: 'Manage Notices', path: '/admin/notices', icon: MessageSquare },
    { label: 'Settings', path: '/admin/settings', icon: Settings },
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 bg-slate-900 text-white flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand / Logo */}
        <div className="h-16 flex items-center px-5 border-b border-slate-800/80 gap-3 bg-slate-950/40">
          <img
            src="/logo.png"
            alt="Logo"
            className="w-10 h-10 rounded-xl object-contain bg-white p-0.5 shadow-lg shadow-blue-500/20 shrink-0"
          />
          <div>
            <div className="font-extrabold text-base tracking-tight text-white flex items-center gap-1.5">
              CR Assist
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                ERP
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-medium">Administrator Portal</div>
          </div>
        </div>

        {/* Navigation list */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <div className="px-3 mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Main Management
          </div>

          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                onClick={() => onClose && onClose()}
                className={({ isActive }) =>
                  `group flex items-center justify-between px-3 py-2.5 rounded-xl font-medium text-sm transition-all duration-150 ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20 font-semibold'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <div className="flex items-center gap-3">
                      <Icon
                        className={`w-5 h-5 transition-colors ${
                          isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'
                        }`}
                      />
                      <span>{item.label}</span>
                    </div>

                    <div className="flex items-center gap-1">
                      {item.badge !== null && (
                        <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-rose-500 text-white shadow-xs">
                          {item.badge}
                        </span>
                      )}
                      {isActive && <ChevronRight className="w-4 h-4 text-blue-200" />}
                    </div>
                  </>
                )}
              </NavLink>
            );
          })}
        </div>

        {/* Admin footer / Logout */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/30">
          <div className="flex items-center gap-3 px-2 py-2 mb-2 rounded-lg bg-slate-800/40">
            <div className="w-9 h-9 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold text-sm">
              {user?.fullName?.charAt(0) || 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white truncate">{user?.fullName || 'Administrator'}</div>
              <div className="text-xs text-slate-400 truncate">{user?.email || 'admin@college.edu'}</div>
            </div>
          </div>

          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
