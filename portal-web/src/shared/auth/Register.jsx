import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BadgeCheck, CalendarDays, Hash, IdCard, Lock, Mail, Phone, UserPlus, UserRound } from 'lucide-react';
import { Alert, Button, PasswordInput, PasswordStrength, SelectInput, TextInput } from '@shared/components/ui.jsx';
import { parseApiError } from '@shared/lib/api.js';
import { ACADEMIC_YEARS, COURSES, semestersFor, validateRegistration } from '@shared/lib/validation.js';
import { useAuth } from '@shared/context/AuthContext.jsx';

const initialForm = {
  fullName: '',
  enrollmentNumber: '',
  studentId: '',
  mobile: '',
  email: '',
  dob: '',
  course: '',
  password: '',
  confirmPassword: '',
  academicYear: '',
  semester: '',
  group: '',
  acceptTerms: false,
};

const today = new Date().toISOString().slice(0, 10);

function SectionTitle({ children }) {
  return (
    <h2 className="col-span-full mt-2 flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-blue-700">
      {children}
      <span aria-hidden="true" className="h-px flex-1 bg-blue-100" />
    </h2>
  );
}

export default function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);

  const update = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => {
      const next = { ...f, [key]: value };
      // Reset semester if it no longer belongs to the chosen academic year.
      if (key === 'academicYear' && !semestersFor(value).includes(Number(f.semester))) next.semester = '';
      return next;
    });
    if (errors[key]) setErrors((errs) => ({ ...errs, [key]: undefined }));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setServerError('');
    const nextErrors = validateRegistration(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      // Bring the first invalid field into view.
      requestAnimationFrame(() => document.querySelector('[aria-invalid="true"]')?.focus());
      return;
    }

    setLoading(true);
    try {
      await register({ ...form, semester: Number(form.semester) });
      // The account is active immediately, so go straight into the portal.
      navigate('/student/dashboard', { replace: true });
    } catch (err) {
      const { message, errors: fieldErrors } = parseApiError(err);
      setErrors(fieldErrors);
      setServerError(message);
      // The form pane is the scroll container; the page background stays fixed.
      document.querySelector('.register-page .login-main')?.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setLoading(false);
    }
  }

  const semesterOptions = semestersFor(form.academicYear).map((s) => ({ value: String(s), label: `Semester ${s}` }));

  return (
    <div className="login-page login-page-center register-page">
      <main className="login-main">
        <section className="register-card">
          <header className="login-card-heading">
            <span className="login-card-kicker">Student Registration</span>
            <h2>Create Account</h2>
            <p>Register to access attendance records, QR attendance and college support services.</p>
          </header>

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <Alert type="error">{serverError}</Alert>

            <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2 md:gap-x-6">
              <SectionTitle>Personal details</SectionTitle>
              <TextInput
                className="sm:col-span-2"
                label="Full Name"
                icon={UserRound}
                placeholder="As per college records"
                autoComplete="name"
                value={form.fullName}
                onChange={update('fullName')}
                error={errors.fullName}
                required
              />
              <TextInput
                label="Email Address"
                type="email"
                icon={Mail}
                placeholder="you@college.edu"
                autoComplete="email"
                value={form.email}
                onChange={update('email')}
                error={errors.email}
                required
              />
              <TextInput
                label="Mobile Number"
                type="tel"
                icon={Phone}
                placeholder="10-digit mobile number"
                autoComplete="tel-national"
                inputMode="numeric"
                maxLength={14}
                value={form.mobile}
                onChange={update('mobile')}
                error={errors.mobile}
                required
              />
              <TextInput
                label="Date of Birth"
                type="date"
                icon={CalendarDays}
                max={today}
                autoComplete="bday"
                value={form.dob}
                onChange={update('dob')}
                error={errors.dob}
                required
              />

              <SectionTitle>Academic details</SectionTitle>
              <TextInput
                label="Enrollment Number"
                icon={Hash}
                placeholder="e.g. 0111CS251275"
                value={form.enrollmentNumber}
                onChange={update('enrollmentNumber')}
                onBlur={(e) => setForm((f) => ({ ...f, enrollmentNumber: e.target.value.trim().toUpperCase() }))}
                error={errors.enrollmentNumber}
                required
              />
              <TextInput
                label="Student ID"
                icon={IdCard}
                placeholder="e.g. 25-26STU11806"
                value={form.studentId}
                onChange={update('studentId')}
                onBlur={(e) => setForm((f) => ({ ...f, studentId: e.target.value.trim().toUpperCase() }))}
                error={errors.studentId}
                required
              />
              <SelectInput
                className="sm:col-span-2"
                label="Course / Branch"
                placeholder="Select course / branch"
                options={Object.entries(COURSES).map(([value, name]) => ({ value, label: `${name} (${value})` }))}
                value={form.course}
                onChange={update('course')}
                error={errors.course}
                required
              />
              <SelectInput
                label="Academic Year"
                placeholder="Select academic year"
                options={ACADEMIC_YEARS.map((y) => ({ value: y, label: y }))}
                value={form.academicYear}
                onChange={update('academicYear')}
                error={errors.academicYear}
                required
              />
              <SelectInput
                label="Class / Semester"
                placeholder={form.academicYear ? 'Select semester' : 'Select academic year first'}
                options={semesterOptions}
                disabled={!form.academicYear}
                value={form.semester}
                onChange={update('semester')}
                error={errors.semester}
                required
              />

              <fieldset className="sm:col-span-2">
                <legend className="mb-1.5 text-sm font-medium text-navy-900">
                  Group<span className="ml-0.5 text-red-500">*</span>
                </legend>
                <div className="grid grid-cols-2 gap-3">
                  {['A', 'B'].map((g) => (
                    <label
                      key={g}
                      className={`flex min-w-0 cursor-pointer items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                        form.group === g
                          ? 'border-blue-500 bg-blue-50 text-blue-800 ring-4 ring-blue-100'
                          : errors.group
                            ? 'border-red-300 text-slate-600 hover:border-red-400'
                            : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <input type="radio" name="group" value={g} checked={form.group === g} onChange={update('group')} className="sr-only" />
                      {form.group === g && <BadgeCheck className="h-4 w-4 shrink-0" />}
                      Group {g}
                    </label>
                  ))}
                </div>
                {errors.group && <p className="mt-1.5 text-xs font-medium text-red-600">{errors.group}</p>}
              </fieldset>

              <SectionTitle>Security</SectionTitle>
              <div>
                <PasswordInput
                  label="Create Password"
                  icon={Lock}
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={update('password')}
                  error={errors.password}
                  hint="Use upper & lowercase letters and a number"
                  required
                />
                <PasswordStrength password={form.password} />
              </div>
              <PasswordInput
                label="Confirm Password"
                icon={Lock}
                placeholder="Re-enter password"
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={update('confirmPassword')}
                error={errors.confirmPassword}
                required
              />
            </div>

            <div>
              <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={form.acceptTerms}
                  onChange={update('acceptTerms')}
                  aria-invalid={Boolean(errors.acceptTerms)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-blue-600"
                />
                <span>
                  I agree to the{' '}
                  <Link to="/policies#terms" target="_blank" className="font-medium text-blue-700 hover:underline">
                    Terms of Use
                  </Link>{' '}
                  and{' '}
                  <Link to="/policies#privacy" target="_blank" className="font-medium text-blue-700 hover:underline">
                    Privacy Policy
                  </Link>
                  .
                </span>
              </label>
              {errors.acceptTerms && <p className="mt-1.5 text-xs font-medium text-red-600">{errors.acceptTerms}</p>}
            </div>

            <Button type="submit" loading={loading} className="sm:w-auto sm:min-w-48">
              {!loading && <UserPlus className="h-4 w-4" />}
              {loading ? 'Creating account…' : 'Create Account'}
            </Button>

            <p className="text-center text-sm text-slate-600">
              Already have an account?{' '}
              <Link to="/login" className="font-semibold text-blue-700 hover:underline">
                Login
              </Link>
            </p>
          </form>
        </section>
      </main>
    </div>
  );
}
