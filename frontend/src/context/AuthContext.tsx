import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext, type User } from './auth-context';

/**
 * Read a previously persisted session from localStorage.
 *
 * Runs once as lazy state initialisation rather than in an effect, so `user` and
 * `token` are already correct on the very first render. (Restoring in an effect
 * left a render where `isAuthenticated` was true but `user` was still null.)
 * A stale or corrupt entry is cleared rather than trusted.
 */
const readStoredSession = (): { user: User | null; token: string | null } => {
  const storedToken = localStorage.getItem('token');
  const storedUser = localStorage.getItem('user');

  if (storedToken && storedUser) {
    try {
      return { user: JSON.parse(storedUser) as User, token: storedToken };
    } catch {
      // Corrupt payload — fall through and clear it
    }
  }

  localStorage.removeItem('token');
  localStorage.removeItem('user');
  return { user: null, token: null };
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [initialSession] = useState(readStoredSession);
  const [user, setUser] = useState<User | null>(initialSession.user);
  const [token, setToken] = useState<string | null>(initialSession.token);
  const navigate = useNavigate();

  const login = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
};
