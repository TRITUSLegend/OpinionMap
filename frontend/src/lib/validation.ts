// Client-side checks. They mirror the backend rules so users see the same
// limits before submitting: backend/app/schemas/user.py (UserCreate) and
// backend/app/schemas/workflow.py (WorkflowBase.validate_query).

export const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72; // bcrypt's input limit
export const QUERY_MIN_LENGTH = 2;
export const QUERY_MAX_LENGTH = 500;

export type Validator = (value: string) => string | undefined;

export const validateEmail: Validator = (value) => {
  if (!value.trim()) return 'Enter your email address.';
  if (!EMAIL_PATTERN.test(value.trim())) return 'Enter a valid email address, like name@company.com.';
  return undefined;
};

export const validateCurrentPassword: Validator = (value) =>
  value ? undefined : 'Enter your password.';

export const validateNewPassword: Validator = (value) => {
  if (!value) return 'Create a password.';
  if (value.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (new TextEncoder().encode(value).length > PASSWORD_MAX_BYTES) {
    return 'That password is too long. Use at most 72 characters.';
  }
  return undefined;
};

export const validateFullName: Validator = (value) =>
  value.trim() ? undefined : 'Enter your name.';

export const validateQuery: Validator = (value) => {
  const query = value.trim();
  if (!query) return 'Enter a product or topic to research.';
  if (query.length < QUERY_MIN_LENGTH) return `Enter at least ${QUERY_MIN_LENGTH} characters.`;
  if (query.length > QUERY_MAX_LENGTH) return `Keep the query under ${QUERY_MAX_LENGTH} characters.`;
  return undefined;
};
