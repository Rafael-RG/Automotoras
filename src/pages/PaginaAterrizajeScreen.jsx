import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import TopNavBar from '../components/TopNavBar';
import Footer from '../components/Footer';
import logoSrc from '../assets/Logo.png';
import useSEO from '../hooks/useSEO';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const SectionLabel = ({ children }) => (
  <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#D32F2F] mb-3">{children}</p>
);

const Check = ({ children }) => (
  <li className="flex items-start gap-2.5 text-sm text-[#E5E2E3]/70">
    <span className="material-symbols-outlined !text-base text-green-400 flex-shrink-0 mt-0.5">check_circle</span>
    {children}
  </li>
);

const Cross = ({ children }) => (
  <li className="flex items-start gap-2.5 text-sm text-[#E5E2E3]/25 line-through">
    <span className="material-symbols-outlined !text-base text-[#E5E2E3]/20 flex-shrink-0 mt-0.5">remove_circle</span>
    {children}
  </li>
);

const BenefitPill = ({ icon, label }) => (
  <div className="flex items-center gap-2 bg-[#131314] border border-[#E5E2E3]/8 rounded-full px-4 py-2">
    <span className="material-symbols-outlined text-[#D32F2F] !text-base">{icon}</span>
    <span className="text-[#E5E2E3]/60 text-xs font-semibold">{label}</span>
  </div>
);

