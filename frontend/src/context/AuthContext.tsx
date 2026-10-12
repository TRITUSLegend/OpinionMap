import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { AuthContext, type User } from './auth-context';
import { fetchMe } from '../api/client';

const isUser = (value: unknown): value is User => {
  const user = value as Partial<User> | null;
  return !!user && typeof user.id === 'string' && typeof user.email === 'string' && typeof user.role === 'string';
};

/**
 * Expiry (seconds since epoch) read from a JWT payload, or null if the value
 * isn't a readable JWT. This is not a signature check; the server does that.
 * It only lets the client drop a token that is malformed or already expired
 * before rendering anything with it.
 */
const readTokenExpiry = (token: string): number | null => {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
};

const clearStoredSession = () => {
  try {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  } catch {
    // Storage unavailable: nothing to clear.
  }
};

/**
 * Read a previously persisted session from localStorage.
 *
 * Runs once as lazy state initialisation rather than in an effect, so `user` and
 * `token` are already correct on the very first render. (Restoring in an effect
 * left a render where `isAuthenticated` was true but `user` was still null.)
 * A stale, expired or corrupt entry is cleared rather than trusted.
 */
const readStoredSession = (): { user: User | null; token: string | null } => {
  try {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    if (storedToken && storedUser) {
      const expiry = readTokenExpiry(storedToken);
      const user: unknown = JSON.parse(storedUser);
      if (expiry !== null && expiry * 1000 > Date.now() && isUser(user)) {
        return { user, token: storedToken };
      }
    }
  } catch {
    // Corrupt payload or storage unavailable: fall through and clear it
  }

  clearStoredSession();
  return { user: null, token: null };
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [initialSession] = useState(readStoredSession);
  const [user, setUser] = useState<User | null>(initialSession.user);
  const [token, setToken] = useState<string | null>(initialSession.token);
  const navigate = useNavigate();
  // Token already confirmed by the server: issued by a login in this tab, or
  // checked with /auth/me below.
  const verifiedToken = useRef<string | null>(null);

  const clearSession = useCallback(() => {
    verifiedToken.current = null;
    setToken(null);
    setUser(null);
    clearStoredSession();
  }, []);

  // A restored session renders immediately (no loading flash, and it keeps
  // working through a slow cold start), then is confirmed with the server. A
  // 401 ends it; network errors leave it alone.
  useEffect(() => {
    if (!token || verifiedToken.current === token) return;
    let cancelled = false;
    fetchMe()
      .then((freshUser) => {
        if (cancelled || !isUser(freshUser)) return;
        verifiedToken.current = token;
        setUser(freshUser); // picks up role or name changes since the last login
        localStorage.setItem('user', JSON.stringify(freshUser));
      })
      .catch((err) => {
        // On app pages the API client's 401 handler already clears storage and
        // redirects to /login; on the auth pages it doesn't, so drop the state here.
        if (cancelled || !axios.isAxiosError(err) || err.response?.status !== 401) return;
        if (['/login', '/signup'].includes(window.location.pathname)) clearSession();
      });
    return () => { cancelled = true; };
  }, [token, clearSession]);

  const login = (newToken: string, newUser: User) => {
    verifiedToken.current = newToken;
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
  };

  const logout = () => {
    clearSession();
    navigate('/login');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, clearSession, isAuthenticated: !!token && !!user }}>
      {children}
    </AuthContext.Provider>
  );
};
