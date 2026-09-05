import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import logoSrc from '../assets/Logo2.svg';
import ThemeToggleButton from '../components/ThemeToggleButton';
import { getSession, verifySubscription } from '../services/api';

const STATES = {
  checking: { title: 'Verificando tu suscripción', icon: 'hourglass_top' },
  authorized: { title: 'Suscripción autorizada', icon: 'check_circle' },
  pending: { title: 'Confirmación pendiente', icon: 'schedule' },
  error: { title: 'No se pudo confirmar la suscripción', icon: 'error_outline' },
  login: { title: 'Iniciá sesión para verificar', icon: 'lock' },
};

const PagoExitosoScreen = () => {
  const [status, setStatus] = useState('checking');
  const [message, setMessage] = useState('Consultando el estado con el servidor. Volver del sitio de pago no confirma el cobro.');
  const requestRef = useRef(0);
  const busyRef = useRef(false);

  const verify = useCallback(async () => {
    const requestId = ++requestRef.current;
    busyRef.current = true;
    setStatus('checking');
    setMessage('Consultando el estado con el servidor. Volver del sitio de pago no confirma el cobro.');
    try {
      const session = await getSession();
      if (requestId !== requestRef.current) return;
      // La identidad proviene de /auth/me, nunca de querystrings ni preferencias.
      const ownerId = session.dealershipId || session.accountId;
      if (!ownerId) throw new Error('La sesión no tiene una cuenta asociada para verificar.');
      const result = await verifySubscription(ownerId);
      if (requestId !== requestRef.current) return;
      const subscriptionStatus = result?.subscriptionStatus ?? result?.status;
      if (subscriptionStatus === 'authorized') {
        setStatus('authorized');
        setMessage('El servidor confirmó que tu suscripción está autorizada. Podés volver al panel para gestionar tu automotora.');
      } else if (subscriptionStatus === 'pending') {
        setStatus('pending');
        setMessage('Todavía no hay confirmación de una suscripción autorizada. Esperá unos instantes y volvé a verificar; no es necesario iniciar otro pago.');
      } else {
        const explanations = {
          paused: 'La suscripción está pausada. Revisá su estado desde el panel.',
          canceled: 'La suscripción está cancelada. Revisá su estado desde el panel.',
          cancelled: 'La suscripción está cancelada. Revisá su estado desde el panel.',
        };
        throw new Error(explanations[subscriptionStatus] || 'El servidor no devolvió un estado de suscripción verificable. Intentá nuevamente.');
      }
    } catch (err) {
      if (requestId !== requestRef.current) return;
      setStatus(err.status === 401 ? 'login' : 'error');
      setMessage(err.status === 401
        ? 'Iniciá sesión con la cuenta de la suscripción y regresá para consultar su estado.'
        : err.message || 'No se pudo verificar. Intentá nuevamente.');
    } finally {
      if (requestId === requestRef.current) busyRef.current = false;
    }
  }, []);

  useEffect(() => {
    const expired = () => {
      requestRef.current += 1;
      busyRef.current = false;
      setStatus('login');
      setMessage('Tu sesión venció. Iniciá sesión nuevamente para verificar la suscripción.');
    };
    window.addEventListener('redautos:session-expired', expired);
    window.addEventListener('redautos:session-changed', verify);
    verify();
    return () => {
      requestRef.current += 1;
      window.removeEventListener('redautos:session-expired', expired);
      window.removeEventListener('redautos:session-changed', verify);
    };
  }, [verify]);

  const state = STATES[status];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0E0E0F] flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="fixed top-4 right-4"><ThemeToggleButton /></div>
      <img src={logoSrc} alt="RedAutos" className="h-16 w-auto object-contain mb-8" />
      <div className={`w-20 h-20 rounded-full border flex items-center justify-center mb-6 ${status === 'authorized'
        ? 'bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400'
        : 'bg-primary/10 border-primary/30 text-primary'}`}>
        {status === 'checking'
          ? <div className="w-9 h-9 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          : <span className="material-symbols-outlined !text-4xl" aria-hidden="true">{state.icon}</span>}
      </div>
      <h1 className="font-headline text-3xl font-black text-gray-900 dark:text-white tracking-tighter mb-3">
        {state.title}
      </h1>
      <output aria-live={status === 'error' ? 'assertive' : 'polite'} className="block text-gray-600 dark:text-[#E5E2E3]/60 text-sm max-w-md leading-relaxed mb-8">
        {message}
      </output>
      <div className="flex flex-wrap justify-center gap-3">
        {(status === 'pending' || status === 'error') && (
          <button onClick={() => { if (!busyRef.current) verify(); }}
            className="bg-primary hover:bg-primary/80 text-white font-bold text-sm px-6 py-3 rounded-sm transition-colors">
            Volver a verificar
          </button>
        )}
        {status !== 'authorized' && status !== 'checking' && (
          <Link to="/login" state={{ from: '/pago-exitoso' }}
            className="border border-primary/40 text-primary font-bold text-sm px-6 py-3 rounded-sm">
            Iniciar sesión y volver
          </Link>
        )}
        <Link to="/admin" className="border border-gray-300 dark:border-[#353436] text-gray-700 dark:text-[#E5E2E3] font-bold text-sm px-6 py-3 rounded-sm">
          Ir al panel de administración
        </Link>
      </div>
      <p className="text-gray-500 dark:text-[#E5E2E3]/45 text-xs mt-6 max-w-md">
        Esta pantalla consulta el estado de la suscripción; no inicia pagos ni realiza verificaciones periódicas.
      </p>
    </div>
  );
};

export default PagoExitosoScreen;
