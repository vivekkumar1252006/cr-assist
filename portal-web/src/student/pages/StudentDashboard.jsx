import { Link } from 'react-router-dom';
import {
  ChevronRight, FlaskConical, HelpCircle, LogOut, MessageSquareWarning, Pencil, QrCode, Radio,
  ShieldCheck, UserRound,
} from 'lucide-react';
import { useStudent } from '@/student/components/StudentLayout.jsx';
import { Avatar, Card, ErrorState, Skeleton, btnSecondary } from '@/student/components/common.jsx';
import { useApi } from '../../shared/lib/useApi.js';
import { formatTime } from '../../shared/lib/format.js';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function ProfileCard() {
  const { profile, profileLoading, profileError, reloadProfile } = useStudent();
  if (profileError) return <Card title="My Profile" icon={UserRound}><ErrorState message={profileError} onRetry={reloadProfile} /></Card>;
  if (profileLoading || !profile) {
    return (
      <Card title="My Profile" icon={UserRound}>
        <div className="flex flex-col items-center gap-3">
          <Skeleton className="h-24 w-24 rounded-full" />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-44" />
        </div>
      </Card>
    );
  }

  const rows = [
    ['Enrollment No.', profile.enrollmentNumber],
    ['Student ID', profile.studentId],
    ['Course', profile.course],
    ['Semester', `Semester ${profile.semester}`],
    ['Academic Year', profile.academicYear],
    ['Group', `Group ${profile.group}`],
    ['Mobile', profile.mobile || 'Not added'],
  ];

  return (
    <Card title="My Profile" icon={UserRound} bodyClassName="p-5">
      <div className="flex flex-col items-center text-center">
        <Avatar name={profile.fullName} src={profile.photoUrl} size="lg" className="shadow-lg ring-teal-50" />
        <h3 className="mt-3 text-lg font-bold text-navy-900">{profile.fullName}</h3>
        <p className="text-sm text-slate-500">{profile.email}</p>
        {profile.isDemo && (
          <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-600/20">
            <FlaskConical className="h-3 w-3" /> Demo account
          </span>
        )}
      </div>
      <dl className="mt-5 divide-y divide-slate-100 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 py-2">
            <dt className="text-slate-500">{k}</dt>
            <dd className={`text-right font-medium ${v === 'Not added' ? 'text-slate-400' : 'text-navy-900'}`}>{v}</dd>
          </div>
        ))}
      </dl>
      <Link to="/student/profile?edit=1" className={`${btnSecondary} mt-4 w-full`}>
        <Pencil className="h-4 w-4" /> Edit Profile
      </Link>
    </Card>
  );
}

function QrCard() {
  const { data, error, loading, reload } = useApi('/student/attendance/qr');
  return (
    <Card title="QR Attendance" icon={QrCode} action={<Link to="/student/qr" className="text-xs font-semibold text-teal-700 hover:underline">Open</Link>}>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading || !data ? (
        <div className="flex items-center gap-4"><Skeleton className="h-28 w-28" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /></div></div>
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row lg:flex-col xl:flex-row">
          <img src={data.identity.image} alt="Your student ID QR code" className="h-28 w-28 rounded-xl border border-slate-100 bg-white p-1.5" />
          <div className="text-sm">
            {data.session ? (
              <>
                <p className="inline-flex items-center gap-1.5 font-semibold text-teal-700">
                  <Radio className="h-4 w-4 animate-pulse" /> Live: {data.session.subject}
                </p>
                <p className="mt-1 text-slate-600">
                  {data.session.alreadyMarked
                    ? `Attendance already recorded (${data.session.markedStatus}).`
                    : `Session open until ${formatTime(data.session.endsAt)}. Show your attendance QR to the faculty.`}
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold text-navy-900">No active session right now</p>
                <p className="mt-1 text-slate-600">
                  This QR identifies you only. Attendance can only be recorded during an authorized, active attendance session.
                </p>
              </>
            )}
            <Link to="/student/qr" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-teal-700 hover:underline">
              View Attendance QR <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}
    </Card>
  );
}

const QUICK_ACTIONS = [
  { to: '/student/complaints/new', label: 'Submit Attendance Complaint', Icon: MessageSquareWarning },
  { to: '/student/help', label: 'Help & Support', Icon: HelpCircle },
  { to: '/student/profile?edit=1', label: 'Edit Profile', Icon: Pencil },
];

export default function StudentDashboard() {
  const { profile, logout } = useStudent();

  return (
    <div className="animate-fade-up space-y-6">
      {/* Welcome banner */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-navy-950 via-navy-900 to-navy-700 p-6 text-white shadow-xl shadow-navy-900/10 sm:p-7">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-teal-400/20 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-navy-100/80">{greeting()},</p>
            <h1 className="text-2xl font-bold sm:text-3xl">{profile?.fullName ?? 'Student'}</h1>
            {profile && (
              <p className="mt-1 text-sm text-teal-200">
                {profile.courseName} · {profile.academicYear} · Semester {profile.semester} · Group {profile.group}
              </p>
            )}
          </div>
          <Link to="/student/qr" className="inline-flex items-center gap-2 self-start rounded-xl bg-teal-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-900/30 transition hover:bg-teal-400 sm:self-auto">
            <QrCode className="h-4 w-4" /> My Attendance QR
          </Link>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <ProfileCard />
        <div className="grid gap-6 sm:grid-cols-2 lg:col-span-2">
          <QrCard />
          <Card title="Quick Actions" icon={ShieldCheck} bodyClassName="p-2">
            <ul>
              {QUICK_ACTIONS.map(({ to, label, Icon }) => (
                <li key={label}>
                  <Link to={to} className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-navy-900">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-teal-50 text-teal-700 transition group-hover:bg-teal-100">
                      <Icon className="h-4 w-4" />
                    </span>
                    {label}
                    <ChevronRight className="ml-auto h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
                  </Link>
                </li>
              ))}
              <li>
                <button onClick={logout} className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-red-50 hover:text-red-700">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-red-50 text-red-600"><LogOut className="h-4 w-4" /></span>
                  Logout
                </button>
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
