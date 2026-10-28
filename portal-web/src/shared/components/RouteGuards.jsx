import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

function FullPageSpinner() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#EEF6FF]">
      <Loader2 className="h-8 w-8 animate-spin text-[#1877E8]" aria-label="Loading" />
    </div>
  );
}

function FullPageError({ message }) {
  return (
    <div className="grid min-h-screen place-items-center bg-[#EEF6FF] p-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <p className="max-w-xs text-sm text-[#3E5276]">{message}</p>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 rounded-xl bg-[#102B60] px-5 py-2 text-sm font-semibold text-white hover:bg-[#1877E8] transition-colors"
        >
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </div>
    </div>
  );
}

/** Requires a session; with `roles`, also requires one of those roles. */
export function ProtectedRoute({ roles }) {
  const { user, checking, initError } = useAuth();
  const location = useLocation();
  if (checking) return <FullPageSpinner />;
  if (initError) return <FullPageError message={initError} />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

/** Login/register pages: send already-authenticated users to their dashboard. */
export function GuestRoute() {
  const { user, checking } = useAuth();
  if (checking) return <FullPageSpinner />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
