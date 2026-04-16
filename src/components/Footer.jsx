import React from 'react';
import logoSrc from '../assets/Logo.png';

const Footer = () => (
  <footer className="bg-[#0E0E0F] w-full border-t border-[#353436]/30">
    <div className="px-4 md:px-12 py-10 w-full max-w-screen-2xl mx-auto">

      {/* Top row */}
      <div className="flex flex-col md:flex-row justify-between items-start gap-10 mb-10">

        {/* Brand */}
        <div className="flex flex-col gap-3">
          <img src={logoSrc} alt="RedAutos" className="h-16 w-auto object-contain object-left" />
          <p className="text-[#E5E2E3]/30 text-xs max-w-xs leading-relaxed">
            La plataforma para encontrar tu próximo auto. Conectamos compradores con automotoras de confianza.
          </p>
        </div>

        {/* Links */}
        <div className="flex flex-wrap gap-8 md:gap-16">
          <div className="flex flex-col gap-3">
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-primary mb-1">Navegación</p>
            <a href="/" className="text-[#E5E2E3]/40 hover:text-[#E5E2E3] text-xs transition-colors">Garage</a>
            <a href="/dealerships" className="text-[#E5E2E3]/40 hover:text-[#E5E2E3] text-xs transition-colors">Buscar Automotoras</a>
            <a href="/sobre-nosotros" className="text-[#E5E2E3]/40 hover:text-[#E5E2E3] text-xs transition-colors">Sobre RedAutos</a>
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-primary mb-1">Legal</p>
            <a href="/privacidad" className="text-[#E5E2E3]/40 hover:text-[#E5E2E3] text-xs transition-colors">Privacidad</a>
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-primary mb-1">Automotoras</p>
            <a href="/unirse" className="text-[#E5E2E3]/40 hover:text-[#E5E2E3] text-xs transition-colors">Sumá tu automotora</a>
            <a href="/sobre-nosotros" className="text-[#E5E2E3]/40 hover:text-[#E5E2E3] text-xs transition-colors">Sobre RedAutos</a>
            <a href="/login" className="text-[#E5E2E3]/40 hover:text-[#E5E2E3] text-xs transition-colors flex items-center gap-1.5">
              <span className="material-symbols-outlined !text-sm">lock</span>
              Acceso Administrador
            </a>
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-primary mb-1">Desarrollado por</p>
            <a
              href="https://www.instagram.com/kiwibyte.uy/?hl=es"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#E5E2E3]/40 hover:text-primary text-xs font-bold transition-colors flex items-center gap-2"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="opacity-60">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
              KiwiByte
            </a>
            <a
              href="mailto:kiwibyte.studio@gmail.com"
              className="text-[#E5E2E3]/30 hover:text-primary text-[10px] transition-colors"
            >
              kiwibyte.studio@gmail.com
            </a>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-[#353436] via-[#353436]/50 to-transparent mb-6" />

      {/* Bottom row */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-2">
        <p className="text-[#E5E2E3]/45 text-[10px] tracking-[0.15em] uppercase">
          © 2026 RedAutos. Todos los derechos reservados.
        </p>
      </div>

    </div>
  </footer>
);

export default Footer;


