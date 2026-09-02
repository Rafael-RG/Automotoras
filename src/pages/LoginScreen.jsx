import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import logoSrc from '../assets/Logo2.svg';
import { loginDealership } from '../services/api';
import ThemeToggleButton from '../components/ThemeToggleButton';

const LoginScreen = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [emailNotVerified, setEmailNotVerified] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setEmailNotVerified(false);

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
      try {
        const parsed = JSON.parse(msg);
        msg = parsed.error ?? msg;
      } catch {}
      if (msg === 'EMAIL_NOT_VERIFIED') {
        setEmailNotVerified(true);
      } else {
        setError(msg);
      }
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0E0E0F] flex flex-col items-center justify-center px-6">

      <div className="fixed top-4 right-4">
        <ThemeToggleButton />
      </div>

      {/* Card */}
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <img src={logoSrc} alt="RedAutos" className="h-20 w-auto object-contain mb-6" />
          <p className="text-[9px] font-black uppercase tracking-[0.4em] text-primary mb-1">Panel Administrativo</p>
          <h1 className="font-headline text-3xl font-black text-gray-900 dark:text-white tracking-tighter">Iniciar sesión</h1>
          <p className="text-gray-500 dark:text-[#E5E2E3]/30 text-xs mt-2 text-center">Acceso exclusivo para automotoras registradas</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white dark:bg-[#131314] border border-gray-200 dark:border-[#353436] rounded-sm p-8 space-y-5">

          {error && (
            <div className="bg-primary/10 border border-primary/30 rounded-sm px-4 py-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary !text-sm">error</span>
              <p className="text-primary text-xs font-semibold">{error}</p>
            </div>
          )}

          {emailNotVerified && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-sm px-4 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-yellow-400 !text-sm">mark_email_unread</span>
                <p className="text-yellow-300 text-xs font-semibold">Email no verificado</p>
              </div>
              <p className="text-yellow-200/60 text-xs">Revisá tu bandeja de entrada y hacé click en el link de verificación que te enviamos.</p>
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
              className="w-full bg-gray-50 dark:bg-[#1C1B1F] border border-gray-300 dark:border-[#353436] rounded-sm px-4 py-3 text-gray-900 dark:text-[#E5E2E3] text-sm focus:border-primary/50 focus:outline-none placeholder:text-gray-400 dark:placeholder:text-[#E5E2E3]/50 transition-colors"
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
                className="w-full bg-gray-50 dark:bg-[#1C1B1F] border border-gray-300 dark:border-[#353436] rounded-sm px-4 py-3 pr-12 text-gray-900 dark:text-[#E5E2E3] text-sm focus:border-primary/50 focus:outline-none placeholder:text-gray-400 dark:placeholder:text-[#E5E2E3]/50 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#E5E2E3]/30 hover:text-gray-600 dark:hover:text-[#E5E2E3]/60 transition-colors"
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

          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => navigate('/forgot-password')}
              className="text-gray-500 dark:text-[#E5E2E3]/30 hover:text-gray-700 dark:hover:text-[#E5E2E3]/60 text-xs transition-colors"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>

        </form>

        {/* Back */}
        <div className="flex justify-center mt-6">
          <button
            onClick={() => navigate('/')}
            className="text-gray-500 dark:text-[#E5E2E3]/30 hover:text-gray-700 dark:hover:text-[#E5E2E3]/60 text-xs flex items-center gap-1.5 transition-colors"
          >
            <span className="material-symbols-outlined !text-sm">arrow_back</span>
            Volver al inicio
          </button>
        </div>

        {/* Register link */}
        <div className="flex justify-center mt-3">
          <button
            onClick={() => navigate('/register')}
            className="text-gray-500 dark:text-[#E5E2E3]/30 hover:text-gray-700 dark:hover:text-[#E5E2E3]/60 text-xs flex items-center gap-1.5 transition-colors"
          >
            <span className="material-symbols-outlined !text-sm">person_add</span>
            ¿No tenés cuenta? Registrá tu automotora
          </button>
        </div>

        {/* Support */}
        <p className="text-center text-gray-500 dark:text-[#E5E2E3]/45 text-[10px] mt-8">
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
