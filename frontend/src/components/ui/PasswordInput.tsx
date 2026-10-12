import { useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

/** Password field with a show/hide toggle inside it. */
export const PasswordInput = ({ className = '', ...props }: PasswordInputProps) => {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input {...props} type={visible ? 'text' : 'password'} className={`input pr-11 ${className}`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        // Keep the caret in the field when the toggle is clicked with a mouse;
        // keyboard users can still tab to it.
        onMouseDown={(e) => e.preventDefault()}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-controls={props.id}
        className="icon-btn absolute inset-y-1 right-1 w-9 h-auto"
      >
        {/* Both icons stay mounted and crossfade. */}
        <span className="relative w-4 h-4" aria-hidden="true">
          <Eye className={`absolute inset-0 w-4 h-4 transition-[opacity,scale] duration-[160ms] ${visible ? 'opacity-0 scale-75' : 'opacity-100'}`} />
          <EyeOff className={`absolute inset-0 w-4 h-4 transition-[opacity,scale] duration-[160ms] ${visible ? 'opacity-100' : 'opacity-0 scale-75'}`} />
        </span>
      </button>
    </div>
  );
};
