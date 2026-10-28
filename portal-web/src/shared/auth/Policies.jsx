import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '@shared/components/ui.jsx';

export default function Policies() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <Logo />
          <Link to="/login" className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-700 hover:text-teal-700">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 text-sm leading-relaxed text-slate-700 sm:px-6">
        <section id="terms" className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <h1 className="mb-3 text-xl font-bold text-navy-900">Terms of Use</h1>
          <ul className="list-disc space-y-2 pl-5">
            <li>SmartAttend accounts are for enrolled students of the college only. Register with your own, accurate details.</li>
            <li>Keep your password confidential. You are responsible for activity performed with your account.</li>
            <li>Marking attendance on behalf of another student, or attempting to bypass QR verification, is misconduct under college rules.</li>
            <li>The college may approve, suspend or reject accounts that do not meet these terms.</li>
          </ul>
        </section>
        <section id="privacy" className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-xl font-bold text-navy-900">Privacy Policy</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>We store the details you submit at registration (name, enrollment number, student ID, email, mobile, date of birth, academic year, semester and group).</li>
            <li>Your password is stored only as a one-way bcrypt hash and is never visible to staff.</li>
            <li>Your data is used solely to identify you for attendance and college support services, and is not sold or shared with third parties.</li>
            <li>Contact the college administration to correct or remove your data.</li>
          </ul>
          <p className="mt-4 text-xs text-slate-500">
            Your institution should review and replace this summary with its official policy before going live.
          </p>
        </section>
      </main>
    </div>
  );
}
