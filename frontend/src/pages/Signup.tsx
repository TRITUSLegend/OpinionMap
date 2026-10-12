import { useState } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import { UserPlus, Loader2 } from 'lucide-react';
import { useAuth } from '../context/auth-context';
import { register as apiRegister } from '../api/client';
import { AuthShell } from '../components/layout/AuthShell';

export const Signup = () => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const data = await apiRegister({
        email,
        full_name: fullName,
        password
      });
      login(data.access_token, data.user);
      navigate('/');
    } catch (err) {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : undefined;
      const message = detail || (err instanceof Error ? err.message : 'Failed to create account');
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Create your workspace"
      subtitle="Start mapping opinion with OpinionMap"
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="link">Sign in</Link>
        </>
      }
    >
      {error && (
        <div className="border border-danger/40 bg-danger/10 text-fg p-3 rounded-md mb-5 text-sm" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="signup-name" className="block text-sm font-medium text-fg mb-1.5">Full name</label>
          <input
            id="signup-name"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="input"
            placeholder="Jane Doe"
            required
          />
        </div>

        <div>
          <label htmlFor="signup-email" className="block text-sm font-medium text-fg mb-1.5">Email address</label>
          <input
            id="signup-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            placeholder="you@company.com"
            required
          />
        </div>

        <div>
          <label htmlFor="signup-password" className="block text-sm font-medium text-fg mb-1.5">Password</label>
          <input
            id="signup-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            required
            minLength={6}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn btn-primary w-full min-h-10 mt-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <UserPlus className="w-4 h-4" aria-hidden="true" />}
          {loading ? 'Creating account...' : 'Create account'}
        </button>
      </form>
    </AuthShell>
  );
};
