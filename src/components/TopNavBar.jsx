import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import logoSrc from '../assets/logo.jpeg';

const TopNavBar = () => {
  const location = useLocation();
  
  return (
    <header className="fixed top-0 w-full z-50 bg-[#131314]/90 backdrop-blur-xl shadow-[0_20px_50px_rgba(211,47,47,0.05)]">
      <div className="flex justify-between items-center px-12 py-6 w-full max-w-screen-2xl mx-auto">
        <div className="flex items-center gap-16">
          <Link to="/" className="flex items-center">
            {logoSrc
              ? <img src={logoSrc} alt="RedAutos" className="h-10 w-auto object-contain rounded-lg" />
              : <span className="text-2xl font-black italic tracking-tighter"><span className="text-[#D32F2F]">Red</span><span className="text-[#E5E2E3]">Autos</span></span>
            }
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
              Inventory
            </Link>
            <Link 
              to="/dealerships" 
              className={`font-['Manrope'] tracking-tighter uppercase font-bold text-sm ${
                location.pathname === '/dealerships' 
                  ? 'text-[#FFB3AC] border-b-2 border-[#D32F2F] pb-1' 
                  : 'text-[#E5E2E3] opacity-70 hover:opacity-100 hover:text-[#FFB3AC] transition-all duration-300'
              }`}
            >
              Dealerships
            </Link>
            <Link 
              to="/performance" 
              className="font-['Manrope'] tracking-tighter uppercase font-bold text-sm text-[#E5E2E3] opacity-70 hover:opacity-100 hover:text-[#FFB3AC] transition-all duration-300"
            >
              Performance
            </Link>
            <Link 
              to="/bespoke" 
              className="font-['Manrope'] tracking-tighter uppercase font-bold text-sm text-[#E5E2E3] opacity-70 hover:opacity-100 hover:text-[#FFB3AC] transition-all duration-300"
            >
              Bespoke
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-6">
          <div className="relative hidden lg:block">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#E5E2E3]/50 text-sm">
              search
            </span>
            <input 
              className="bg-[#353436]/20 border border-[#353436]/50 rounded px-9 py-2 text-xs font-bold text-[#E5E2E3] placeholder-[#E5E2E3]/30 focus:outline-none focus:border-[#D32F2F] w-48 transition-all" 
              placeholder="Search Inventory" 
              type="text"
            />
          </div>
          <Link 
            to="/register" 
            className="bg-[#D32F2F] text-white px-8 py-2.5 rounded font-['Manrope'] font-bold uppercase text-[10px] tracking-widest active:scale-95 duration-150 ease-in-out"
          >
            Partner Portal
          </Link>
        </div>
      </div>
      <div className="bg-gradient-to-b from-[#353436] to-transparent h-[1px]"></div>
    </header>
  );
};

export default TopNavBar;
