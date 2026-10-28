import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, getErrorMessage } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  const checkAuth = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get('token');
      if (urlToken) {
        localStorage.setItem('sa_token', urlToken);
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
      }

      const res = await api.get('/auth/me');
      if (res.data?.user?.role === 'admin') {
        setUser(res.data.user);
        setAuthError(null);
      } else {
        localStorage.removeItem('sa_token');
        await api.post('/auth/logout').catch(() => {});
        setUser(null);
        setAuthError('Access restricted. Admin credentials required.');
      }
    } catch {
      localStorage.removeItem('sa_token');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();

    const handleUnauthorized = () => {
      localStorage.removeItem('sa_token');
      setUser(null);
      setAuthError('Session expired. Please log in again.');
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  const login = async (identifier, password, remember = true) => {
    setAuthError(null);
    try {
      const res = await api.post('/auth/login', {
        identifier: identifier.trim(),
        password,
        remember,
        role: 'admin',
      });

      const loggedUser = res.data?.user;
      if (loggedUser?.role !== 'admin') {
        await api.post('/auth/logout').catch(() => {});
        throw new Error('Access denied. This portal is strictly for College Administrators.');
      }

      if (res.data?.token) {
        localStorage.setItem('sa_token', res.data.token);
      }

      setUser(loggedUser);
      return loggedUser;
    } catch (err) {
      const msg = getErrorMessage(err);
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (_) {
      // Clear local session anyway
    } finally {
      localStorage.removeItem('sa_token');
      setUser(null);
      setAuthError(null);
      window.location.href = 'http://localhost:5173/login?role=admin';
    }
  };

  const refreshUser = async () => {
    try {
      const res = await api.get('/auth/me');
      if (res.data?.user?.role === 'admin') {
        setUser(res.data.user);
      }
    } catch (_) {}
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        authError,
        isAuthenticated: Boolean(user && user.role === 'admin'),
        login,
        logout,
        refreshUser,
        setAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
