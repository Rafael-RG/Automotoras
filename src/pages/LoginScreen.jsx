import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import logoSrc from '../assets/Logo.png';
import { loginDealership } from '../services/api';

const LoginScreen = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Por favor completá todos los campos.');
      return;
    }

    setLoading(true);
    try {
      const data = await loginDealership(email, password);
      localStorage.setItem('adminDealershipId', data.dealershipId);
      navigate('/admin');
    } catch (err) {
      let msg = err.message || 'Credenciales incorrectas.';
      try { msg = JSON.parse(msg).error ?? msg; } catch {}
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0E0E0F] flex flex-col items-center justify-center px-6">

      {/* Card */}
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <img src={logoSrc} alt="RedAutos" className="h-20 w-auto object-contain mb-6" />
          <p className="text-[9px] font-black uppercase tracking-[0.4em] text-primary mb-1">Panel Administrativo</p>
          <h1 className="font-headline text-3xl font-black text-white tracking-tighter">Iniciar sesión</h1>
          <p className="text-[#E5E2E3]/30 text-xs mt-2 text-center">Acceso exclusivo para automotoras registradas</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-[#131314] border border-[#353436] rounded-sm p-8 space-y-5">

          {error && (
            <div className="bg-primary/10 border border-primary/30 rounded-sm px-4 py-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary !text-sm">error</span>
              <p className="text-primary text-xs font-semibold">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-[9px] font-black uppercase tracking-[0.3em] text-primary mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@automotora.com"
              className="w-full bg-[#1C1B1F] border border-[#353436] rounded-sm px-4 py-3 text-[#E5E2E3] text-sm focus:border-primary/50 focus:outline-none placeholder:text-[#E5E2E3]/20 transition-colors"
            />
          </div>

          <div>
            <label className="block text-[9px] font-black uppercase tracking-[0.3em] text-primary mb-2">
              Contraseña
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#1C1B1F] border border-[#353436] rounded-sm px-4 py-3 pr-12 text-[#E5E2E3] text-sm focus:border-primary/50 focus:outline-none placeholder:text-[#E5E2E3]/20 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#E5E2E3]/30 hover:text-[#E5E2E3]/60 transition-colors"
              >
                <span className="material-symbols-outlined !text-lg">
                  {showPassword ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary/80 disabled:bg-primary/40 text-white font-black text-[11px] uppercase tracking-[0.25em] py-3.5 rounded-sm transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Verificando...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined !text-sm">lock_open</span>
                Ingresar
              </>
            )}
          </button>

        </form>

        {/* Back */}
        <div className="flex justify-center mt-6">
          <button
            onClick={() => navigate('/')}
            className="text-[#E5E2E3]/30 hover:text-[#E5E2E3]/60 text-xs flex items-center gap-1.5 transition-colors"
          >
            <span className="material-symbols-outlined !text-sm">arrow_back</span>
            Volver al inicio
          </button>
        </div>

        {/* Register link */}
        <div className="flex justify-center mt-3">
          <button
            onClick={() => navigate('/register')}
            className="text-[#E5E2E3]/30 hover:text-[#E5E2E3]/60 text-xs flex items-center gap-1.5 transition-colors"
          >
            <span className="material-symbols-outlined !text-sm">person_add</span>
            ¿No tenés cuenta? Registrá tu automotora
          </button>
        </div>

        {/* Support */}
        <p className="text-center text-[#E5E2E3]/20 text-[10px] mt-8">
          ¿Problemas para ingresar?{' '}
          <a href="mailto:kiwibyte.studio@gmail.com" className="text-primary hover:underline">
            Contactar soporte
          </a>
        </p>
      </div>
    </div>
  );
};

export default LoginScreen;
