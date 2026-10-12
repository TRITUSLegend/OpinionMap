import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { useAuth } from '../context/auth-context';
import { login as apiLogin, register as apiRegister, wakeServer } from '../api/client';
import { AuthShell } from '../components/auth/AuthShell';
import { Field } from '../components/ui/Field';
import { FormMessage } from '../components/ui/FormMessage';
import { PasswordInput } from '../components/ui/PasswordInput';
import { SubmitButton } from '../components/ui/SubmitButton';
import { useToast } from '../components/ui/toast-context';
import { useFormFields } from '../hooks/useFormFields';
import { useSlowRequestHint } from '../hooks/useSlowRequestHint';
import { describeApiError } from '../lib/api-errors';
import { PASSWORD_MIN_LENGTH, validateEmail, validateFullName, validateNewPassword } from '../lib/validation';

const FIELD_IDS = { fullName: 'signup-name', email: 'signup-email', password: 'signup-password' } as const;

export const Signup = () => {
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<{ text: string; key: number } | null>(null);
  const submittingRef = useRef(false);
  const navigate = useNavigate();
  const { login, clearSession } = useAuth();
  const toast = useToast();
  const slowHint = useSlowRequestHint();
  const form = useFormFields(
    { fullName: '', email: '', password: '' },
    { fullName: validateFullName, email: validateEmail, password: validateNewPassword },
  );

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
    clearSession();
    const { fullName, email, password } = form.values;

    try {
      try {
        await apiRegister({ email, full_name: fullName.trim(), password });
      } catch (err) {
        const { message, fieldErrors } = describeApiError(err, 'register');
        form.setServerErrors({ fullName: fieldErrors.full_name, email: fieldErrors.email, password: fieldErrors.password });
        setFormError({ text: message, key: Date.now() });
        return;
      }

      // /auth/register returns the new user, not a session, so sign in with
      // the same credentials to keep the "sign up and you're in" flow.
      try {
        const formData = new URLSearchParams();
        formData.append('username', email);
        formData.append('password', password);
        const data = await apiLogin(formData);
        login(data.access_token, data.user);
        toast('Account created. Welcome to OpinionMap.');
        navigate('/dashboard');
      } catch {
        navigate('/login', { replace: true, state: { notice: 'Your account was created. Please sign in.' } });
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
      slowHint.stop();
    }
  };

  return (
    <AuthShell
      errorKey={formError?.key}
      title="Create your workspace"
      subtitle="Start mapping opinion with OpinionMap"
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="link">Sign in</Link>
        </>
      }
    >
      {formError && (
        <FormMessage key={formError.key} tone="error" className="mb-5">{formError.text}</FormMessage>
      )}

      <form onSubmit={handleSubmit} noValidate className="auth-form space-y-5">
        <Field id={FIELD_IDS.fullName} label="Full name" error={form.errorFor('fullName')}>
          {(control) => (
            <input {...control} {...form.bind('fullName')} type="text" autoComplete="name" className="input" placeholder="Jane Doe" />
          )}
        </Field>

        <Field id={FIELD_IDS.email} label="Email address" error={form.errorFor('email')}>
          {(control) => (
            <input
              {...control}
              {...form.bind('email')}
              type="email"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              className="input"
              placeholder="you@company.com"
            />
          )}
        </Field>

        <Field
          id={FIELD_IDS.password}
          label="Password"
          error={form.errorFor('password')}
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        >
          {(control) => (
            <PasswordInput {...control} {...form.bind('password')} autoComplete="new-password" />
          )}
        </Field>

        <SubmitButton loading={submitting} loadingLabel="Creating account…" className="w-full mt-2">
          <UserPlus className="w-4 h-4" aria-hidden="true" />
          Create account
        </SubmitButton>

        <p role="status" className="text-xs text-muted text-center min-h-4">
          {slowHint.slow && 'Waking up the server. The first request after a quiet spell can take up to a minute.'}
        </p>
      </form>
    </AuthShell>
  );
};
