import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { Workflows } from './pages/Workflows';
import { Reports } from './pages/Reports';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { Users } from './pages/Users';
import { Settings } from './pages/Settings';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/auth-context';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './components/ui/Toast';

// Recharts is only used by the dashboard, so it loads on demand instead of
// being part of the bundle every page (including login) downloads.
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));

// The public landing page is its own chunk, with its own CSS. Nothing in the
// app imports from landing/, so it can never weigh on the app itself.
const Landing = lazy(() => import('./landing/Landing'));

// Ask AI is its own chunk too, with its own CSS.
const AskAi = lazy(() => import('./features/ask-ai/AskAi'));

const DashboardFallback = () => (
  <div className="space-y-8" role="status" aria-label="Loading dashboard">
    <div className="skeleton h-8 w-72 max-w-full" />
    <div className="skeleton h-[420px] rounded-lg" />
  </div>
);

// The stored session is validated before first render (shape and expiry) and
// confirmed with /auth/me by AuthProvider; any 401 ends it.
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

// UX only: the API enforces roles itself (403 for non-admins).
const RequireRole = ({ role, children }: { role: string; children: React.ReactNode }) => {
  const { user } = useAuth();
  if (user?.role !== role) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
};

function App() {
  return (
    <ThemeProvider>
    <ToastProvider>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Suspense fallback={null}><Landing /></Suspense>} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/dashboard" element={<Suspense fallback={<DashboardFallback />}><Dashboard /></Suspense>} />
            <Route path="/workflows" element={<Workflows />} />
            <Route path="/workflows/:workflowId/ask" element={<Suspense fallback={<div className="skeleton h-[420px] rounded-lg" role="status" aria-label="Loading Ask AI" />}><AskAi /></Suspense>} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/users" element={<RequireRole role="admin"><Users /></RequireRole>} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
    </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
