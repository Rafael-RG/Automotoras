import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

const RegisterScreen = () => {
  const navigate = useNavigate();
  
  const handleSubmit = (e) => {
    e.preventDefault();
    navigate('/admin');
  };

  return (
    <div className="bg-metallic-black text-white min-h-screen">
      <nav className="fixed top-0 w-full z-50 bg-metallic-black/80 backdrop-blur-xl border-b border-white/5 h-20 flex items-center px-8">
        <Link to="/" className="text-2xl font-black italic tracking-tighter">Showroom Elite</Link>
      </nav>
      <main className="flex pt-20 h-[calc(100vh-80px)]">
        <section className="hidden lg:flex lg:w-1/2 apex-gradient relative overflow-hidden items-center justify-center p-16">
          <div className="absolute inset-0 opacity-30">
            <img 
              className="w-full h-full object-cover grayscale" 
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuD3qofB5G2G1EIAsqsmJ68e-VdFFJfYDOvb1xEsNhwbWL2wxS87cmgHXxAI0MGbmM_jEdhP_iqMR9cHSa7G88U8DwrD8TWRm7sRjTMnnvzp1FG53r2s-bUhyPvWQrWd3hhXiR6FwcFSOFzFlt8_9_zTA19BgHKNkmq4rcxIdBu7OQhF32BrlLHcl0L3-XsOTO0exAnRQHfknCf5Wx54q1dI08Uyq2_rzaULs9t6O5RmLQaeCRintOWWnMOJj9pgAvQ608vBsZtgv9c" 
              alt="Background"
            />
          </div>
          <div className="relative z-10 max-w-xl">
            <h1 className="font-headline text-5xl font-extrabold leading-tight mb-8">
              Eleva tu Inventario al <span className="text-accent-red">Siguiente Nivel.</span>
            </h1>
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="w-12 h-12 bg-white/5 flex items-center justify-center rounded">
                  <span className="material-symbols-outlined">analytics</span>
                </div>
                <div>
                  <h3 className="font-bold">Panel de Control Avanzado</h3>
                  <p className="text-slate-400 text-sm">Gestione toda su flota con métricas en tiempo real.</p>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section className="w-full lg:w-1/2 flex flex-col justify-center p-8 md:p-16 border-l border-white/5 overflow-y-auto">
          <div className="max-w-md mx-auto w-full">
            <h2 className="text-4xl font-extrabold mb-8">Unirse a la Red</h2>
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Nombre de la Automotora</label>
                <input 
                  className="w-full bg-surface-container border-white/5 py-3.5 text-sm text-white" 
                  placeholder="Ej: Elite Motors" 
                  required 
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Email Corporativo</label>
                <input 
                  className="w-full bg-surface-container border-white/5 py-3.5 text-sm text-white" 
                  placeholder="contacto@empresa.com" 
                  type="email" 
                  required 
                />
              </div>
              <button 
                type="submit" 
                className="w-full apex-action-gradient text-white font-extrabold py-4 rounded-sm tracking-wider uppercase text-xs"
              >
                Crear Cuenta
              </button>
            </form>
            <p className="mt-8 text-center text-slate-500">
              ¿Ya tiene una cuenta? <Link to="/admin" className="text-secondary font-bold">Inicie sesión aquí</Link>
            </p>
          </div>
        </section>
      </main>
    </div>
  );
};

export default RegisterScreen;
