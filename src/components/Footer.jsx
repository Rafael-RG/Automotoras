import React from 'react';

const Footer = () => (
  <footer className="bg-[#0E0E0F] w-full border-t border-[#353436]/30">
    <div className="flex flex-col md:flex-row justify-between items-center px-12 py-12 w-full max-w-screen-2xl mx-auto">
      <div className="mb-6 md:mb-0">
        <p className="font-['Inter'] text-[10px] tracking-[0.1em] uppercase text-[#E5E2E3]/40">
          © 2026 REDAUTOS. TODOS LOS DERECHOS RESERVADOS.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-8">
        <a className="font-['Inter'] text-[10px] tracking-[0.1em] uppercase text-[#E5E2E3]/40 hover:text-[#D32F2F] transition-colors underline-offset-4 hover:underline" href="#">
          Legal
        </a>
        <a className="font-['Inter'] text-[10px] tracking-[0.1em] uppercase text-[#E5E2E3]/40 hover:text-[#D32F2F] transition-colors underline-offset-4 hover:underline" href="#">
          Privacy Policy
        </a>
        <a className="font-['Inter'] text-[10px] tracking-[0.1em] uppercase text-[#E5E2E3]/40 hover:text-[#D32F2F] transition-colors underline-offset-4 hover:underline" href="#">
          Emission Specs
        </a>
        <a className="font-['Inter'] text-[10px] tracking-[0.1em] uppercase text-[#E5E2E3]/40 hover:text-[#D32F2F] transition-colors underline-offset-4 hover:underline" href="#">
          Recall Info
        </a>
        <a className="font-['Inter'] text-[10px] tracking-[0.1em] uppercase text-[#E5E2E3]/40 hover:text-[#D32F2F] transition-colors underline-offset-4 hover:underline" href="#">
          Global Press
        </a>
      </div>
      <div className="flex gap-6 mt-8 md:mt-0">
        <span className="material-symbols-outlined text-[#353436] cursor-pointer hover:text-[#D32F2F] transition-all">
          share
        </span>
        <span className="material-symbols-outlined text-[#353436] cursor-pointer hover:text-[#D32F2F] transition-all">
          mail
        </span>
        <span className="material-symbols-outlined text-[#353436] cursor-pointer hover:text-[#D32F2F] transition-all">
          public
        </span>
      </div>
    </div>
  </footer>
);

export default Footer;
