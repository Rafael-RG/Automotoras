import React, { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import logoSrc from '../assets/Logo2.svg';
import { loginDealership, resendVerification } from '../services/api';
import ThemeToggleButton from '../components/ThemeToggleButton';

const LoginScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(location.state?.sessionExpired ? 'Tu sesión venció. Iniciá sesión nuevamente.' : '');
  const [emailNotVerified, setEmailNotVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  const submittingRef = useRef(false);
  const resendingRef = useRef(false);

  // Solo volver a rutas internas conocidas, nunca a una URL recibida del exterior.
  const returnTo = ['/admin', '/admin-ads', '/pago-exitoso'].includes(location.state?.from)
    ? location.state.from : '/admin';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submittingRef.current || resendingRef.current) return;
    setError('');
    setEmailNotVerified(false);
    setResendMessage('');

    if (!email.trim() || !password) {
      setError('Por favor completá todos los campos.');
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    try {
      const data = await loginDealership(email.trim(), password);
      // Es una preferencia, no una prueba de identidad. El panel la revalida.
      try {
        if (data.dealershipId) localStorage.setItem('adminDealershipId', data.dealershipId);
      } catch {
        // La sesión funciona aunque el navegador bloquee localStorage.
      }
      setPassword('');
      navigate(returnTo, { replace: true });
    } catch (err) {
      if (err.code === 'EMAIL_NOT_VERIFIED' || err.message === 'EMAIL_NOT_VERIFIED') {
        setEmailNotVerified(true);
      } else {
        setError(err.message || 'No se pudo iniciar sesión. Intentá nuevamente.');
      }
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendingRef.current || submittingRef.current || !email.trim()) return;
    resendingRef.current = true;
    setResending(true);
    setResendMessage('');
    setError('');
    try {
      await resendVerification(email.trim());
      setResendMessage('Si la cuenta necesita verificación, recibirás un nuevo enlace por email. Revisá también la carpeta de spam.');
    } catch (err) {
      setError(err.message || 'No se pudo solicitar el enlace. Intentá nuevamente.');
    } finally {
      resendingRef.current = false;
      setResending(false);
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
            <div role="alert" className="bg-primary/10 border border-primary/30 rounded-sm px-4 py-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary !text-sm">error</span>
              <p className="text-primary text-xs font-semibold">{error}</p>
            </div>
          )}

          {emailNotVerified && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-sm px-4 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-yellow-400 !text-sm">mark_email_unread</span>
                <p className="text-amber-800 dark:text-yellow-300 text-xs font-semibold">Email no verificado</p>
              </div>
              <p className="text-amber-800 dark:text-yellow-200/70 text-xs">Revisá tu bandeja de entrada y hacé click en el link de verificación que te enviamos.</p>
              <button type="button" onClick={handleResend} disabled={resending || loading}
                className="text-xs font-bold text-amber-800 dark:text-yellow-300 underline disabled:opacity-50">
                {resending ? 'Solicitando enlace…' : 'Reenviar enlace de verificación'}
              </button>
              {resendMessage && <output className="block text-amber-800 dark:text-yellow-200/70 text-xs">{resendMessage}</output>}
            </div>
          )}

          <div>
            <label htmlFor="login-email" className="block text-[9px] font-black uppercase tracking-[0.3em] text-primary mb-2">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              required
              disabled={loading || resending}
              value={email}
              onChange={(e) => { setEmail(e.target.value); setEmailNotVerified(false); setResendMessage(''); }}
              placeholder="tu@automotora.com"
              className="w-full bg-gray-50 dark:bg-[#1C1B1F] border border-gray-300 dark:border-[#353436] rounded-sm px-4 py-3 text-gray-900 dark:text-[#E5E2E3] text-sm focus:border-primary/50 focus:outline-none placeholder:text-gray-400 dark:placeholder:text-[#E5E2E3]/50 transition-colors"
            />
          </div>

          <div>
            <label htmlFor="login-password" className="block text-[9px] font-black uppercase tracking-[0.3em] text-primary mb-2">
              Contraseña
            </label>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                disabled={loading || resending}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-gray-50 dark:bg-[#1C1B1F] border border-gray-300 dark:border-[#353436] rounded-sm px-4 py-3 pr-12 text-gray-900 dark:text-[#E5E2E3] text-sm focus:border-primary/50 focus:outline-none placeholder:text-gray-400 dark:placeholder:text-[#E5E2E3]/50 transition-colors"
              />
              <button
                type="button"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
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
            disabled={loading || resending}
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
