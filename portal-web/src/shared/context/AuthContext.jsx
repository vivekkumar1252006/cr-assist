import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [initError, setInitError] = useState(null);

  // Restore the session from the HttpOnly cookie on first load.
  // A timeout guards against a dead server causing an indefinite blank screen.
  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled) {
        setChecking(false);
        setInitError('Could not reach the server. Please check your connection.');
      }
    }, 4000); // 4-second maximum wait

    api
      .get('/auth/me')
      .then((res) => { if (!cancelled) setUser(res.data.user); })
      .catch((err) => {
        if (!cancelled) {
          setUser(null);
          if (!err.response) {
            setInitError('Could not connect to the backend server. Please verify your connection.');
          }
        }
      })
      .finally(() => {
        if (!cancelled) {
          clearTimeout(timeout);
          setChecking(false);
        }
      });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, []);

  const login = useCallback(async (identifier, password, remember, role) => {
    const res = await api.post('/auth/login', { identifier, password, remember, role });
    setUser(res.data.user);
    setInitError(null);
    return res.data.user;
  }, []);

  /** Creates a student account and signs them in immediately. */
  const register = useCallback(async (payload) => {
    const res = await api.post('/auth/register', payload);
    setUser(res.data.user);
    setInitError(null);
    return res.data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setUser(null);
    }
  }, []);

  /** Re-reads the session user (e.g. after a profile name change). */
  const refreshUser = useCallback(async () => {
    try {
      const res = await api.get('/auth/me');
      setUser(res.data.user);
    } catch {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, checking, initError, login, register, logout, refreshUser }),
    [user, checking, initError, login, register, logout, refreshUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
