import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import logoSrc from '../assets/Logo.png';
import { resetPassword } from '../services/api';

const ResetPasswordScreen = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!newPassword || !confirmPassword) { setError('Completá todos los campos.'); return; }
    if (newPassword.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return; }
    if (newPassword !== confirmPassword) { setError('Las contraseñas no coinciden.'); return; }

    setLoading(true);
    try {
      await resetPassword(token, newPassword);
      setSuccess(true);
    } catch (err) {
      let msg = err.message || 'Error al restablecer la contraseña.';
      try { msg = JSON.parse(msg).error ?? msg; } catch {}
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-[#0E0E0F] flex items-center justify-center px-6">
        <div className="text-center space-y-4">
          <span className="material-symbols-outlined text-primary !text-4xl">error</span>
          <p className="text-white">Link inválido. Solicitá uno nuevo.</p>
          <button onClick={() => navigate('/forgot-password')} className="text-primary hover:underline text-sm">
            Recuperar contraseña
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0E0E0F] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md">

        <div className="flex flex-col items-center mb-10">
          <img src={logoSrc} alt="RedAutos" className="h-20 w-auto object-contain mb-6" />
          <p className="text-[9px] font-black uppercase tracking-[0.4em] text-primary mb-1">Panel Administrativo</p>
          <h1 className="font-headline text-3xl font-black text-white tracking-tighter">Nueva contraseña</h1>
        </div>

        {success ? (
          <div className="bg-[#131314] border border-[#353436] rounded-sm p-8 text-center space-y-5">
            <div className="w-16 h-16 bg-green-500/10 border border-green-500/30 rounded-full flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-green-400 !text-3xl">check_circle</span>
            </div>
            <h2 className="font-headline text-2xl font-black text-white tracking-tighter">¡Contraseña actualizada!</h2>
            <p className="text-[#E5E2E3]/60 text-sm">Ya podés iniciar sesión con tu nueva contraseña.</p>
            <button
              onClick={() => navigate('/login')}
              className="w-full bg-primary hover:bg-primary/80 text-white font-black text-[11px] uppercase tracking-[0.25em] py-3.5 rounded-sm transition-all flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined !text-sm">login</span>
              Iniciar sesión
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

            <div>
              <label className="block text-[9px] font-black uppercase tracking-[0.3em] text-primary mb-2">
                Nueva contraseña
              </label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full bg-[#1C1B1F] border border-[#353436] rounded-sm px-4 py-3 pr-12 text-[#E5E2E3] text-sm focus:border-primary/50 focus:outline-none placeholder:text-[#E5E2E3]/20 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#E5E2E3]/30 hover:text-[#E5E2E3]/60 transition-colors"
                >
                  <span className="material-symbols-outlined !text-lg">{showNew ? 'visibility_off' : 'visibility'}</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[9px] font-black uppercase tracking-[0.3em] text-primary mb-2">
                Confirmar contraseña
              </label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repetí tu contraseña"
                  className="w-full bg-[#1C1B1F] border border-[#353436] rounded-sm px-4 py-3 pr-12 text-[#E5E2E3] text-sm focus:border-primary/50 focus:outline-none placeholder:text-[#E5E2E3]/20 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#E5E2E3]/30 hover:text-[#E5E2E3]/60 transition-colors"
                >
                  <span className="material-symbols-outlined !text-lg">{showConfirm ? 'visibility_off' : 'visibility'}</span>
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
                  Guardando...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined !text-sm">lock_reset</span>
                  Guardar contraseña
                </>
              )}
            </button>

          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPasswordScreen;
