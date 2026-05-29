import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Bot, LogIn, Loader2, Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { login as apiLogin, adminLogin } from '../api/client';

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
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
      <div className="glass-card max-w-md w-full p-8 rounded-2xl animate-fade-in relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex flex-col items-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-accent p-0.5 mb-4">
              <div className="w-full h-full bg-[#0a0a0a] rounded-xl flex items-center justify-center">
                <Bot className="w-8 h-8 text-accent" />
              </div>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Welcome Back</h1>
            <p className="text-gray-400 mt-2">Log in to your OpinionMap workspace</p>
          </div>

          <div className="flex justify-center mb-6">
            <div className="bg-white/5 p-1 rounded-xl flex items-center">
              <button
                type="button"
                onClick={() => setIsAdminLogin(false)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  !isAdminLogin ? 'bg-white/10 text-white shadow-sm' : 'text-gray-400 hover:text-white'
                }`}
              >
                User
              </button>
              <button
                type="button"
                onClick={() => setIsAdminLogin(true)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                  isAdminLogin ? 'bg-white/10 text-white shadow-sm' : 'text-gray-400 hover:text-white'
                }`}
              >
                <Shield className="w-4 h-4" />
                Admin
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl mb-6 text-sm text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent transition-colors"
                placeholder={isAdminLogin ? "admin@OpinionMap.ai" : "user@example.com"}
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent transition-colors"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent hover:bg-accent-hover text-black font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2 mt-6"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
              {loading ? 'Authenticating...' : (isAdminLogin ? 'Sign In as Admin' : 'Sign In')}
            </button>
          </form>

          <p className="text-center text-gray-400 mt-6 text-sm">
            Don't have an account?{' '}
            <Link to="/signup" className="text-accent hover:text-white transition-colors font-medium">
              Create workspace
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};
