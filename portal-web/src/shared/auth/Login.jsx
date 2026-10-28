import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  LoaderCircle,
  UserRound,
} from 'lucide-react';
import { useAuth } from '@shared/context/AuthContext.jsx';
import { parseApiError } from '@shared/lib/api.js';

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="login-google-mark">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export default function Login() {
  const { login, initError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const notice = location.state?.notice;

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    const cleanIdentifier = identifier.trim();

    if (!cleanIdentifier) {
      setError('Enter your ID, email address, or enrollment number.');
      return;
    }
    if (!password) {
      setError('Enter your password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const user = await login(cleanIdentifier, password, true);

      if (user.role === 'admin') {
        navigate('/admin', { replace: true });
        return;
      }
      if (user.role === 'faculty') {
        navigate('/portal-unavailable', { replace: true });
        return;
      }

      const from = location.state?.from;
      const studentDestination = from?.startsWith('/student') ? from : '/student/dashboard';
      navigate(studentDestination, { replace: true });
    } catch (requestError) {
      const { code, message } = parseApiError(requestError);
      if (code === 'DATABASE_UNAVAILABLE' && import.meta.env.DEV) {
        setError('The login service cannot reach MySQL. Start MySQL in XAMPP, then try again.');
      } else if (code === 'DATABASE_UNAVAILABLE') {
        setError('Sign-in is temporarily unavailable. Please try again shortly.');
      } else {
        setError(message || 'We could not sign you in. Check your details and try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <main className="login-main">
        <div className="login-card">
          <div className="login-card-heading">
            <span className="login-card-kicker">STUDENT PORTAL</span>
            <h2>Welcome Back</h2>
            <p>Login to your account</p>
          </div>

          {notice?.message && !error && (
            <div className="login-alert login-alert-success" role="status">
              <span>{notice.message}</span>
            </div>
          )}
          {initError && !error && !notice?.message && (
            <div className="login-alert" role="alert">
              <AlertCircle aria-hidden="true" />
              <span>{initError}</span>
            </div>
          )}
          {error && (
            <div className="login-alert" role="alert">
              <AlertCircle aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <form className="login-form" onSubmit={handleSubmit}>
            <label className="login-input-wrap" htmlFor="login-identifier">
              <UserRound aria-hidden="true" />
              <input
                id="login-identifier"
                name="identifier"
                type="text"
                value={identifier}
                onChange={(event) => {
                  setIdentifier(event.target.value);
                  setError('');
                }}
                placeholder="Enter your ID"
                autoComplete="username"
                autoFocus
                required
                aria-label="ID, email, or enrollment number"
              />
            </label>
            <p className="login-field-hint">Use your email or enrollment number</p>

            <label className="login-input-wrap" htmlFor="login-password">
              <LockKeyhole aria-hidden="true" />
              <input
                id="login-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError('');
                }}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
                aria-label="Password"
              />
              <button
                className="login-password-toggle"
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              </button>
            </label>

            <button className="login-submit" type="submit" disabled={loading}>
              {loading ? (
                <>
                  <LoaderCircle className="login-spinner" aria-hidden="true" />
                  <span>Logging in...</span>
                </>
              ) : (
                <>
                  <ArrowRight aria-hidden="true" />
                  <span>Login</span>
                </>
              )}
            </button>
          </form>

          <div className="login-links">
            <Link to="/register">Create Account</Link>
            <Link to="/forgot-password">Forgot Password?</Link>
          </div>

          <div className="login-divider"><span>OR</span></div>

          <button
            className="login-google"
            type="button"
            disabled
            aria-describedby="google-sign-in-status"
            title="Google sign-in has not been configured"
          >
            <GoogleMark />
            <span>Login with Google</span>
          </button>
          <p className="login-google-status" id="google-sign-in-status">
            Google sign-in isn’t configured for this portal yet.
          </p>

          <p className="login-card-footer">Secure <i /> Simple <i /> Student Focused</p>
        </div>
      </main>
    </div>
  );
}
