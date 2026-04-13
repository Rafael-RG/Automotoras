import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import logoSrc from '../assets/Logo.png';
import { forgotPassword } from '../services/api';

const ForgotPasswordScreen = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email) { setError('Ingresá tu email.'); return; }

    setLoading(true);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      let msg = err.message || 'Error al enviar el email.';
      try { msg = JSON.parse(msg).error ?? msg; } catch {}
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0E0E0F] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md">

        <div className="flex flex-col items-center mb-10">
          <img src={logoSrc} alt="RedAutos" className="h-20 w-auto object-contain mb-6" />
          <p className="text-[9px] font-black uppercase tracking-[0.4em] text-primary mb-1">Panel Administrativo</p>
          <h1 className="font-headline text-3xl font-black text-white tracking-tighter">Recuperar contraseña</h1>
        </div>

        {sent ? (
          <div className="bg-[#131314] border border-[#353436] rounded-sm p-8 text-center space-y-5">
            <div className="w-16 h-16 bg-green-500/10 border border-green-500/30 rounded-full flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-green-400 !text-3xl">mark_email_read</span>
            </div>
            <h2 className="font-headline text-2xl font-black text-white tracking-tighter">¡Revisá tu email!</h2>
            <p className="text-[#E5E2E3]/60 text-sm">
              Si <span className="text-white font-semibold">{email}</span> está registrado y verificado,
              recibirás un link para restablecer tu contraseña.
            </p>
            <p className="text-[#E5E2E3]/30 text-xs">¿No llegó? Revisá la carpeta de spam.</p>
            <button
              onClick={() => navigate('/login')}
              className="w-full bg-primary hover:bg-primary/80 text-white font-black text-[11px] uppercase tracking-[0.25em] py-3.5 rounded-sm transition-all flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined !text-sm">login</span>
              Volver a iniciar sesión
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-[#131314] border border-[#353436] rounded-sm p-8 space-y-5">

            {error && (
              <div className="bg-primary/10 border border-primary/30 rounded-sm px-4 py-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary !text-sm">error</span>
                <p className="text-primary text-xs font-semibold">{error}</p>
              </div>
            )}

            <p className="text-[#E5E2E3]/50 text-sm">
              Ingresá el email con el que te registraste y te enviaremos un link para restablecer tu contraseña.
            </p>

            <div>
              <label className="block text-[9px] font-black uppercase tracking-[0.3em] text-primary mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                placeholder="tu@automotora.com"
                className="w-full bg-[#1C1B1F] border border-[#353436] rounded-sm px-4 py-3 text-[#E5E2E3] text-sm focus:border-primary/50 focus:outline-none placeholder:text-[#E5E2E3]/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
                  Enviando...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined !text-sm">send</span>
                  Enviar link
                </>
              )}
            </button>

          </form>
        )}

        <div className="flex justify-center mt-6">
          <button
            onClick={() => navigate('/login')}
            className="text-[#E5E2E3]/30 hover:text-[#E5E2E3]/60 text-xs flex items-center gap-1.5 transition-colors"
          >
            <span className="material-symbols-outlined !text-sm">arrow_back</span>
            Volver a iniciar sesión
          </button>
        </div>

      </div>
    </div>
  );
};

export default ForgotPasswordScreen;
