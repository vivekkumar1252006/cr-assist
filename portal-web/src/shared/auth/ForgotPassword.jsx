import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, KeyRound, Lock, Mail, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { Alert, Button, PasswordInput, PasswordStrength, TextInput } from '@shared/components/ui.jsx';
import { api, parseApiError } from '@shared/lib/api.js';
import { isEmail, passwordError } from '@shared/lib/validation.js';

const formatSeconds = (total) => `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;

const HEADINGS = {
  email: {
    kicker: 'Account Recovery',
    title: 'Forgot your password?',
    text: "Enter the email address you registered with and we'll send you a 6-digit verification code.",
  },
  otp: {
    kicker: 'Email Verification',
    title: 'Enter your verification code',
    text: 'Check your inbox for the 6-digit code. It can be used once and expires shortly.',
  },
  password: {
    kicker: 'Set New Password',
    title: 'Choose a new password',
    text: 'Your code was verified. Set a new password to finish resetting your account.',
  },
};

export default function ForgotPassword() {
  const navigate = useNavigate();

  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [expiresIn, setExpiresIn] = useState(0);
  const [attemptsLeft, setAttemptsLeft] = useState(null);
  const [otpLocked, setOtpLocked] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Countdown for the resend cooldown and the 5-minute code lifetime.
  const timerActive = cooldown > 0 || (step === 'otp' && expiresIn > 0);
  useEffect(() => {
    if (!timerActive) return undefined;
    const id = setInterval(() => {
      setCooldown((v) => (v > 0 ? v - 1 : 0));
      setExpiresIn((v) => (v > 0 ? v - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [timerActive]);

  function restart() {
    setStep('email');
    setOtp('');
    setResetToken('');
    setPassword('');
    setConfirmPassword('');
    setErrors({});
    setNotice(null);
    setCooldown(0);
    setExpiresIn(0);
    setAttemptsLeft(null);
    setOtpLocked(false);
    setSessionExpired(false);
  }

  async function sendCode(e) {
    e?.preventDefault();
    if (cooldown > 0) return;
    setNotice(null);
    if (!isEmail(email)) {
      setErrors({ email: 'Enter your registered email address' });
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const { data } = await api.post('/auth/forgot-password', { email: email.trim() });
      setStep('otp');
      setOtp('');
      setOtpLocked(false);
      setAttemptsLeft(null);
      setSessionExpired(false);
      setCooldown(data.resendAfterSeconds ?? 60);
      setExpiresIn(data.expiresInSeconds ?? 300);
      setNotice({ type: 'success', message: data.message });
    } catch (err) {
      const { message, code, errors: fieldErrors } = parseApiError(err);
      const retryAfter = err.response?.data?.retryAfterSeconds;
      if (code === 'OTP_COOLDOWN' || code === 'OTP_RATE_LIMITED') {
        if (retryAfter) setCooldown(Number(retryAfter));
        setNotice({ type: 'warning', message });
      } else {
        setErrors(fieldErrors);
        setNotice({ type: code === 'EMAIL_NOT_CONFIGURED' ? 'warning' : 'error', message });
      }
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(e) {
    e.preventDefault();
    if (!/^\d{6}$/.test(otp)) {
      setErrors({ otp: 'Enter the 6-digit code from the email' });
      return;
    }
    setErrors({});
    setNotice(null);
    setLoading(true);
    try {
      const { data } = await api.post('/auth/verify-otp', { email: email.trim(), otp });
      setResetToken(data.resetToken);
      setOtp('');
      setAttemptsLeft(null);
      setStep('password');
    } catch (err) {
      const { message, code, errors: fieldErrors } = parseApiError(err);
      setErrors(fieldErrors);
      setNotice({ type: 'error', message });
      const remaining = err.response?.data?.attemptsRemaining;
      if (remaining != null) setAttemptsLeft(remaining);
      if (code === 'OTP_ATTEMPTS_EXCEEDED') setOtpLocked(true);
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword(e) {
    e.preventDefault();
    const next = {};
    const pw = passwordError(password);
    if (pw) next.password = pw;
    if (password !== confirmPassword) next.confirmPassword = 'Passwords do not match';
    setErrors(next);
    setNotice(null);
    if (Object.keys(next).length) return;

    setLoading(true);
    try {
      const { data } = await api.post('/auth/reset-password', { resetToken, password, confirmPassword });
      navigate('/login', { replace: true, state: { notice: { type: 'success', message: data.message } } });
    } catch (err) {
      const { message, code, errors: fieldErrors } = parseApiError(err);
      setErrors(fieldErrors);
      setNotice({ type: 'error', message });
      if (code === 'RESET_SESSION_INVALID') setSessionExpired(true);
    } finally {
      setLoading(false);
    }
  }

  const heading = HEADINGS[step];

  return (
    <div className="login-page login-page-center">
      <main className="login-main">
        <div className="login-card">
          <div className="login-card-heading">
            <span className="login-card-kicker">{heading.kicker}</span>
            <h2>{heading.title}</h2>
            <p>{heading.text}</p>
          </div>

          {step === 'email' && (
            <form onSubmit={sendCode} noValidate className="space-y-5">
              {notice && <Alert type={notice.type}>{notice.message}</Alert>}

              <TextInput
                label="Registered Email Address"
                type="email"
                icon={Mail}
                placeholder="you@college.edu"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErrors({});
                }}
                error={errors.email}
                required
              />

              <Button type="submit" loading={loading} disabled={cooldown > 0}>
                {!loading && <Send className="h-4 w-4" />}
                {loading ? 'Sending…' : cooldown > 0 ? `Please wait ${cooldown}s` : 'Send Verification Code'}
              </Button>
            </form>
          )}

          {step === 'otp' && (
            <form onSubmit={verifyCode} noValidate className="space-y-5">
              {notice && <Alert type={notice.type}>{notice.message}</Alert>}
              {!notice && expiresIn === 0 && (
                <Alert type="warning">This code has expired. Request a new one to continue.</Alert>
              )}

              <p className="text-sm text-slate-600">
                Sent to <span className="font-semibold text-navy-900">{email}</span>
              </p>

              <TextInput
                label="6-digit verification code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                autoFocus
                placeholder="••••••"
                value={otp}
                onChange={(e) => {
                  setOtp(e.target.value.replace(/\D/g, '').slice(0, 6));
                  setErrors({});
                }}
                error={errors.otp}
                hint={attemptsLeft != null ? `${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left for this code` : undefined}
                inputClassName="text-center text-lg font-semibold tracking-[0.45em] placeholder:tracking-[0.25em]"
                required
              />

              <div className="flex items-center justify-between gap-3 text-xs">
                <span className={expiresIn > 0 ? 'text-slate-500' : 'font-medium text-red-600'}>
                  {expiresIn > 0 ? `Code expires in ${formatSeconds(expiresIn)}` : 'Code expired'}
                </span>
                <button
                  type="button"
                  onClick={sendCode}
                  disabled={loading || cooldown > 0}
                  className="inline-flex items-center gap-1.5 font-semibold text-teal-700 transition hover:text-teal-800 disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                </button>
              </div>

              <Button type="submit" loading={loading} disabled={otpLocked || expiresIn === 0}>
                {!loading && <ShieldCheck className="h-4 w-4" />}
                {loading ? 'Verifying…' : 'Verify Code'}
              </Button>

              <button
                type="button"
                onClick={restart}
                className="mx-auto block text-sm font-medium text-navy-700 transition hover:text-blue-700"
              >
                Use a different email
              </button>
            </form>
          )}

          {step === 'password' && (
            <form onSubmit={resetPassword} noValidate className="space-y-5">
              {notice && (
                <Alert type={notice.type}>
                  {notice.message}
                  {sessionExpired && (
                    <>
                      {' '}
                      <button type="button" onClick={restart} className="font-semibold underline">
                        Start over
                      </button>
                    </>
                  )}
                </Alert>
              )}

              <div>
                <PasswordInput
                  label="New Password"
                  icon={Lock}
                  autoComplete="new-password"
                  autoFocus
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrors((prev) => ({ ...prev, password: undefined }));
                  }}
                  error={errors.password}
                  hint="At least 8 characters with upper & lowercase letters and a number"
                  required
                />
                <PasswordStrength password={password} />
              </div>

              <PasswordInput
                label="Confirm New Password"
                icon={Lock}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                }}
                error={errors.confirmPassword}
                required
              />

              <Button type="submit" loading={loading} disabled={sessionExpired}>
                {!loading && <KeyRound className="h-4 w-4" />}
                {loading ? 'Updating…' : 'Reset Password'}
              </Button>
            </form>
          )}

          <Link
            to="/login"
            className="mt-5 flex items-center justify-center gap-1.5 text-sm font-medium text-navy-700 transition hover:text-blue-700"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Login
          </Link>
        </div>
      </main>
    </div>
  );
}
