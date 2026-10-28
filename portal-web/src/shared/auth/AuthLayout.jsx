import { CalendarCheck, GraduationCap, ShieldCheck } from 'lucide-react';
import { Logo } from '@shared/components/ui.jsx';
import CampusIllustration from '@shared/components/CampusIllustration.jsx';

const highlights = [
  { Icon: CalendarCheck, text: 'Track your attendance records in real time' },
  { Icon: GraduationCap, text: 'Mark attendance instantly with secure QR codes' },
  { Icon: ShieldCheck, text: 'Your data is protected and encrypted' },
];

/**
 * Two-column auth shell: branded illustration panel on the left (desktop),
 * form card on the right. Collapses to a single column on mobile/tablet.
 */
export default function AuthLayout({ title, subtitle, children, wide = false }) {
  return (
    <div className="flex min-h-screen bg-white">
      <aside className="relative hidden w-[44%] overflow-hidden bg-gradient-to-br from-navy-950 via-navy-900 to-navy-700 lg:flex lg:flex-col lg:justify-between xl:w-[42%]">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-teal-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-teal-400/10 blur-3xl" />

        <div className="relative z-10 p-10 xl:p-12">
          <Logo light />
        </div>

        <div className="relative z-10 px-10 xl:px-12">
          <CampusIllustration className="mx-auto w-full max-w-md animate-float" />
          <h2 className="mt-8 text-3xl font-bold leading-tight text-white xl:text-4xl">
            Welcome to your <span className="text-teal-300">college portal</span>
          </h2>
          <p className="mt-3 max-w-md text-navy-100/80">
            Smarter attendance for a smarter campus. Sign in to view your attendance, scan QR codes in class
            and reach college support services.
          </p>
          <ul className="mt-6 space-y-3">
            {highlights.map(({ Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-navy-100">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <Icon className="h-4 w-4 text-teal-300" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 p-10 text-xs text-navy-200/70 xl:p-12">
          © {new Date().getFullYear()} SmartAttend · QR-based attendance management
        </p>
      </aside>

      <main className="flex flex-1 flex-col bg-gradient-to-b from-slate-50 to-white lg:bg-none">
        <div className="flex items-center justify-between px-5 pt-6 sm:px-8 lg:hidden">
          <Logo />
        </div>
        <div className="flex flex-1 items-center justify-center px-4 py-8 sm:px-8 lg:py-12">
          <div className={`w-full animate-fade-up ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
            <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-xl shadow-navy-900/5 sm:p-8">
              <header className="mb-6">
                <h1 className="text-2xl font-bold tracking-tight text-navy-900 sm:text-[1.7rem]">{title}</h1>
                {subtitle && <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{subtitle}</p>}
              </header>
              {children}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
