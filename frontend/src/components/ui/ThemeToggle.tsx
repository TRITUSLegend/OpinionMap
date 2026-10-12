import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../context/theme-context';

export const ThemeToggle = ({ className = '' }: { className?: string }) => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Dark theme"
      aria-pressed={isDark}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className={`icon-btn ${className}`}
    >
      {isDark ? <Moon className="w-[18px] h-[18px]" aria-hidden="true" /> : <Sun className="w-[18px] h-[18px]" aria-hidden="true" />}
    </button>
  );
};
