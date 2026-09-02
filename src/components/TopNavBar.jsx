import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import logoLight from '../assets/Logo1.svg';
import logoDark from '../assets/Logo2.svg';
import { useTheme } from '../contexts/ThemeContext';
import ThemeToggleButton from './ThemeToggleButton';

const TopNavBar = () => {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const { dark } = useTheme();

  const navLinkClass = (path) =>
    `font-['Manrope'] tracking-tighter uppercase font-bold text-sm ${
      location.pathname === path
        ? 'text-primary border-b-2 border-primary pb-1'
        : 'text-gray-500 dark:text-[#E5E2E3]/70 hover:text-primary transition-all duration-300'
    }`;

  return (
    <header className="fixed top-0 w-full z-50 bg-white/90 dark:bg-[#131314]/90 backdrop-blur-xl shadow-[0_20px_50px_rgba(211,47,47,0.05)] overflow-visible">
      <div className="flex justify-between items-center px-4 md:px-12 py-3 w-full max-w-screen-2xl mx-auto">
        <div className="flex items-center gap-6 md:gap-16">
          <a href="/" className="relative flex items-center group h-14 w-32 md:w-40">
            <img
              src={dark ? logoDark : logoLight}
              alt="RedAutos"
              fetchPriority="high"
              className="absolute top-1/2 left-0 -translate-y-1/2 h-24 md:h-28 w-auto object-contain transition-opacity duration-300 group-hover:opacity-80 z-10"
            />
          </a>
          <nav className="hidden md:flex gap-10">
            <Link to="/" className={navLinkClass('/')}>Garage</Link>
            <Link to="/dealerships" className={navLinkClass('/dealerships')}>Buscar Automotoras</Link>
            <Link to="/sobre-nosotros" className={navLinkClass('/sobre-nosotros')}>Sobre RedAutos</Link>
          </nav>
        </div>

        {/* Theme toggle + hamburger */}
        <div className="flex items-center gap-1">
          <ThemeToggleButton />

          {/* Hamburger button — mobile only */}
          <button
            className="md:hidden flex flex-col gap-1.5 p-2 text-gray-500 dark:text-[#E5E2E3]/70 hover:text-primary transition-colors"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Menú"
          >
            <span className={`block h-0.5 w-5 bg-current transition-all duration-300 ${menuOpen ? 'rotate-45 translate-y-2' : ''}`} />
            <span className={`block h-0.5 w-5 bg-current transition-all duration-300 ${menuOpen ? 'opacity-0' : ''}`} />
            <span className={`block h-0.5 w-5 bg-current transition-all duration-300 ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <nav className="md:hidden bg-white dark:bg-[#131314] border-t border-gray-200 dark:border-[#353436]/50 flex flex-col gap-0">
          <Link to="/" onClick={() => setMenuOpen(false)}
            className={`px-6 py-4 font-['Manrope'] uppercase font-bold text-sm border-b border-gray-100 dark:border-[#353436]/30 ${location.pathname === '/' ? 'text-primary' : 'text-gray-500 dark:text-[#E5E2E3]/70'}`}>
            Garage
          </Link>
          <Link to="/dealerships" onClick={() => setMenuOpen(false)}
            className={`px-6 py-4 font-['Manrope'] uppercase font-bold text-sm border-b border-gray-100 dark:border-[#353436]/30 ${location.pathname === '/dealerships' ? 'text-primary' : 'text-gray-500 dark:text-[#E5E2E3]/70'}`}>
            Buscar Automotoras
          </Link>
          <Link to="/sobre-nosotros" onClick={() => setMenuOpen(false)}
            className={`px-6 py-4 font-['Manrope'] uppercase font-bold text-sm border-b border-gray-100 dark:border-[#353436]/30 ${location.pathname === '/sobre-nosotros' ? 'text-primary' : 'text-gray-500 dark:text-[#E5E2E3]/70'}`}>
            Sobre RedAutos
          </Link>
          <Link to="/login" onClick={() => setMenuOpen(false)}
            className="px-6 py-4 font-['Manrope'] uppercase font-bold text-sm text-gray-400 dark:text-[#E5E2E3]/40 flex items-center gap-2">
            <span className="material-symbols-outlined !text-sm">lock</span>
            Acceso Automotoras
          </Link>
        </nav>
      )}

      <div className="bg-gradient-to-b from-gray-200 dark:from-[#353436] to-transparent h-[1px]" />
    </header>
  );
};

export default TopNavBar;
