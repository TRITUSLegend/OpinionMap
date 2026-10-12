import axios from 'axios';

export type ErrorContext = 'login' | 'admin-login' | 'register' | 'workflow';

export interface ApiErrorInfo {
  /** Human-readable summary for the form-level banner. */
  message: string;
  /** Per-field messages from a 422, keyed by the API field name. */
  fieldErrors: Record<string, string>;
}

interface ValidationIssue {
  loc?: (string | number)[];
  msg?: string;
}

// FastAPI 422 bodies: {"detail": [{"loc": ["body", "email"], "msg": "Value error, ..."}]}
const readFieldErrors = (detail: unknown): Record<string, string> => {
  if (!Array.isArray(detail)) return {};
  const errors: Record<string, string> = {};
  for (const issue of detail as ValidationIssue[]) {
    const field = issue.loc?.[issue.loc.length - 1];
    if (typeof field === 'string' && issue.msg && !errors[field]) {
      const text = issue.msg.replace(/^Value error, /, '');
      errors[field] = text.endsWith('.') ? text : `${text}.`;
    }
  }
  return errors;
};

/** Map any API failure to a message a person can act on. */
export const describeApiError = (err: unknown, context: ErrorContext): ApiErrorInfo => {
  const none = {};
  if (!axios.isAxiosError(err)) {
    return { message: 'Something went wrong. Please try again.', fieldErrors: none };
  }
  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
    return {
      message: 'The server took too long to respond. It may still be starting up, so please try again in a moment.',
      fieldErrors: none,
    };
  }
  if (!err.response) {
    return { message: "Can't reach the server. Check your connection and try again.", fieldErrors: none };
  }

  const { status, data } = err.response;
  const detail: unknown = data?.detail;
  const isAuthForm = context === 'login' || context === 'admin-login';

  switch (status) {
    case 401:
      return {
        message: isAuthForm ? 'Invalid email or password.' : 'Your session has expired. Please sign in again.',
        fieldErrors: none,
      };
    case 403:
      return {
        message: context === 'admin-login'
          ? "This account doesn't have admin access. Use the User tab to sign in."
          : "You don't have permission to do that.",
        fieldErrors: none,
      };
    case 409:
      return { message: 'An account with this email already exists. Try signing in instead.', fieldErrors: none };
    case 422: {
      const fieldErrors = readFieldErrors(detail);
      return {
        message: Object.keys(fieldErrors).length > 0 ? 'Please fix the highlighted fields.' : 'Some of the details entered are not valid.',
        fieldErrors,
      };
    }
    case 429:
      return { message: 'Too many attempts. Please wait a moment and try again.', fieldErrors: none };
  }

  if (status === 400 && context === 'register' && detail === 'Email already registered') {
    return { message: 'An account with this email already exists. Try signing in instead.', fieldErrors: none };
  }
  if (status >= 500) {
    return { message: 'Something went wrong on our side. Please try again in a moment.', fieldErrors: none };
  }
  return {
    message: typeof detail === 'string' && detail ? detail : 'Something went wrong. Please try again.',
    fieldErrors: none,
  };
};
