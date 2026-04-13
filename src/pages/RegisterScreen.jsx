import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import logoSrc from '../assets/Logo.png';
import { registerDealership } from '../services/api';

const RegisterScreen = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.name || !form.email || !form.password) {
      setError('Nombre, email y contraseña son obligatorios.');
      return;
    }
    if (form.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      await registerDealership({
        name: form.name,
        email: form.email,
        password: form.password,
        phone: form.phone,
      });
      setRegisteredEmail(form.email);
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
      <div className="min-h-screen bg-[#0E0E0F] flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-10">
            <img src={logoSrc} alt="RedAutos" className="h-20 w-auto object-contain mb-6" />
          </div>
          <div className="bg-[#131314] border border-[#353436] rounded-sm p-8 text-center space-y-5">
            <div className="w-16 h-16 bg-green-500/10 border border-green-500/30 rounded-full flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-green-400 !text-3xl">mark_email_read</span>
            </div>
            <h2 className="font-headline text-2xl font-black text-white tracking-tighter">¡Revisá tu email!</h2>
            <p className="text-[#E5E2E3]/60 text-sm">
              Enviamos un link de verificación a{' '}
              <span className="text-white font-semibold">{registeredEmail}</span>.
            </p>
            <p className="text-[#E5E2E3]/40 text-xs">
              Hacé click en el link del email para activar tu cuenta. El link expira en 24 horas.
            </p>
            <p className="text-[#E5E2E3]/30 text-xs">¿No llegó? Revisá la carpeta de spam.</p>
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
    <div className="min-h-screen bg-[#0E0E0F] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <img src={logoSrc} alt="RedAutos" className="h-20 w-auto object-contain mb-6" />
          <p className="text-[9px] font-black uppercase tracking-[0.4em] text-primary mb-1">Registrá tu Automotora</p>
          <h1 className="font-headline text-3xl font-black text-white tracking-tighter">Crear cuenta</h1>
          <p className="text-[#E5E2E3]/30 text-xs mt-2 text-center">Gestioná tu flota desde el panel administrativo</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-[#131314] border border-[#353436] rounded-sm p-8 space-y-5">

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
              className="w-full bg-[#1C1B1F] border border-[#353436] rounded-sm px-4 py-3 text-[#E5E2E3] text-sm focus:border-primary/50 focus:outline-none placeholder:text-[#E5E2E3]/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
              className="w-full bg-[#1C1B1F] border border-[#353436] rounded-sm px-4 py-3 text-[#E5E2E3] text-sm focus:border-primary/50 focus:outline-none placeholder:text-[#E5E2E3]/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            />
          </div>

          {/* Teléfono */}
          <div>
            <label className="block text-[9px] font-black uppercase tracking-[0.3em] text-primary mb-2">
              Teléfono <span className="text-[#E5E2E3]/30 normal-case tracking-normal">(opcional)</span>
            </label>
            <input
              type="tel"
              name="phone"
              value={form.phone}
              onChange={handleChange}
              disabled={loading}
              placeholder="+598 99 000 000"
              className="w-full bg-[#1C1B1F] border border-[#353436] rounded-sm px-4 py-3 text-[#E5E2E3] text-sm focus:border-primary/50 focus:outline-none placeholder:text-[#E5E2E3]/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            />
          </div>

          {/* Contraseña */}
          <div>
            <label className="block text-[9px] font-black uppercase tracking-[0.3em] text-primary mb-2">
              Contraseña
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={form.password}
                onChange={handleChange}
                disabled={loading}
                placeholder="Mínimo 6 caracteres"
                className="w-full bg-[#1C1B1F] border border-[#353436] rounded-sm px-4 py-3 pr-12 text-[#E5E2E3] text-sm focus:border-primary/50 focus:outline-none placeholder:text-[#E5E2E3]/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#E5E2E3]/30 hover:text-[#E5E2E3]/60 transition-colors"
              >
                <span className="material-symbols-outlined !text-lg">
                  {showPassword ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
          </div>

          {/* Confirmar contraseña */}
          <div>
            <label className="block text-[9px] font-black uppercase tracking-[0.3em] text-primary mb-2">
              Confirmar contraseña
            </label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                name="confirmPassword"
                value={form.confirmPassword}
                onChange={handleChange}
                disabled={loading}
                placeholder="Repetí tu contraseña"
                className="w-full bg-[#1C1B1F] border border-[#353436] rounded-sm px-4 py-3 pr-12 text-[#E5E2E3] text-sm focus:border-primary/50 focus:outline-none placeholder:text-[#E5E2E3]/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#E5E2E3]/30 hover:text-[#E5E2E3]/60 transition-colors"
              >
                <span className="material-symbols-outlined !text-lg">
                  {showConfirm ? 'visibility_off' : 'visibility'}
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
            className="text-[#E5E2E3]/30 hover:text-[#E5E2E3]/60 text-xs flex items-center gap-1.5 transition-colors"
          >
            <span className="material-symbols-outlined !text-sm">login</span>
            ¿Ya tenés cuenta? Iniciá sesión
          </button>
        </div>

        <p className="text-center text-[#E5E2E3]/20 text-[10px] mt-6">
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
