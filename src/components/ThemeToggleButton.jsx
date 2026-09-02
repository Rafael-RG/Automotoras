import React from 'react';
import { useTheme } from '../contexts/ThemeContext';

const ThemeToggleButton = ({ className = '' }) => {
  const { dark, toggle } = useTheme();

  return (
    <button
      type="button"
      onClick={toggle}
      className={`flex items-center justify-center w-9 h-9 rounded-full text-gray-500 dark:text-[#E5E2E3]/60 hover:text-primary transition-all ${className}`}
      aria-label={dark ? 'Modo claro' : 'Modo oscuro'}
    >
      <span className="material-symbols-outlined !text-[20px]">{dark ? 'light_mode' : 'dark_mode'}</span>
    </button>
  );
};

export default ThemeToggleButton;
