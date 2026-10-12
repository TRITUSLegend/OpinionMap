import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation, useSearchParams, Link } from 'react-router-dom';
import { LogIn, Shield } from 'lucide-react';
import { useAuth } from '../context/auth-context';
import { login as apiLogin, adminLogin, wakeServer } from '../api/client';
import { AuthShell } from '../components/auth/AuthShell';
import { Field } from '../components/ui/Field';
import { FormMessage } from '../components/ui/FormMessage';
import { PasswordInput } from '../components/ui/PasswordInput';
import { SubmitButton } from '../components/ui/SubmitButton';
import { useToast } from '../components/ui/toast-context';
import { useFormFields } from '../hooks/useFormFields';
import { useSlowRequestHint } from '../hooks/useSlowRequestHint';
import { describeApiError } from '../lib/api-errors';
import { validateCurrentPassword, validateEmail } from '../lib/validation';

const FIELD_IDS = { email: 'login-email', password: 'login-password' } as const;

export const Login = () => {
  const [isAdminLogin, setIsAdminLogin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Keyed so a repeated identical error still re-mounts and is announced again.
  const [formError, setFormError] = useState<{ text: string; key: number } | null>(null);
  const submittingRef = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { login, clearSession } = useAuth();
  const toast = useToast();
  const slowHint = useSlowRequestHint();
  const form = useFormFields(
    { email: '', password: '' },
    { email: validateEmail, password: validateCurrentPassword },
  );

  const notice = (location.state as { notice?: string } | null)?.notice
    ?? (searchParams.get('session') === 'expired' ? 'Your session has ended. Please sign in again.' : null);

  // Start waking a sleeping backend while the user is still typing.
  useEffect(() => {
    wakeServer();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    setFormError(null);

    const invalid = form.validateAll();
    if (invalid) {
      document.getElementById(FIELD_IDS[invalid])?.focus();
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    slowHint.start();
    // Whatever happens next, a failed attempt must never leave an earlier
    // session signed in.
    clearSession();

    try {
      const formData = new URLSearchParams();
      formData.append('username', form.values.email); // OAuth2 requires 'username'
      formData.append('password', form.values.password);

      const loginFn = isAdminLogin ? adminLogin : apiLogin;
      const data = await loginFn(formData);
      login(data.access_token, data.user);
      toast(`Signed in as ${data.user.full_name || data.user.email}`);
      navigate('/dashboard');
    } catch (err) {
      const { message, fieldErrors } = describeApiError(err, isAdminLogin ? 'admin-login' : 'login');
      form.setServerErrors({ email: fieldErrors.username, password: fieldErrors.password });
      setFormError({ text: message, key: Date.now() });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
      slowHint.stop();
    }
  };

  const switchMode = (admin: boolean) => {
    setIsAdminLogin(admin);
    setFormError(null);
  };

  return (
    <AuthShell
      errorKey={formError?.key}
      title="Welcome back"
      subtitle="Sign in to your OpinionMap workspace"
      footer={
        <>
          Don't have an account?{' '}
          <Link to="/signup" className="link">Create workspace</Link>
        </>
      }
    >
      <div className="auth-segment" role="group" aria-label="Account type" data-active={isAdminLogin ? 'admin' : 'user'}>
        <span className="auth-segment-indicator" aria-hidden="true" />
        <button
          type="button"
          onClick={() => switchMode(false)}
          aria-pressed={!isAdminLogin}
          className="auth-segment-option"
        >
          User
        </button>
        <button
          type="button"
          onClick={() => switchMode(true)}
          aria-pressed={isAdminLogin}
          className="auth-segment-option"
        >
          <Shield className="w-3.5 h-3.5" aria-hidden="true" />
          Admin
        </button>
      </div>

      {formError ? (
        <FormMessage key={formError.key} tone="error" className="mb-5">{formError.text}</FormMessage>
      ) : notice ? (
        <FormMessage tone="info" className="mb-5">{notice}</FormMessage>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className="auth-form space-y-5">
        <Field id={FIELD_IDS.email} label="Email address" error={form.errorFor('email')}>
          {(control) => (
            <input
              {...control}
              {...form.bind('email')}
              type="email"
              autoComplete="username"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              className="input"
              placeholder={isAdminLogin ? 'admin@company.com' : 'you@company.com'}
            />
          )}
        </Field>

        <Field id={FIELD_IDS.password} label="Password" error={form.errorFor('password')}>
          {(control) => (
            <PasswordInput {...control} {...form.bind('password')} autoComplete="current-password" />
          )}
        </Field>

        <SubmitButton loading={submitting} loadingLabel="Signing in…" className="w-full mt-2">
          <LogIn className="w-4 h-4" aria-hidden="true" />
          {isAdminLogin ? 'Sign in as admin' : 'Sign in'}
        </SubmitButton>

        <p role="status" className="text-xs text-muted text-center min-h-4">
          {slowHint.slow && 'Waking up the server. The first sign-in after a quiet spell can take up to a minute.'}
        </p>
      </form>
    </AuthShell>
  );
};
