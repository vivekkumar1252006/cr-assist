import { createContext, useContext, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  CalendarClock, Code2, Download, HelpCircle, LayoutDashboard, ListChecks, Loader2, LogOut, Menu,
  Megaphone, MessageSquareWarning, QrCode, UserRound, X,
} from 'lucide-react';
import { Logo } from '@shared/components/ui.jsx';
import NotificationBell from '@shared/components/NotificationBell.jsx';
import { Avatar } from './common.jsx';
import { useAuth } from '@shared/context/AuthContext.jsx';
import { useApi } from '@shared/lib/useApi.js';

// `match` decides highlighting where prefixes overlap (/student/complaints vs /new vs /:id).
const NAV = [
  { to: '/student/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/student/profile', label: 'My Profile', Icon: UserRound },
  { to: '/student/qr', label: 'QR Attendance', Icon: QrCode },
  { to: '/student/attendance-complaint', label: 'Attendance Complaint', Icon: CalendarClock },
  { to: '/student/notices', label: 'Notices', Icon: Megaphone },
  { to: '/student/complaints/new', label: 'Problem & Complaints', Icon: MessageSquareWarning, match: (p) => p === '/student/complaints/new' },
  {
    to: '/student/complaints',
    label: 'My Complaints',
    Icon: ListChecks,
    match: (p) => p.startsWith('/student/complaints') && p !== '/student/complaints/new',
  },
  { to: '/student/help', label: 'Help & Support', Icon: HelpCircle },
  { to: '/student/about-developer', label: 'About Developer', Icon: Code2 },
  { to: '/student/download-app', label: 'Download App', Icon: Download },
];

const StudentContext = createContext(null);
/** { profile, profileError, profileLoading, setProfile, reloadProfile, logout } for student pages. */
export const useStudent = () => useContext(StudentContext);

export default function StudentLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const { data, error, loading, reload, setData } = useApi('/student/profile');
  const profile = data?.profile ?? null;

  // Close the mobile drawer on navigation.
  useEffect(() => setOpen(false), [location.pathname]);

  async function handleLogout() {
    setLoggingOut(true);
    await logout();
    navigate('/login', { replace: true, state: { notice: { type: 'success', message: 'You have been logged out.' } } });
  }

  const ctx = {
    profile,
    profileError: error,
    profileLoading: loading,
    reloadProfile: reload,
    setProfile: (p) => setData({ profile: p }),
    logout: handleLogout,
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 py-5">
        <Logo light />
        <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-navy-200 hover:bg-white/10 lg:hidden" aria-label="Close menu">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="mx-4 mb-4 flex items-center gap-3 rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
        <Avatar name={profile?.fullName ?? user.fullName} src={profile?.photoUrl} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{profile?.fullName ?? user.fullName}</p>
          <p className="truncate text-xs text-navy-200">{user.enrollmentNumber}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3" aria-label="Student navigation">
        {NAV.map(({ to, label, Icon, match }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive: routerActive }) =>
              `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                (match ? match(location.pathname) : routerActive)
                  ? 'bg-teal-500/15 text-white ring-1 ring-teal-400/30'
                  : 'text-navy-100/80 hover:bg-white/5 hover:text-white'
              }`
            }
            aria-current={match ? (match(location.pathname) ? 'page' : undefined) : undefined}
          >
            {({ isActive: routerActive }) => {
              const isActive = match ? match(location.pathname) : routerActive;
              return (
              <>
                <Icon className={`h-[18px] w-[18px] ${isActive ? 'text-teal-300' : 'text-navy-300 group-hover:text-teal-300'}`} />
                {label}
                {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-teal-300" />}
              </>
              );
            }}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-navy-100/80 transition hover:bg-red-500/15 hover:text-red-200 disabled:opacity-60"
        >
          {loggingOut ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <LogOut className="h-[18px] w-[18px]" />}
          Logout
        </button>
      </div>
    </div>
  );

  return (
    <StudentContext.Provider value={ctx}>
      <div className="min-h-screen bg-slate-50">
        {/* Desktop sidebar */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-gradient-to-b from-navy-950 to-navy-900 lg:block">{sidebar}</aside>

        {/* Mobile drawer */}
        <div className={`fixed inset-0 z-40 lg:hidden ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
          <div
            onClick={() => setOpen(false)}
            className={`absolute inset-0 bg-navy-950/50 backdrop-blur-sm transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`}
          />
          <aside
            className={`absolute inset-y-0 left-0 w-72 max-w-[85%] bg-gradient-to-b from-navy-950 to-navy-900 shadow-2xl transition-transform duration-300 ${
              open ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            {sidebar}
          </aside>
        </div>

        <div className="lg:pl-64">
          <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-2.5 backdrop-blur sm:px-6 lg:px-8">
            <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-navy-800 hover:bg-slate-100 lg:hidden" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <div className="lg:hidden"><Logo /></div>
            <p className="hidden text-sm text-slate-500 lg:block">
              {user.enrollmentNumber} · Student Portal
            </p>
            <div className="ml-auto flex items-center gap-2">
              <NotificationBell />
              <Avatar name={profile?.fullName ?? user.fullName} src={profile?.photoUrl} size="sm" className="ring-2 ring-slate-100" />
            </div>
          </header>

          <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <Outlet />
          </main>
        </div>
      </div>
    </StudentContext.Provider>
  );
}
