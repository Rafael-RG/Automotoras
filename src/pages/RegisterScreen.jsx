import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import logoSrc from '../assets/Logo2.svg';
import { registerDealership } from '../services/api';
import ThemeToggleButton from '../components/ThemeToggleButton';

const RegisterScreen = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [emailDeliveryPending, setEmailDeliveryPending] = useState(false);

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.name || !form.email) {
      setError('Nombre y email son obligatorios.');
      return;
    }

    setLoading(true);
    try {
      const result = await registerDealership({
        name: form.name,
        email: form.email,
        phone: form.phone,
      });
      setRegisteredEmail(form.email);
      setEmailDeliveryPending(result?.emailDelivery === 'pending');
      setRegistered(true);
    } catch (err) {
      let msg = err.message || 'Error al registrarse.';
      try { msg = JSON.parse(msg).error ?? msg; } catch {}
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Pantalla de éxito post-registro
  if (registered) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0E0E0F] flex flex-col items-center justify-center px-6">
        <div className="fixed top-4 right-4">
          <ThemeToggleButton />
        </div>
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-10">
            <img src={logoSrc} alt="RedAutos" className="h-20 w-auto object-contain mb-6" />
          </div>
          <div className="bg-white dark:bg-[#131314] border border-gray-200 dark:border-[#353436] rounded-sm p-8 text-center space-y-5">
            <div className="w-16 h-16 bg-green-500/10 border border-green-500/30 rounded-full flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-green-400 !text-3xl">mark_email_read</span>
            </div>
            <h2 className="font-headline text-2xl font-black text-gray-900 dark:text-white tracking-tighter">¡Revisá tu email!</h2>
            {emailDeliveryPending ? (
              <p className="text-amber-700 dark:text-amber-300 text-sm">
                La cuenta fue creada, pero no pudimos enviar el enlace. Desde el inicio de sesión podés pedir un reenvío.
              </p>
            ) : (
              <>
                <p className="text-gray-500 dark:text-[#E5E2E3]/60 text-sm">
                  Enviamos un link de verificación a{' '}
                  <span className="text-gray-900 dark:text-white font-semibold">{registeredEmail}</span>.
                </p>
                <p className="text-gray-400 dark:text-[#E5E2E3]/40 text-xs">
                  Hacé click en el link para activar tu cuenta y elegir tu contraseña. El link expira en 24 horas.
                </p>
                <p className="text-gray-400 dark:text-[#E5E2E3]/30 text-xs">¿No llegó? Revisá la carpeta de spam.</p>
              </>
            )}
            <button
              onClick={() => navigate('/login')}
              className="w-full bg-primary hover:bg-primary/80 text-white font-black text-[11px] uppercase tracking-[0.25em] py-3.5 rounded-sm transition-all flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined !text-sm">login</span>
              Ir a iniciar sesión
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0E0E0F] flex flex-col items-center justify-center px-6">
      <div className="fixed top-4 right-4">
        <ThemeToggleButton />
      </div>
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <img src={logoSrc} alt="RedAutos" className="h-20 w-auto object-contain mb-6" />
          <p className="text-[9px] font-black uppercase tracking-[0.4em] text-primary mb-1">Registrá tu Automotora</p>
          <h1 className="font-headline text-3xl font-black text-gray-900 dark:text-white tracking-tighter">Crear cuenta</h1>
          <p className="text-gray-500 dark:text-[#E5E2E3]/30 text-xs mt-2 text-center">Gestioná tu flota desde el panel administrativo</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white dark:bg-[#131314] border border-gray-200 dark:border-[#353436] rounded-sm p-8 space-y-5">

          {error && (
            <div className="bg-primary/10 border border-primary/30 rounded-sm px-4 py-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary !text-sm">error</span>
              <p className="text-primary text-xs font-semibold">{error}</p>
            </div>
          )}

          {/* Nombre */}
          <div>
            <label className="block text-[9px] font-black uppercase tracking-[0.3em] text-primary mb-2">
              Nombre de la automotora
            </label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              disabled={loading}
              placeholder="Ej: Automotora San José"
              className="w-full bg-gray-50 dark:bg-[#1C1B1F] border border-gray-300 dark:border-[#353436] rounded-sm px-4 py-3 text-gray-900 dark:text-[#E5E2E3] text-sm focus:border-primary/50 focus:outline-none placeholder:text-gray-400 dark:placeholder:text-[#E5E2E3]/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-[9px] font-black uppercase tracking-[0.3em] text-primary mb-2">
              Email
            </label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              disabled={loading}
              placeholder="tu@automotora.com"
              className="w-full bg-gray-50 dark:bg-[#1C1B1F] border border-gray-300 dark:border-[#353436] rounded-sm px-4 py-3 text-gray-900 dark:text-[#E5E2E3] text-sm focus:border-primary/50 focus:outline-none placeholder:text-gray-400 dark:placeholder:text-[#E5E2E3]/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            />
          </div>

          {/* Teléfono */}
          <div>
            <label className="block text-[9px] font-black uppercase tracking-[0.3em] text-primary mb-2">
              Teléfono <span className="text-gray-400 dark:text-[#E5E2E3]/30 normal-case tracking-normal">(opcional)</span>
            </label>
            <input
              type="tel"
              name="phone"
              value={form.phone}
              onChange={handleChange}
              disabled={loading}
              placeholder="+598 99 000 000"
              className="w-full bg-gray-50 dark:bg-[#1C1B1F] border border-gray-300 dark:border-[#353436] rounded-sm px-4 py-3 text-gray-900 dark:text-[#E5E2E3] text-sm focus:border-primary/50 focus:outline-none placeholder:text-gray-400 dark:placeholder:text-[#E5E2E3]/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary/80 disabled:bg-primary/40 text-white font-black text-[11px] uppercase tracking-[0.25em] py-3.5 rounded-sm transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Creando cuenta...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined !text-sm">person_add</span>
                Crear cuenta
              </>
            )}
          </button>
        </form>

        {/* Login link */}
        <div className="flex justify-center mt-6">
          <button
            onClick={() => navigate('/login')}
            className="text-gray-500 dark:text-[#E5E2E3]/30 hover:text-gray-700 dark:hover:text-[#E5E2E3]/60 text-xs flex items-center gap-1.5 transition-colors"
          >
            <span className="material-symbols-outlined !text-sm">login</span>
            ¿Ya tenés cuenta? Iniciá sesión
          </button>
        </div>

        <p className="text-center text-gray-500 dark:text-[#E5E2E3]/45 text-[10px] mt-6">
          ¿Problemas?{' '}
          <a href="mailto:kiwibyte.studio@gmail.com" className="text-primary hover:underline">
            Contactar soporte
          </a>
        </p>
      </div>
    </div>
  );
};

export default RegisterScreen;
