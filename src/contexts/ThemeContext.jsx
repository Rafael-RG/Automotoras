import React, { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext({ dark: true, toggle: () => {} });

export const ThemeProvider = ({ children }) => {
  const [dark, setDark] = useState(() => {
    try {
      const stored = localStorage.getItem('theme');
      if (stored) return stored === 'dark';
    } catch (_) {}
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch (_) {}
  }, [dark]);

  return (
    <ThemeContext.Provider value={{ dark, toggle: () => setDark(d => !d) }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
