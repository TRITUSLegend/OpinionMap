import { useState } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import { LogIn, Loader2, Shield } from 'lucide-react';
import { useAuth } from '../context/auth-context';
import { login as apiLogin, adminLogin } from '../api/client';
import { AuthShell } from '../components/layout/AuthShell';

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAdminLogin, setIsAdminLogin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const formData = new URLSearchParams();
      formData.append('username', email); // OAuth2 requires 'username'
      formData.append('password', password);

      const loginFn = isAdminLogin ? adminLogin : apiLogin;
      const data = await loginFn(formData);
      login(data.access_token, data.user);
      navigate('/');
    } catch (err) {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : undefined;
      const message = detail || (err instanceof Error ? err.message : 'Failed to login');
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to your OpinionMap workspace"
      footer={
        <>
          Don't have an account?{' '}
          <Link to="/signup" className="link">Create workspace</Link>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-1 p-1 mb-6 rounded-md bg-surface-2 border border-border">
        <button
          type="button"
          onClick={() => setIsAdminLogin(false)}
          aria-pressed={!isAdminLogin}
          className={`px-3 py-1.5 rounded-sm text-sm font-medium transition-colors duration-[120ms] ${
            !isAdminLogin ? 'bg-surface text-fg shadow-[0_1px_2px_rgb(0_0_0/0.08)]' : 'text-muted hover:text-fg'
          }`}
        >
          User
        </button>
        <button
          type="button"
          onClick={() => setIsAdminLogin(true)}
          aria-pressed={isAdminLogin}
          className={`px-3 py-1.5 rounded-sm text-sm font-medium transition-colors duration-[120ms] flex items-center justify-center gap-1.5 ${
            isAdminLogin ? 'bg-surface text-fg shadow-[0_1px_2px_rgb(0_0_0/0.08)]' : 'text-muted hover:text-fg'
          }`}
        >
          <Shield className="w-3.5 h-3.5" aria-hidden="true" />
          Admin
        </button>
      </div>

      {error && (
        <div className="border border-danger/40 bg-danger/10 text-fg p-3 rounded-md mb-5 text-sm" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="login-email" className="block text-sm font-medium text-fg mb-1.5">Email address</label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            placeholder={isAdminLogin ? "admin@opinionmap.app" : "you@company.com"}
            required
          />
        </div>

        <div>
          <label htmlFor="login-password" className="block text-sm font-medium text-fg mb-1.5">Password</label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn btn-primary w-full min-h-10 mt-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <LogIn className="w-4 h-4" aria-hidden="true" />}
          {loading ? 'Signing in...' : (isAdminLogin ? 'Sign in as admin' : 'Sign in')}
        </button>
      </form>
    </AuthShell>
  );
};
