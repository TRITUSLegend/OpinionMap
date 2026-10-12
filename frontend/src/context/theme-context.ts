import { createContext, useContext, useMemo } from 'react';

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'theme';

export interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export interface ChartColors {
  positive: string;
  neutral: string;
  negative: string;
  grid: string;
  axis: string;
  tick: string;
  surface: string;
}

const readChartColors = (theme: Theme): ChartColors & { theme: Theme } => {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(`--${name}`).trim();
  return {
    theme,
    positive: token('positive'),
    neutral: token('neutral'),
    negative: token('negative'),
    grid: token('chart-grid'),
    axis: token('chart-axis'),
    tick: token('subtle'),
    surface: token('surface'),
  };
};

/**
 * Concrete colour values for Recharts, read from the CSS design tokens.
 *
 * SVG presentation attributes can't be relied on to resolve var(), so charts get
 * resolved hex values instead. They are re-read whenever the theme changes;
 * ThemeProvider switches the <html> class before updating state, so the
 * computed values are already current on that render.
 */
export const useChartColors = (): ChartColors => {
  const { theme } = useTheme();
  return useMemo(() => readChartColors(theme), [theme]);
};
