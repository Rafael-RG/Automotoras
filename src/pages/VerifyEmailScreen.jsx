import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import logoSrc from '../assets/Logo.png';
import { verifyEmail } from '../services/api';

const VerifyEmailScreen = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('loading'); // 'loading' | 'success' | 'error'
  const [message, setMessage] = useState('');
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      setMessage('Link inválido. No se encontró el token de verificación.');
      return;
    }

    verifyEmail(token)
      .then(() => setStatus('success'))
      .catch((err) => {
        let msg = err.message || 'Token inválido o expirado.';
        try { msg = JSON.parse(msg).error ?? msg; } catch {}
        setMessage(msg);
        setStatus('error');
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-[#0E0E0F] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-10">
          <img src={logoSrc} alt="RedAutos" className="h-20 w-auto object-contain mb-6" />
        </div>

        <div className="bg-[#131314] border border-[#353436] rounded-sm p-8 text-center space-y-5">

          {status === 'loading' && (
            <>
              <div className="w-12 h-12 border-2 border-primary/40 border-t-primary rounded-full animate-spin mx-auto" />
              <p className="text-[#E5E2E3]/60 text-sm">Verificando tu email...</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="w-16 h-16 bg-green-500/10 border border-green-500/30 rounded-full flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-green-400 !text-3xl">verified</span>
              </div>
              <h2 className="font-headline text-2xl font-black text-white tracking-tighter">¡Email verificado!</h2>
              <p className="text-[#E5E2E3]/60 text-sm">Tu cuenta está activa. Ya podés iniciar sesión.</p>
              <button
                onClick={() => navigate('/login')}
                className="w-full bg-primary hover:bg-primary/80 text-white font-black text-[11px] uppercase tracking-[0.25em] py-3.5 rounded-sm transition-all flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined !text-sm">login</span>
                Iniciar sesión
              </button>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="w-16 h-16 bg-primary/10 border border-primary/30 rounded-full flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-primary !text-3xl">error</span>
              </div>
              <h2 className="font-headline text-2xl font-black text-white tracking-tighter">Link inválido</h2>
              <p className="text-[#E5E2E3]/60 text-sm">{message || 'El link expiró o ya fue usado. Registrate nuevamente.'}</p>
              <button
                onClick={() => navigate('/register')}
                className="w-full bg-primary hover:bg-primary/80 text-white font-black text-[11px] uppercase tracking-[0.25em] py-3.5 rounded-sm transition-all flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined !text-sm">person_add</span>
                Ir a registro
              </button>
            </>
          )}

        </div>
      </div>
    </div>
  );
};

export default VerifyEmailScreen;
