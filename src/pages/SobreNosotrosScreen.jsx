import React from 'react';
import { Link } from 'react-router-dom';
import TopNavBar from '../components/TopNavBar';
import Footer from '../components/Footer';
import logoSrc from '../assets/Logo.png';
import useSEO from '../hooks/useSEO';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const SectionLabel = ({ children }) => (
  <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#D32F2F] mb-3">{children}</p>
);

const FeatureCard = ({ icon, title, description }) => (
  <div className="bg-[#131314] border border-[#E5E2E3]/8 rounded-xl p-6 flex flex-col gap-4 hover:border-[#D32F2F]/30 transition-colors">
    <div className="w-11 h-11 rounded-lg bg-[#D32F2F]/10 flex items-center justify-center flex-shrink-0">
      <span className="material-symbols-outlined text-[#D32F2F] !text-2xl">{icon}</span>
    </div>
    <div>
      <h3 className="font-headline font-black text-[#E5E2E3] text-lg tracking-tight mb-2">{title}</h3>
      <p className="text-[#E5E2E3]/50 text-sm leading-relaxed">{description}</p>
    </div>
  </div>
);

const BuyerBenefit = ({ icon, title, description }) => (
  <div className="flex gap-4 items-start">
    <span className="material-symbols-outlined text-[#D32F2F] !text-3xl flex-shrink-0 mt-0.5">{icon}</span>
    <div>
      <p className="text-[#E5E2E3] font-semibold text-sm mb-1">{title}</p>
      <p className="text-[#E5E2E3]/40 text-sm leading-relaxed">{description}</p>
    </div>
  </div>
);

const StatBlock = ({ value, label }) => (
  <div className="text-center">
    <p className="text-4xl md:text-5xl font-headline font-black text-[#D32F2F] tracking-tighter">{value}</p>
    <p className="text-[#E5E2E3]/40 text-xs uppercase tracking-widest mt-2">{label}</p>
  </div>
);