const FaqItem = ({ question, answer }) => {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      className="w-full text-left border-b border-[#E5E2E3]/8 last:border-0"
    >
      <div className="flex items-center justify-between py-5 gap-4">
        <p className="text-[#E5E2E3]/80 font-semibold text-sm">{question}</p>
        <span className={`material-symbols-outlined text-[#D32F2F] !text-xl flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
          expand_more
        </span>
      </div>
      {open && (
        <p className="text-[#E5E2E3]/45 text-sm leading-relaxed pb-5">{answer}</p>
      )}
    </button>
  );
};

const FeatureCard = ({ icon, title, description }) => (
  <>
    {/* Mobile: compact row */}
    <div className="sm:hidden flex items-start gap-3 py-3 border-b border-[#E5E2E3]/5 last:border-0">
      <div className="w-8 h-8 rounded-lg bg-[#D32F2F]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="material-symbols-outlined text-[#D32F2F] !text-base">{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-headline font-black text-[#E5E2E3] text-sm tracking-tight leading-tight">{title}</p>
        <p className="text-[#E5E2E3]/40 text-xs leading-relaxed mt-0.5">{description}</p>
      </div>
    </div>
    {/* sm+: card */}
    <div className="hidden sm:flex bg-[#0E0E0F] border border-[#E5E2E3]/8 rounded-xl p-6 flex-col gap-4 hover:border-[#D32F2F]/30 transition-colors">
      <div className="w-11 h-11 rounded-lg bg-[#D32F2F]/10 flex items-center justify-center flex-shrink-0">
        <span className="material-symbols-outlined text-[#D32F2F] !text-2xl">{icon}</span>
      </div>
      <div>
        <h3 className="font-headline font-black text-[#E5E2E3] text-lg tracking-tight mb-2">{title}</h3>
        <p className="text-[#E5E2E3]/50 text-sm leading-relaxed">{description}</p>
      </div>
    </div>
  </>
);

const CompareRow = ({ feature, old, nuevo }) => (
  <div className="grid grid-cols-3 gap-1 md:gap-3 py-3 md:py-4 border-b border-[#E5E2E3]/5 last:border-0 items-start md:items-center">
    <p className="text-[#E5E2E3]/60 text-xs md:text-sm leading-tight">{feature}</p>
    <div className="flex items-start gap-1 md:gap-2">
      <span className="material-symbols-outlined text-red-500/70 !text-sm flex-shrink-0 mt-0.5">close</span>
      <span className="text-[#E5E2E3]/30 text-[10px] md:text-sm leading-tight">{old}</span>
    </div>
    <div className="flex items-start gap-1 md:gap-2">
      <span className="material-symbols-outlined text-green-400 !text-sm flex-shrink-0 mt-0.5">check_circle</span>
      <span className="text-[#E5E2E3]/80 text-[10px] md:text-sm leading-tight">{nuevo}</span>
    </div>
  </div>
);

// ─── Contact Form ──────────────────────────────────────────────────────────────
const WHATSAPP_NUMBER = '59892494067';

const ContactForm = () => {
  const [form, setForm] = useState({ name: '', phone: '', message: '' });
  const [sent, setSent] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = encodeURIComponent(
      `Hola RedAutos! Mi nombre es ${form.name}. ${form.message || 'Quiero saber más sobre los planes.'} Tel: ${form.phone}`
    );
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${text}`, '_blank', 'noopener,noreferrer');
    setSent(true);
  };

  if (sent) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
        <div className="w-14 h-14 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center">
          <span className="material-symbols-outlined text-green-400 !text-3xl">check_circle</span>
        </div>
        <h3 className="font-headline font-black text-[#E5E2E3] text-xl">¡Mensaje enviado!</h3>
        <p className="text-[#E5E2E3]/40 text-sm max-w-xs">
          Te redirigimos a WhatsApp. Si no se abrió, escribinos directo al número.
        </p>
        <button
          onClick={() => setSent(false)}
          className="text-xs text-[#D32F2F] hover:text-[#FF5252] transition-colors"
        >
          Enviar otro mensaje
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-[#E5E2E3]/40 mb-2">
            Tu nombre *
          </label>
          <input
            required
            value={form.name}
            onChange={set('name')}
            placeholder="Ej: Carlos García"
            className="w-full bg-[#0E0E0F] border border-[#E5E2E3]/10 rounded-lg px-4 py-3 text-[#E5E2E3] text-sm placeholder-[#E5E2E3]/20 focus:border-[#D32F2F]/50 focus:outline-none transition-colors"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-[#E5E2E3]/40 mb-2">
            Teléfono / WhatsApp
          </label>
          <input
            value={form.phone}
            onChange={set('phone')}
            placeholder="Ej: 099 123 456"
            className="w-full bg-[#0E0E0F] border border-[#E5E2E3]/10 rounded-lg px-4 py-3 text-[#E5E2E3] text-sm placeholder-[#E5E2E3]/20 focus:border-[#D32F2F]/50 focus:outline-none transition-colors"
          />
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-[#E5E2E3]/40 mb-2">
          Tu consulta
        </label>
        <textarea
          value={form.message}
          onChange={set('message')}
          rows={4}
          placeholder="Contanos sobre tu automotora o hacenos tu pregunta…"
          className="w-full bg-[#0E0E0F] border border-[#E5E2E3]/10 rounded-lg px-4 py-3 text-[#E5E2E3] text-sm placeholder-[#E5E2E3]/20 focus:border-[#D32F2F]/50 focus:outline-none transition-colors resize-none"
        />
      </div>
      <button
        type="submit"
        className="w-full py-4 bg-[#25D366] text-white rounded-lg font-headline font-black text-[11px] uppercase tracking-[0.2em] hover:bg-[#1da84e] transition-colors flex items-center justify-center gap-2"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
        Enviar consulta por WhatsApp
      </button>
      <p className="text-[#E5E2E3]/20 text-[10px] text-center">
        Al enviar, se abrirá WhatsApp con tu mensaje listo. Respondemos en el día.
      </p>
    </form>
  );
};

// ─── Page ──────────────────────────────────────────────────────────────────────
const PaginaAterrizajeScreen = () => {
  useSEO({
    title: 'Publicá tu concesionario',
    description: 'Sumá tu concesionario a RedAutos y llegá a más compradores en Uruguay. Planes flexibles, sin comisiones por venta.',
    url: '/unirse',
  });
  return (
    <div className="min-h-screen bg-[#0E0E0F] text-[#E5E2E3] font-body antialiased">
      <TopNavBar />

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section className="relative min-h-[92vh] flex flex-col items-center justify-center text-center px-6 pt-24 pb-16 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-[#D32F2F]/10 rounded-full blur-[140px] pointer-events-none" />
        <div className="relative z-10 max-w-4xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-[#D32F2F]/10 border border-[#D32F2F]/20 rounded-full px-4 py-2 mb-8">
            <span className="w-2 h-2 rounded-full bg-[#D32F2F] animate-pulse" />
            <span className="text-[#FFB3AC] text-xs font-bold uppercase tracking-widest">Plataforma abierta a nuevas automotoras</span>
          </div>

          <h1 className="font-headline font-black text-4xl md:text-7xl lg:text-8xl tracking-tighter text-[#E5E2E3] leading-[0.92] mb-5 md:mb-6">
            Sumá tu<br />
            automotora a<br />
            <span className="text-[#D32F2F]">RedAutos.</span>
          </h1>
          <p className="text-[#E5E2E3]/50 text-base md:text-xl leading-relaxed max-w-xl mx-auto mb-8 md:mb-10">
            La plataforma que digitaliza tu inventario, te da presencia online y conecta tu negocio con compradores de toda Uruguay — desde $2590/mes.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
            <Link
              to="/register"
              className="bg-[#D32F2F] text-white px-9 py-4 rounded-sm font-headline font-black text-[11px] uppercase tracking-[0.2em] hover:bg-[#B71C1C] transition-colors flex items-center gap-2 w-full sm:w-auto justify-center"
            >
              Empezar ahora — es gratis
              <span className="material-symbols-outlined !text-base">arrow_forward</span>
            </Link>
            <a
              href="#planes"
              className="border border-[#E5E2E3]/20 text-[#E5E2E3]/60 px-9 py-4 rounded-sm font-headline font-black text-[11px] uppercase tracking-[0.2em] hover:border-[#E5E2E3]/40 hover:text-[#E5E2E3] transition-colors w-full sm:w-auto text-center"
            >
              Ver planes y precios
            </a>
          </div>

          {/* Reassurance pills */}
          <div className="flex flex-wrap justify-center gap-2 md:gap-3">
            <BenefitPill icon="credit_card_off" label="Sin tarjeta para registrarte" />
            <BenefitPill icon="cancel" label="Cancelá cuando quieras" />
            <BenefitPill icon="attach_money" label="Sin comisiones por venta" />
            <BenefitPill icon="bolt" label="Online en menos de 5 min" />
          </div>
        </div>

        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 animate-bounce">
          <span className="material-symbols-outlined text-[#E5E2E3]/15 !text-2xl">expand_more</span>
        </div>
      </section>

      {/* ── SOCIAL PROOF BAR ───────────────────────────────────────────────── */}
      <div className="border-y border-[#E5E2E3]/8 bg-[#131314]">
        <div className="max-w-screen-xl mx-auto px-6 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { v: '$0', l: 'Comisión por venta' },
              { v: '24/7', l: 'Visibilidad online' },
              { v: '< 5 min', l: 'Para estar online' },
              { v: '100%', l: 'Gestión desde el celular' },
            ].map(({ v, l }) => (
              <div key={l}>
                <p className="font-headline font-black text-3xl md:text-4xl text-[#D32F2F] tracking-tighter">{v}</p>
                <p className="text-[#E5E2E3]/35 text-[10px] uppercase tracking-widest mt-1.5">{l}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── EL PROBLEMA ────────────────────────────────────────────────────── */}
      <section className="max-w-screen-xl mx-auto px-5 md:px-6 py-14 md:py-24">
        <div className="max-w-2xl mb-10 md:mb-14">
          <SectionLabel>El problema que resolvemos</SectionLabel>
          <h2 className="font-headline font-black text-4xl md:text-5xl tracking-tighter text-[#E5E2E3] leading-tight mb-6">
            El mercado automotriz<br />sigue atrasado.
          </h2>
          <p className="text-[#E5E2E3]/50 text-base leading-relaxed">
            La mayoría de las automotoras en Uruguay todavía dependen de carteles, boca a boca y publicaciones
            dispersas en distintos portales. No tienen presencia digital propia, no miden nada y pierden
            oportunidades todos los días. Con RedAutos eso cambia — hoy mismo.
          </p>
        </div>
        <div className="bg-[#131314] border border-[#E5E2E3]/8 rounded-xl overflow-hidden">
          <div className="grid grid-cols-3 gap-3 px-6 py-4 border-b border-[#E5E2E3]/8 bg-[#0E0E0F]">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#E5E2E3]/40">Aspecto</p>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-red-500/70">Sin RedAutos</p>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-green-400">Con RedAutos</p>
          </div>
          <div className="px-6">
            <CompareRow feature="Visibilidad" old="Solo local / boca a boca" nuevo="Online 24/7 en toda la región" />
            <CompareRow feature="Catálogo" old="Pizarrón o Excel" nuevo="Panel digital con fotos y filtros" />
            <CompareRow feature="Actualización" old="Horas o días" nuevo="Inmediata desde el celular" />
            <CompareRow feature="Métricas" old="Ninguna" nuevo="Vistas, leads y compartidos por auto" />
            <CompareRow feature="Costo de entrada" old="Alto (sitio web propio)" nuevo="Suscripción mensual accesible" />
            <CompareRow feature="Presencia en mapa" old="Solo Google Maps manual" nuevo="Mapa integrado en la plataforma" />
            <CompareRow feature="Comisión por venta" old="Varía según portal" nuevo="$0 — sin comisiones" />
          </div>
        </div>
      </section>

      {/* ── 3 BENEFICIOS CLAVE ─────────────────────────────────────────────── */}
      <section className="max-w-screen-xl mx-auto px-5 md:px-6 py-14 md:py-24">
        <div className="text-center max-w-xl mx-auto mb-10 md:mb-14">
          <SectionLabel>¿Por qué RedAutos?</SectionLabel>
          <h2 className="font-headline font-black text-4xl md:text-5xl tracking-tighter text-[#E5E2E3]">
            Todo lo que necesitás,<br />nada de lo que no.
          </h2>
        </div>
        <div className="md:grid md:grid-cols-3 md:gap-6 bg-[#131314] md:bg-transparent border md:border-0 border-[#E5E2E3]/8 rounded-xl px-4 md:px-0 py-1 md:py-0">
          {[
            {
              icon: 'visibility',
              title: 'Presencia digital real',
              description: 'Tu automotora aparece online con logo, dirección, catálogo completo de vehículos y mapa de ubicación. Sin necesitar un sitio web propio.',
              highlight: false,
            },
            {
              icon: 'forum',
              title: 'Leads directos a tu WhatsApp',
              description: 'Cada auto tiene un botón que conecta al comprador directo con vos por WhatsApp. Sin intermediarios, sin formularios, sin demoras.',
              highlight: true,
            },
            {
              icon: 'speed',
              title: 'Panel + métricas en tiempo real',
              description: 'Administrá todo tu inventario, marcá autos como vendidos, y mirá cuántas personas los están viendo — desde el celular.',
              highlight: false,
            },
          ].map((b) => (
            <div key={b.title}>
              {/* Mobile: compact row */}
              <div className="md:hidden flex items-start gap-3 py-3 border-b border-[#E5E2E3]/5 last:border-0">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${b.highlight ? 'bg-[#D32F2F]/20' : 'bg-[#D32F2F]/10'}`}>
                  <span className="material-symbols-outlined text-[#D32F2F] !text-base">{b.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-headline font-black text-sm tracking-tight leading-tight ${b.highlight ? 'text-[#FFB3AC]' : 'text-[#E5E2E3]'}`}>{b.title}</p>
                  <p className="text-[#E5E2E3]/40 text-xs leading-relaxed mt-0.5">{b.description}</p>
                </div>
              </div>
              {/* Desktop: card */}
              <div
                className={`hidden md:flex rounded-xl p-8 flex-col gap-5 border transition-all ${
                  b.highlight
                    ? 'bg-[#D32F2F]/8 border-[#D32F2F]/30'
                    : 'bg-[#131314] border-[#E5E2E3]/8 hover:border-[#D32F2F]/20'
                }`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${b.highlight ? 'bg-[#D32F2F]/20' : 'bg-[#D32F2F]/10'}`}>
                  <span className="material-symbols-outlined text-[#D32F2F] !text-2xl">{b.icon}</span>
                </div>
                <div>
                  <h3 className="font-headline font-black text-[#E5E2E3] text-xl tracking-tight mb-2">{b.title}</h3>
                  <p className="text-[#E5E2E3]/50 text-sm leading-relaxed">{b.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── PARA AUTOMOTORAS ───────────────────────────────────────────────── */}
      <section className="bg-[#131314] border-y border-[#E5E2E3]/8">
        <div className="max-w-screen-xl mx-auto px-5 md:px-6 py-14 md:py-24">
          <div className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
            <SectionLabel>Para automotoras</SectionLabel>
            <h2 className="font-headline font-black text-4xl md:text-5xl tracking-tighter text-[#E5E2E3] leading-tight mb-4">
              ¿Por qué todas las automotoras del país deben unirse?
            </h2>
            <p className="text-[#E5E2E3]/50 text-base leading-relaxed">
              Los compradores cada vez buscan más online. Si tu automotora no está, no existe para ellos.
            </p>
          </div>
          <div className="sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:gap-5 bg-[#0E0E0F] sm:bg-transparent border sm:border-0 border-[#E5E2E3]/8 rounded-xl px-4 sm:px-0 py-1 sm:py-0">
            <FeatureCard icon="visibility" title="Presencia digital inmediata" description="Sin necesitar un sitio web ni contratar a nadie. Tu automotora aparece online desde el momento en que activás el plan." />
            <FeatureCard icon="search" title="Compradores que ya están buscando" description="RedAutos atrae a personas que quieren comprar un auto. No necesitás salir a buscarlos: ellos llegan solos." />
            <FeatureCard icon="trending_up" title="Métricas reales de tu negocio" description="Sabé qué autos generan más interés, cuántas personas los ven y cuántos te contactan. Tomá decisiones con datos." />
            <FeatureCard icon="smartphone" title="Gestión desde el celular" description="Agregá un auto, marcalo como reservado o actualizá el precio en segundos desde cualquier dispositivo." />
            <FeatureCard icon="forum" title="Más leads, más ventas" description="El botón de WhatsApp integrado en cada auto te conecta directo con el comprador interesado, sin intermediarios." />
            <FeatureCard icon="attach_money" title="Costo 100% predecible" description="Suscripción fija mensual, sin comisiones por venta. Vendés 1 auto o 50, el costo es siempre el mismo." />
            <FeatureCard icon="store" title="Tu perfil como carta de presentación" description="Página propia con logo, ubicación en el mapa, datos de contacto y todo tu inventario. Una automotora profesional en tu bolsillo." />
            <FeatureCard icon="share" title="Tus clientes te recomiendan" description="Cuando un cliente comparte un auto desde RedAutos, lleva tu marca consigo. La red crece sola." />
            <FeatureCard icon="lock_open" title="Sin contratos ni permanencia" description="Podés cancelar cuando quieras. Pero una vez que veas los resultados, no vas a querer irte." />
          </div>
        </div>
      </section>

      {/* ── PLANES Y PRECIOS ───────────────────────────────────────────────── */}
      <section id="planes" className="bg-[#131314] border-y border-[#E5E2E3]/8">
        <div className="max-w-screen-xl mx-auto px-5 md:px-6 py-14 md:py-24">
          <div className="text-center max-w-xl mx-auto mb-10 md:mb-14">
            <SectionLabel>Planes y precios</SectionLabel>
            <h2 className="font-headline font-black text-4xl md:text-5xl tracking-tighter text-[#E5E2E3] mb-4">
              Simple. Transparente.<br />Sin sorpresas.
            </h2>
            <p className="text-[#E5E2E3]/45 text-base">
              Sin comisiones por venta · Sin costo de instalación · Cancelá cuando quieras
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {/* Basic */}
            <div className="bg-[#0E0E0F] border border-[#E5E2E3]/10 rounded-xl p-8 flex flex-col">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#E5E2E3]/35 mb-4">Plan Básico</p>
              <div className="flex items-end gap-2 mb-2">
                <span className="font-headline font-black text-5xl text-[#E5E2E3] tracking-tighter">$2590</span>
                <span className="text-[#E5E2E3]/30 text-sm mb-1.5">/mes</span>
              </div>
              <p className="text-[#E5E2E3]/25 text-xs mb-8">Pesos Uruguayos · IVA incluido</p>
              <ul className="space-y-3 flex-1 mb-8">
                <Check>1 sucursal</Check>
                <Check>Autos ilimitados</Check>
                <Check>Panel de métricas</Check>
                <Check>Soporte por email</Check>
                <Check>Perfil público en el mapa</Check>
                <Cross>Múltiples sucursales</Cross>
              </ul>
              <Link
                to="/register"
                className="block text-center py-3.5 border border-[#E5E2E3]/20 text-[#E5E2E3]/70 rounded-sm font-headline font-black text-[11px] uppercase tracking-widest hover:border-[#E5E2E3]/40 hover:text-[#E5E2E3] transition-colors"
              >
                Empezar
              </Link>
            </div>

            {/* Pro — highlighted */}
            <div className="bg-[#0E0E0F] border-2 border-[#D32F2F]/50 rounded-xl p-8 flex flex-col relative">
              <span className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#D32F2F] text-white text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-lg shadow-[#D32F2F]/30">
                Más popular
              </span>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#D32F2F]/70 mb-4">Plan Pro</p>
              <div className="flex items-end gap-2 mb-2">
                <span className="font-headline font-black text-5xl text-[#E5E2E3] tracking-tighter">$3990</span>
                <span className="text-[#E5E2E3]/30 text-sm mb-1.5">/mes</span>
              </div>
              <p className="text-[#E5E2E3]/25 text-xs mb-8">Pesos Uruguayos · IVA incluido</p>
              <ul className="space-y-3 flex-1 mb-8">
                <Check>Sucursales ilimitadas</Check>
                <Check>Autos ilimitados</Check>
                <Check>Panel de métricas centralizado</Check>
                <Check>Soporte prioritario</Check>
                <Check>Perfil público en el mapa</Check>
                <Check>Gestión multi-sucursal</Check>
              </ul>
              <Link
                to="/register"
                className="block text-center py-3.5 bg-[#D32F2F] text-white rounded-sm font-headline font-black text-[11px] uppercase tracking-widest hover:bg-[#B71C1C] transition-colors shadow-lg shadow-[#D32F2F]/20"
              >
                Empezar
              </Link>
            </div>

            {/* Enterprise / contact */}
            <div className="bg-[#0E0E0F] border border-[#E5E2E3]/10 rounded-xl p-8 flex flex-col">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#E5E2E3]/35 mb-4">Plan Empresarial</p>
              <div className="flex items-end gap-2 mb-2">
                <span className="font-headline font-black text-3xl text-[#E5E2E3] tracking-tighter">A medida</span>
              </div>
              <p className="text-[#E5E2E3]/25 text-xs mb-8">Para grupos automotrices y flotas grandes</p>
              <ul className="space-y-3 flex-1 mb-8">
                <Check>Todo lo del Plan Pro</Check>
                <Check>Onboarding personalizado</Check>
                <Check>Capacitación para el equipo</Check>
                <Check>Gestión de cuentas dedicada</Check>
                <Check>Facturación empresarial</Check>
                <Check>Precio negociado por volumen</Check>
              </ul>
              <a
                href="#contacto"
                className="block text-center py-3.5 border border-[#E5E2E3]/20 text-[#E5E2E3]/70 rounded-sm font-headline font-black text-[11px] uppercase tracking-widest hover:border-[#D32F2F]/40 hover:text-[#FFB3AC] transition-colors"
              >
                Hablar con ventas
              </a>
            </div>
          </div>

          <p className="text-center text-[#E5E2E3]/20 text-xs mt-10">
            Todos los planes incluyen acceso completo al panel · El pago se procesa de forma segura vía MercadoPago
          </p>
        </div>
      </section>

      {/* ── CÓMO FUNCIONA ──────────────────────────────────────────────────── */}
      <section className="max-w-screen-xl mx-auto px-5 md:px-6 py-14 md:py-24">
        <div className="max-w-xl mb-10 md:mb-14">
          <SectionLabel>Proceso de alta</SectionLabel>
          <h2 className="font-headline font-black text-3xl md:text-5xl tracking-tighter text-[#E5E2E3]">
            De cero a online<br />en 5 minutos.
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-0 relative">
          {/* Connecting line desktop */}
          <div className="hidden md:block absolute top-5 left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-transparent via-[#D32F2F]/30 to-transparent pointer-events-none" />
          {/* Connecting line mobile */}
          <div className="md:hidden absolute top-0 bottom-0 left-5 w-px bg-[#D32F2F]/15 pointer-events-none" />
          {[
            { n: '1', icon: 'person_add', title: 'Creás tu cuenta', desc: 'Nombre, ciudad y listo. Menos de un minuto.' },
            { n: '2', icon: 'credit_card', title: 'Elegís un plan', desc: 'Básico o Pro. Pagás con MercadoPago.' },
            { n: '3', icon: 'directions_car', title: 'Cargás tus autos', desc: 'Fotos, precio, ficha técnica. Pan comido.' },
            { n: '4', icon: 'public', title: 'Los clientes llegan', desc: 'Tu automotora aparece en búsquedas y el mapa.' },
          ].map((step) => (
            <div key={step.n}>
              {/* Mobile: horizontal row */}
              <div className="md:hidden flex items-center gap-4 pb-6 last:pb-0 relative pl-1">
                <div className="w-10 h-10 rounded-full bg-[#D32F2F] flex items-center justify-center z-10 flex-shrink-0">
                  <span className="font-headline font-black text-white text-sm">{step.n}</span>
                </div>
                <div className="flex-1">
                  <p className="font-headline font-black text-[#E5E2E3] text-base tracking-tight leading-tight">{step.title}</p>
                  <p className="text-[#E5E2E3]/40 text-xs mt-0.5">{step.desc}</p>
                </div>
                <span className="material-symbols-outlined text-[#D32F2F]/50 !text-xl flex-shrink-0">{step.icon}</span>
              </div>
              {/* Desktop: vertical column */}
              <div className="hidden md:flex flex-col items-center text-center px-6">
                <div className="w-12 h-12 rounded-full bg-[#D32F2F] flex items-center justify-center z-10 relative mb-5">
                  <span className="font-headline font-black text-white text-base">{step.n}</span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-[#131314] border border-[#E5E2E3]/8 flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined text-[#D32F2F] !text-xl">{step.icon}</span>
                </div>
                <h3 className="font-headline font-black text-[#E5E2E3] text-lg tracking-tight mb-2">{step.title}</h3>
                <p className="text-[#E5E2E3]/40 text-sm">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="text-center mt-12">
          <Link
            to="/register"
            className="inline-flex items-center gap-2 bg-[#D32F2F] text-white px-8 py-4 rounded-sm font-headline font-black text-[11px] uppercase tracking-[0.2em] hover:bg-[#B71C1C] transition-colors"
          >
            Registrar mi automotora
            <span className="material-symbols-outlined !text-base">arrow_forward</span>
          </Link>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────────── */}
      <section className="bg-[#131314] border-y border-[#E5E2E3]/8">
        <div className="max-w-3xl mx-auto px-5 md:px-6 py-14 md:py-24">
          <div className="text-center mb-10 md:mb-14">
            <SectionLabel>Preguntas frecuentes</SectionLabel>
            <h2 className="font-headline font-black text-4xl tracking-tighter text-[#E5E2E3]">
              Resolvemos tus dudas.
            </h2>
          </div>
          <div className="bg-[#0E0E0F] border border-[#E5E2E3]/8 rounded-xl px-6 md:px-8">
            <FaqItem
              question="¿Necesito conocimientos técnicos para usar RedAutos?"
              answer="No. El panel está diseñado para ser usado por cualquier persona. Si sabés usar WhatsApp, sabés usar RedAutos. También ofrecemos soporte si necesitás ayuda en los primeros pasos."
            />
            <FaqItem
              question="¿Puedo cancelar cuando quiera?"
              answer="Sí, en cualquier momento y sin penalizaciones. Tu suscripción sigue activa hasta el fin del período pagado y no se renueva automáticamente si cancelás."
            />
            <FaqItem
              question="¿RedAutos cobra comisión por cada auto que vendo?"
              answer="No. RedAutos cobra una suscripción mensual fija. No importa cuántos autos vendas: el costo es siempre el mismo. Sin letra chica."
            />
            <FaqItem
              question="¿Cómo me contactan los compradores?"
              answer="Directamente por WhatsApp. Cada auto tiene un botón «Consultar por WhatsApp» que abre una conversación prefabricada con el interesado. Sin intermediarios."
            />
            <FaqItem
              question="¿Qué pasa con mi cuenta si cancelo el plan?"
              answer="Tu perfil y datos se conservan si te querés reactivar más adelante. Los compradores no podrán ver tus autos mientras el plan esté inactivo, pero toda tu información queda guardada."
            />
            <FaqItem
              question="¿Puedo tener más de una sucursal?"
              answer="Con el Plan Pro podés agregar sucursales ilimitadas y gestionarlas desde un solo panel. Con el Plan Básico podés operar una sucursal."
            />
          </div>
        </div>
      </section>

      {/* ── CONTACTO ───────────────────────────────────────────────────────── */}
      <section id="contacto" className="max-w-screen-xl mx-auto px-5 md:px-6 py-14 md:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
          <div>
            <SectionLabel>Contacto</SectionLabel>
            <h2 className="font-headline font-black text-4xl md:text-5xl tracking-tighter text-[#E5E2E3] leading-tight mb-5">
              ¿Tenés dudas?<br />
              <span className="text-[#D32F2F]">Hablemos.</span>
            </h2>
            <p className="text-[#E5E2E3]/45 text-base leading-relaxed mb-8">
              Escribinos y te respondemos en el día.
              Podemos hacer una demo en vivo, mostrarte cómo funciona el panel
              y ayudarte a elegir el plan ideal para tu automotora.
            </p>
            <div className="space-y-5">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-[#25D366]/10 border border-[#25D366]/20 flex items-center justify-center flex-shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#25D366">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                </div>
                <div>
                  <p className="text-[#E5E2E3]/40 text-[10px] uppercase tracking-widest font-bold mb-0.5">WhatsApp</p>
                  <a
                    href={`https://wa.me/${WHATSAPP_NUMBER}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#E5E2E3]/70 text-sm hover:text-[#25D366] transition-colors"
                  >
                    Chatear ahora
                  </a>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-[#D32F2F]/10 border border-[#D32F2F]/20 flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[#D32F2F] !text-xl">schedule</span>
                </div>
                <div>
                  <p className="text-[#E5E2E3]/40 text-[10px] uppercase tracking-widest font-bold mb-0.5">Horario de atención</p>
                  <p className="text-[#E5E2E3]/70 text-sm">Lunes a viernes · 9:00 – 18:00</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-[#131314] border border-[#E5E2E3]/8 rounded-xl p-8">
            <h3 className="font-headline font-black text-[#E5E2E3] text-xl tracking-tight mb-6">
              Mandanos tu consulta
            </h3>
            <ContactForm />
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ──────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[#131314] border-t border-[#E5E2E3]/8">
        <div className="absolute inset-0 bg-gradient-to-br from-[#D32F2F]/12 via-transparent to-transparent pointer-events-none" />
        <div className="relative max-w-screen-xl mx-auto px-5 md:px-6 py-16 md:py-28 flex flex-col lg:flex-row items-center justify-between gap-10">
          <div className="max-w-2xl text-center lg:text-left">
            <img src={logoSrc} alt="RedAutos" className="h-12 w-auto object-contain mb-6 mx-auto lg:mx-0 opacity-80" />
            <h2 className="font-headline font-black text-4xl md:text-5xl lg:text-6xl tracking-tighter text-[#E5E2E3] leading-tight mb-4">
              Cada día sin estar en RedAutos<br />
              <span className="text-[#D32F2F]">es un cliente que perdés.</span>
            </h2>
            <p className="text-[#E5E2E3]/40 text-base leading-relaxed">
              Registrarte es gratis y tarda menos de 2 minutos. Empezá hoy.
            </p>
          </div>
          <div className="flex flex-col items-center gap-4 flex-shrink-0">
            <Link
              to="/register"
              className="inline-flex items-center gap-3 bg-[#D32F2F] text-white px-10 py-5 rounded-sm font-headline font-black text-[11px] uppercase tracking-[0.25em] hover:bg-[#B71C1C] transition-colors shadow-2xl shadow-[#D32F2F]/30 whitespace-nowrap"
            >
              Registrar mi automotora
              <span className="material-symbols-outlined">arrow_forward</span>
            </Link>
            <a
              href="#contacto"
              className="text-[#E5E2E3]/30 text-xs hover:text-[#E5E2E3]/60 transition-colors flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined !text-sm">chat</span>
              O hablá con nosotros primero
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default PaginaAterrizajeScreen;
