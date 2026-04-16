import React from 'react';
import logoSrc from '../assets/Logo.png';

const PagoExitosoScreen = () => {
  const adminUrl = `${window.location.origin}/admin`;

  return (
    <div className="min-h-screen bg-[#0E0E0F] flex flex-col items-center justify-center px-6 text-center">
      <img src={logoSrc} alt="RedAutos" className="h-16 w-auto object-contain mb-8" />

      {/* Icono éxito */}
      <div className="w-20 h-20 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center mb-6">
        <span className="material-symbols-outlined text-green-400 !text-4xl">check_circle</span>
      </div>

      <h1 className="font-headline text-3xl font-black text-white tracking-tighter mb-3">
        ¡Pago recibido!
      </h1>
      <p className="text-[#E5E2E3]/50 text-sm max-w-xs leading-relaxed mb-8">
        Tu suscripción fue procesada correctamente. Ya podés volver al panel para gestionar tu automotora.
      </p>

      {/* Instrucción clave */}
      <div className="bg-[#131314] border border-[#353436] rounded-sm px-5 py-4 mb-8 max-w-xs">
        <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-2">¿Cómo continuar?</p>
        <p className="text-[#E5E2E3]/60 text-xs leading-relaxed">
          Cerrá este navegador y volvé a la pestaña de RedAutos que tenías abierta. El panel ya debería mostrar tu suscripción activa.
        </p>
      </div>

      {/* Botón para abrir el panel */}
      <a
        href={adminUrl}
        className="bg-primary hover:bg-primary/80 text-white font-black text-[11px] uppercase tracking-[0.25em] px-8 py-4 rounded-sm transition-all flex items-center gap-2"
      >
        <span className="material-symbols-outlined !text-sm">open_in_new</span>
        Ir al Panel de Administración
      </a>

      <p className="text-[#E5E2E3]/45 text-[10px] mt-6 max-w-xs">
        Si el panel todavía muestra "Pendiente", esperá unos segundos y hacé clic en "Verificar ahora".
      </p>
    </div>
  );
};

export default PagoExitosoScreen;