// ─── Page ──────────────────────────────────────────────────────────────────────
const SobreNosotrosScreen = () => {
  useSEO({
    title: 'Sobre Nosotros',
    description: 'Conocé el equipo detrás de RedAutos y nuestra misión de conectar compradores con los mejores concesionarios de Uruguay.',
    url: '/sobre-nosotros',
  });
  return (
    <div className="min-h-screen bg-[#0E0E0F] text-[#E5E2E3] font-body antialiased">
      <TopNavBar />

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section className="relative min-h-[85vh] md:min-h-screen flex flex-col items-center justify-center text-center px-5 pt-24 pb-16 overflow-hidden">
        {/* Background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-[#D32F2F]/8 rounded-full blur-[120px] pointer-events-none" />
        <div className="relative z-10 max-w-4xl mx-auto">
          <SectionLabel>El marketplace automotriz de Uruguay</SectionLabel>
          <h1 className="font-headline font-black text-4xl md:text-7xl lg:text-8xl tracking-tighter text-[#E5E2E3] leading-[0.95] mb-5 md:mb-6">
            Encontrá el auto<br />
            que <span className="text-[#D32F2F]">buscabas.</span><br />
            Sin vueltas.
          </h1>
          <p className="text-[#E5E2E3]/50 text-base md:text-xl leading-relaxed max-w-2xl mx-auto mb-8 md:mb-10">
            RedAutos reúne las automotoras de Uruguay en un solo lugar.
            Buscá, filtrá por lo que necesitás y contactá directamente — sin intermediarios.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/"
              className="bg-[#D32F2F] text-white px-8 py-4 rounded-sm font-headline font-black text-[11px] uppercase tracking-[0.2em] hover:bg-[#B71C1C] transition-colors"
            >
              Ver autos disponibles
            </Link>
            <Link
              to="/dealerships"
              className="border border-[#E5E2E3]/20 text-[#E5E2E3]/70 px-8 py-4 rounded-sm font-headline font-black text-[11px] uppercase tracking-[0.2em] hover:border-[#E5E2E3]/40 hover:text-[#E5E2E3] transition-colors"
            >
              Buscar automotoras
            </Link>
          </div>
        </div>
        {/* Scroll hint */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-bounce">
          <span className="material-symbols-outlined text-[#E5E2E3]/20 !text-xl">expand_more</span>
        </div>
      </section>

      {/* ── STATS BAR ──────────────────────────────────────────────────────── */}
      <section className="border-y border-[#E5E2E3]/8 bg-[#131314]">
        <div className="max-w-screen-xl mx-auto px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-4">
          <StatBlock value="100%" label="Digital y sin papeles" />
          <StatBlock value="24/7" label="Disponible siempre" />
          <StatBlock value="0" label="Comisión por venta" />
          <StatBlock value="1" label="Plataforma, todo en un lugar" />
        </div>
      </section>

      {/* ── QUÉ ES REDAUTOS ────────────────────────────────────────────────── */}
      <section className="max-w-screen-xl mx-auto px-5 md:px-6 py-14 md:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 md:gap-16 items-center">
          <div>
            <SectionLabel>¿Qué es RedAutos?</SectionLabel>
            <h2 className="font-headline font-black text-4xl md:text-5xl tracking-tighter text-[#E5E2E3] leading-tight mb-6">
              El marketplace automotriz<br />que Uruguay necesitaba.
            </h2>
            <p className="text-[#E5E2E3]/50 text-base leading-relaxed mb-4">
              RedAutos es una plataforma digital que conecta a las automotoras del país con los compradores de autos en tiempo real.
              Cada automotora tiene su propio panel de administración, su catálogo digital y su perfil público —
              todo sin necesidad de conocimientos técnicos.
            </p>
            <p className="text-[#E5E2E3]/50 text-base leading-relaxed">
              Pensada para el mercado uruguayo, pero con capacidad de escalar a toda la región.
              RedAutos no es una publicación de avisos: es un ecosistema completo donde la automotora gestiona
              su inventario, sigue métricas de interés y se mantiene visible las 24 horas del día.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FeatureCard icon="storefront" title="Perfil propio" description="Cada automotora tiene su página pública con logo, dirección, contacto e inventario completo." />
            <FeatureCard icon="directions_car" title="Catálogo digital" description="Publicá autos con fotos, precio, km, ficha técnica y estado de disponibilidad en segundos." />
            <FeatureCard icon="speed" title="Panel de métricas" description="Visualizá vistas, leads y compartidos de cada vehículo para tomar mejores decisiones." />
            <FeatureCard icon="map" title="Mapa de automotoras" description="Los compradores pueden encontrarte por ubicación, marca o tipo de vehículo que buscadan." />
          </div>
        </div>
      </section>

      {/* ── PARA COMPRADORES ──────────────────────────────────────────────── */}
      <section className="max-w-screen-xl mx-auto px-5 md:px-6 py-14 md:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 md:gap-16 items-center">
          <div>
            <SectionLabel>Para compradores</SectionLabel>
            <h2 className="font-headline font-black text-4xl md:text-5xl tracking-tighter text-[#E5E2E3] leading-tight mb-6">
              Encontrá tu próximo<br />auto sin vueltas.
            </h2>
            <p className="text-[#E5E2E3]/50 text-base leading-relaxed mb-10">
              RedAutos también beneficia a quienes quieren comprar. Una sola plataforma, múltiples automotoras,
              toda la información clara y sin salir de casa.
            </p>
            <div className="space-y-7">
              <BuyerBenefit
                icon="tune"
                title="Filtros avanzados"
                description="Buscá por marca, modelo, año, precio, combustible, transmisión y más. Encontrás exactamente lo que necesitás."
              />
              <BuyerBenefit
                icon="photo_library"
                title="Fotos reales de cada auto"
                description="Cada vehículo tiene sus propias fotos subidas por la automotora. Nada de imágenes genéricas."
              />
              <BuyerBenefit
                icon="location_on"
                title="Mapa de automotoras cercanas"
                description="Visualizá en el mapa cuáles automotoras tienen lo que buscas y a cuánta distancia están."
              />
              <BuyerBenefit
                icon="verified"
                title="Automotoras verificadas"
                description="Todas las automotoras en RedAutos son negocios reales con suscripción activa. Sin anunciantes particulares, sin spam."
              />
              <BuyerBenefit
                icon="chat"
                title="Contacto directo por WhatsApp"
                description="¿Te interesó un auto? Un clic y ya estás hablando con la automotora. Sin formularios ni esperas."
              />
            </div>
          </div>
          <div className="relative">
            <div className="absolute -top-6 -left-6 w-48 h-48 bg-[#D32F2F]/8 rounded-full blur-3xl pointer-events-none" />
            <div className="relative bg-[#131314] border border-[#E5E2E3]/8 rounded-2xl overflow-hidden">
              <div className="bg-[#0E0E0F] px-6 py-4 border-b border-[#E5E2E3]/8">
                <p className="text-xs text-[#E5E2E3]/30 font-semibold uppercase tracking-widest">Buscando vehículo</p>
                <div className="mt-2 flex gap-2 flex-wrap">
                  {['Toyota', 'Sedán', '2020–2024', 'Hasta $25k'].map((tag) => (
                    <span key={tag} className="bg-[#D32F2F]/10 text-[#FFB3AC] border border-[#D32F2F]/20 text-[10px] font-bold px-2.5 py-1 rounded-full">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="p-6 space-y-3">
                {[
                  { name: 'Toyota Corolla 2022', price: '$22,500', km: '38.000 km', auto: 'Automotora del Este' },
                  { name: 'Toyota Yaris 2023', price: '$19,900', km: '12.000 km', auto: 'CentroAutos Mvd' },
                  { name: 'Toyota C-HR 2021', price: '$24,800', km: '51.000 km', auto: 'AutoShop Norte' },
                ].map((car) => (
                  <div key={car.name} className="bg-[#0E0E0F] rounded-xl overflow-hidden border border-[#E5E2E3]/5 flex">
                    <div className="w-24 bg-[#E5E2E3]/3 flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-[#E5E2E3]/10 !text-3xl">directions_car</span>
                    </div>
                    <div className="p-3 flex-1 min-w-0">
                      <p className="text-[#E5E2E3]/80 text-sm font-semibold">{car.name}</p>
                      <p className="text-[#E5E2E3]/30 text-xs mt-0.5">{car.km} · {car.auto}</p>
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-[#D32F2F] font-headline font-black text-base">{car.price}</p>
                        <span className="text-[10px] bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full font-bold">
                          Disponible
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-6 pb-6">
                <div className="flex items-center gap-2 bg-[#25D366]/10 border border-[#25D366]/20 rounded-xl px-4 py-3">
                  <span className="material-symbols-outlined text-[#25D366] !text-xl">chat</span>
                  <p className="text-[#25D366]/80 text-sm font-semibold">Contactar por WhatsApp</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ──────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[#131314] border-t border-[#E5E2E3]/8">
        <div className="absolute inset-0 bg-gradient-to-br from-[#D32F2F]/15 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-screen-xl mx-auto px-5 md:px-6 py-14 md:py-28">
          <div className="max-w-3xl mx-auto text-center">
            <img src={logoSrc} alt="RedAutos" className="h-14 w-auto object-contain mx-auto mb-8 opacity-80" />
            <h2 className="font-headline font-black text-3xl md:text-6xl lg:text-7xl tracking-tighter text-[#E5E2E3] leading-tight mb-5 md:mb-6">
              El auto que buscás<br />
              <span className="text-[#D32F2F]">está en RedAutos.</span>
            </h2>
            <p className="text-[#E5E2E3]/50 text-lg max-w-xl mx-auto mb-10">
              Explorá el inventario de las mejores automotoras del país — todo en un solo lugar.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/"
                className="inline-flex items-center gap-3 bg-[#D32F2F] text-white px-10 py-5 rounded-sm font-headline font-black text-[11px] uppercase tracking-[0.25em] hover:bg-[#B71C1C] transition-colors shadow-xl shadow-[#D32F2F]/20 w-full sm:w-auto justify-center"
              >
                Ver autos disponibles
                <span className="material-symbols-outlined">arrow_forward</span>
              </Link>
              <Link
                to="/unirse"
                className="inline-flex items-center gap-2 border border-[#E5E2E3]/20 text-[#E5E2E3]/50 px-8 py-5 rounded-sm font-headline font-black text-[11px] uppercase tracking-[0.2em] hover:border-[#D32F2F]/40 hover:text-[#FFB3AC] transition-colors w-full sm:w-auto justify-center"
              >
                <span className="material-symbols-outlined !text-sm">store</span>
                ¿Sos automotora? Sumate
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default SobreNosotrosScreen;
