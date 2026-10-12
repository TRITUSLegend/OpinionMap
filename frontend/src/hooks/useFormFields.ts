import { useState, type ChangeEvent } from 'react';
import type { Validator } from '../lib/validation';

type Values = Record<string, string>;

/**
 * Minimal form state: values, validation shown on blur or submit, and errors
 * returned by the server (which clear as soon as the field is edited).
 */
export function useFormFields<T extends Values>(initial: T, validators: Partial<Record<keyof T, Validator>>) {
  const [values, setValues] = useState<T>(initial);
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});
  const [showAll, setShowAll] = useState(false);
  const [serverErrors, setServerErrors] = useState<Partial<Record<keyof T, string>>>({});

  const errorFor = (name: keyof T): string | undefined =>
    serverErrors[name] ?? (touched[name] || showAll ? validators[name]?.(values[name]) : undefined);

  const bind = (name: keyof T) => ({
    name: String(name),
    value: values[name],
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      const { value } = e.target;
      setValues((current) => ({ ...current, [name]: value }));
      setServerErrors((current) => (current[name] ? { ...current, [name]: undefined } : current));
    },
    onBlur: () => setTouched((current) => ({ ...current, [name]: true })),
  });

  /** Show every field's error. Returns the first invalid field, or null when valid. */
  const validateAll = (): keyof T | null => {
    setShowAll(true);
    const names = Object.keys(validators) as (keyof T)[];
    return names.find((name) => validators[name]?.(values[name])) ?? null;
  };

  return { values, bind, errorFor, validateAll, setServerErrors };
}
