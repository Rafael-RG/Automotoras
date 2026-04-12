import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import logoSrc from '../assets/Logo.png';

const TopNavBar = () => {
  const location = useLocation();
  
  return (
    <header className="fixed top-0 w-full z-50 bg-[#131314]/90 backdrop-blur-xl shadow-[0_20px_50px_rgba(211,47,47,0.05)] overflow-visible">
      <div className="flex justify-between items-center px-12 py-3 w-full max-w-screen-2xl mx-auto">
        <div className="flex items-center gap-16">
          <Link to="/" className="relative flex items-center group h-14 w-40">
            {logoSrc && (
              <img src={logoSrc} alt="RedAutos" className="absolute top-1/2 left-0 -translate-y-1/2 h-28 w-auto object-contain transition-opacity duration-300 group-hover:opacity-80 z-10" />
            )}
          </Link>
          <nav className="hidden md:flex gap-10">
            <Link 
              to="/" 
              className={`font-['Manrope'] tracking-tighter uppercase font-bold text-sm ${
                location.pathname === '/' 
                  ? 'text-[#FFB3AC] border-b-2 border-[#D32F2F] pb-1' 
                  : 'text-[#E5E2E3] opacity-70 hover:opacity-100 hover:text-[#FFB3AC] transition-all duration-300'
              }`}
            >
              Garage
            </Link>
            <Link 
              to="/dealerships" 
              className={`font-['Manrope'] tracking-tighter uppercase font-bold text-sm ${
                location.pathname === '/dealerships' 
                  ? 'text-[#FFB3AC] border-b-2 border-[#D32F2F] pb-1' 
                  : 'text-[#E5E2E3] opacity-70 hover:opacity-100 hover:text-[#FFB3AC] transition-all duration-300'
              }`}
            >
              Buscar Automotoras
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-6">
        </div>
      </div>
      <div className="bg-gradient-to-b from-[#353436] to-transparent h-[1px]"></div>
    </header>
  );
};

export default TopNavBar;
