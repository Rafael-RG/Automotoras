import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import TopNavBar from '../components/TopNavBar';
import Footer from '../components/Footer';
import AdBanner from '../components/AdBanner';
import { getVehicleById, getDealershipById, getVehicles, trackVehicleEvent } from '../services/api';
import useSEO from '../hooks/useSEO';

const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const Spec = ({ icon, label, value }) => (
  <div className="bg-gray-100 dark:bg-[#131314] border border-gray-200 dark:border-[#E5E2E3]/5 p-4 md:p-6 flex flex-col gap-2 md:gap-3 rounded-lg">
    <span className="material-symbols-outlined text-[#D32F2F] !text-3xl">{icon}</span>
    <div>
      <span className="text-[9px] font-black uppercase tracking-[0.25em] text-gray-400 dark:text-[#E5E2E3]/40 mb-1 block">{label}</span>
      <span className="text-lg font-headline font-black dark:text-[#E5E2E3] tracking-tight" style={{ color: 'var(--fg)' }}>{value}</span>
    </div>
  </div>
);

const ProductDetailScreen = () => {
  const { brand, id } = useParams();
  const navigate = useNavigate();

  const [vehicle, setVehicle] = useState(null);
  const [dealership, setDealership] = useState(null);
  const [relatedVehicles, setRelatedVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [activeImg, setActiveImg] = useState(0);

  useSEO({
    title: vehicle
      ? `${vehicle.year} ${vehicle.brand} ${vehicle.model}${dealership ? ` – ${dealership.name}` : ''}`
      : 'Vehículo',
    description: vehicle
      ? `${vehicle.year} ${vehicle.brand} ${vehicle.model} con ${vehicle.mileage?.toLocaleString('es-UY')} km. USD ${vehicle.price?.toLocaleString('es-UY')}.${dealership ? ` Vendido por ${dealership.name} en ${dealership.city}.` : ''} Contactalo en RedAutos.`
      : '',
    image: vehicle?.imageUrls?.[0] || vehicle?.imageUrl || undefined,
    url: `/product/${brand}/${id}`,
    type: 'product',
  });

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const v = await getVehicleById(brand, id);
        if (!v) { setError('Vehículo no encontrado.'); return; }
        setVehicle(v);
        // Track view event (fire and forget)
        trackVehicleEvent(brand, id, 'view');

        const [d, all] = await Promise.all([
          getDealershipById(v.dealershipId).catch(() => null),
          getVehicles().catch(() => []),
        ]);
        setDealership(d);
        setRelatedVehicles(
          all.filter((x) => x.dealershipId === v.dealershipId && x.id !== v.id).slice(0, 4)
        );
      } catch {
        setError('No pudimos cargar la información de este vehículo. Por favor intentá de nuevo en unos momentos.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [brand, id]);

  // JSON-LD structured data for Google rich results
  useEffect(() => {
    if (!vehicle) return;
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'Car',
      name: `${vehicle.year} ${vehicle.brand} ${vehicle.model}`,
      brand: { '@type': 'Brand', name: vehicle.brand },
      model: vehicle.model,
      vehicleModelDate: String(vehicle.year),
      mileageFromOdometer: { '@type': 'QuantitativeValue', value: vehicle.mileage, unitCode: 'KMT' },
      fuelType: vehicle.fuel,
      vehicleTransmission: vehicle.transmission,
      bodyType: vehicle.bodyType,
      color: vehicle.color,
      offers: {
        '@type': 'Offer',
        price: vehicle.price,
        priceCurrency: 'USD',
        availability: vehicle.isAvailable
          ? 'https://schema.org/InStock'
          : 'https://schema.org/SoldOut',
        seller: dealership ? { '@type': 'AutoDealer', name: dealership.name, address: dealership.city } : undefined,
      },
      image: vehicle.imageUrls?.[0] || vehicle.imageUrl || undefined,
      url: `https://redautos.com.uy/product/${vehicle.brand}/${vehicle.id}`,
    };
    const el = document.createElement('script');
    el.id = 'vehicle-jsonld';
    el.type = 'application/ld+json';
    el.textContent = JSON.stringify(schema);
    document.head.appendChild(el);
    return () => { const s = document.getElementById('vehicle-jsonld'); if (s) s.remove(); };
  }, [vehicle, dealership]);

  const whatsappUrl = useMemo(() => {
    if (!vehicle || !dealership?.phone) return null;
    const phone = dealership.phone.replace(/\D/g, '');
    const msg = encodeURIComponent(
      `Hola! Vi el ${vehicle.brand} ${vehicle.model} ${vehicle.year} en RedAutos y estoy interesado. ¿Me pueden dar más información? (Ref: ${vehicle.id})`
    );
    return `https://wa.me/${phone}?text=${msg}`;
  }, [vehicle, dealership]);

  const handleWhatsApp = () => {
    trackVehicleEvent(vehicle.brand, vehicle.id, 'lead');
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  const handleShare = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      trackVehicleEvent(vehicle.brand, vehicle.id, 'share');
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback: browser doesn't support clipboard
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <TopNavBar />
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent mt-16" />
      </div>
    );
  }

  if (error || !vehicle) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--fg)' }}>
        <TopNavBar />
        <div className="flex flex-col items-center justify-center min-h-[70vh] gap-6">
          <span className="material-symbols-outlined text-7xl" style={{ color: 'var(--fg-muted)' }}>
            directions_car_off
          </span>
          <p className="text-center max-w-sm" style={{ color: 'var(--fg-muted)' }}>{error}</p>
          <Link
            to="/"
            className="bg-[#D32F2F] text-white px-8 py-3 rounded-lg font-bold text-sm hover:bg-[#B71C1C] transition-colors"
          >
            Volver al inventario
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--fg)' }}>
      <TopNavBar />

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          MOBILE LAYOUT (< md) — Stacked frames
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <div className="md:hidden">
        {(() => {
          const imgs = vehicle.imageUrls?.length > 0 ? vehicle.imageUrls : (vehicle.imageUrl ? [vehicle.imageUrl] : []);
          const cur = imgs[activeImg] || null;
          return (
            <>
              {/* Hero image — full width */}
              <div className="relative w-full h-[45vh] bg-black overflow-hidden">
                {cur ? (
                  <img src={cur} alt={`${vehicle.brand} ${vehicle.model}`} className="w-full h-full object-cover opacity-90" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-[#0E0E0F]">
                    <span className="material-symbols-outlined text-[#353436] !text-8xl">directions_car</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

                {/* Back button */}
                <button
                  onClick={() => navigate(-1)}
                  className="absolute top-4 left-4 z-10 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white"
                >
                  <span className="material-symbols-outlined !text-[20px]">arrow_back</span>
                </button>

                {/* Share button */}
                <button
                  onClick={handleShare}
                  className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white"
                >
                  <span className="material-symbols-outlined !text-[20px]">{copied ? 'check' : 'share'}</span>
                </button>

                {/* Image dots */}
                {imgs.length > 1 && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                    {imgs.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setActiveImg(i)}
                        className={`h-1.5 rounded-full transition-all ${i === activeImg ? 'w-5 bg-primary' : 'w-1.5 bg-white/40'}`}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Details frame */}
              <div
                className="rounded-t-[32px] -mt-8 relative z-10 pt-2 pb-32"
                style={{ background: 'var(--bg-card)', boxShadow: '0 -8px 30px var(--shadow-frame)' }}
              >
                {/* Drag handle */}
                <div className="w-12 h-1.5 rounded-full mx-auto mt-3 mb-5" style={{ background: 'var(--border)' }} />

                <div className="px-5 flex flex-col gap-5">
                  {/* Thumbnail strip — right below hero, easy to reach */}
                  {imgs.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                      {imgs.map((url, i) => (
                        <button
                          key={`thumb-${url}`}
                          onClick={() => setActiveImg(i)}
                          className="flex-shrink-0 w-16 h-12 rounded-xl overflow-hidden transition-all"
                          style={{ border: `2px solid ${i === activeImg ? '#D32F2F' : 'transparent'}`, opacity: i === activeImg ? 1 : 0.5 }}
                        >
                          <img src={url} alt={`${vehicle.model} ${i + 1}`} className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Brand + model + price */}
                  <div>
                    <p className="text-primary text-[11px] font-black uppercase tracking-widest mb-1">{vehicle.brand}</p>
                    <h1 className="text-[28px] font-black tracking-tight leading-tight mb-1" style={{ color: 'var(--fg)' }}>
                      {vehicle.model}
                    </h1>
                    <p className="text-sm mb-3" style={{ color: 'var(--fg-muted)' }}>{vehicle.year}</p>
                    <p className="text-3xl font-black text-primary">{fmt(vehicle.price)}</p>
                  </div>

                  {/* Quick specs row */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { icon: 'speed', label: 'Km', value: `${Number(vehicle.mileage).toLocaleString()}` },
                      { icon: 'settings_input_component', label: 'Transmisión', value: vehicle.transmission },
                      { icon: 'local_gas_station', label: 'Combustible', value: vehicle.fuel },
                    ].map(({ icon, label, value }) => (
                      <div
                        key={label}
                        className="flex flex-col items-center gap-2 py-4 rounded-2xl"
                        style={{ background: 'var(--bg-input)' }}
                      >
                        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'var(--frame-high)' }}>
                          <span className="material-symbols-outlined text-primary !text-[18px]">{icon}</span>
                        </div>
                        <p className="text-xs font-black" style={{ color: 'var(--fg)' }}>{value}</p>
                        <p className="text-[10px]" style={{ color: 'var(--fg-muted)' }}>{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Extra specs */}
                  {(vehicle.color || vehicle.doors || vehicle.engine || vehicle.bodyType) && (
                    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-input)' }}>
                      {[
                        { label: 'Carrocería', value: vehicle.bodyType },
                        { label: 'Color', value: vehicle.color },
                        { label: 'Puertas', value: vehicle.doors ? `${vehicle.doors} puertas` : null },
                        { label: 'Motor', value: vehicle.engine },
                        { label: 'Año', value: String(vehicle.year) },
                        { label: 'Referencia', value: `#${vehicle.id.slice(0, 8).toUpperCase()}` },
                      ].filter(s => s.value).map((s, i, arr) => (
                        <div
                          key={s.label}
                          className="flex justify-between items-center px-4 py-3"
                          style={{ borderBottom: i < arr.length - 1 ? `1px solid var(--border)` : 'none' }}
                        >
                          <span className="text-sm" style={{ color: 'var(--fg-muted)' }}>{s.label}</span>
                          <span className="text-sm font-bold" style={{ color: 'var(--fg)' }}>{s.value}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Description */}
                  {vehicle.description && (
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-2">Descripción</p>
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--fg-muted)' }}>{vehicle.description}</p>
                    </div>
                  )}

                  {/* Vendido por */}
                  {dealership && (
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-3">Vendido por</p>
                      <div className="rounded-2xl p-4 flex items-center gap-4 border" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }}>
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                          {dealership.logoUrl
                            ? <img src={dealership.logoUrl} alt={dealership.name} className="w-full h-full object-contain p-1" />
                            : <span className="material-symbols-outlined !text-2xl" style={{ color: 'var(--fg-muted)' }}>garage</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-sm" style={{ color: 'var(--fg)' }}>{dealership.name}</p>
                          <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>{dealership.city}, {dealership.country}</p>
                        </div>
                        <Link to={`/dealerships/${dealership.id}`}
                          className="flex items-center gap-1 bg-primary/10 text-primary border border-primary/20 px-3 py-2 rounded-xl text-xs font-bold flex-shrink-0">
                          <span className="material-symbols-outlined !text-[14px]">arrow_forward</span>{' '}Ver
                        </Link>
                      </div>
                    </div>
                  )}

                  <AdBanner />
                </div>
              </div>

              {/* Fixed bottom CTA */}
              <div
                className="fixed bottom-0 left-0 right-0 z-50 px-5 py-4"
                style={{ background: 'var(--bg-card)', borderTop: `1px solid var(--border)`, backdropFilter: 'blur(16px)' }}
              >
                <div className="flex gap-3">
                  {whatsappUrl ? (
                    <button
                      onClick={handleWhatsApp}
                      className="flex-1 flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20ba5a] text-white py-4 rounded-2xl font-black uppercase tracking-wider text-sm transition-all shadow-lg active:scale-[0.98]"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </svg>
                      WhatsApp
                    </button>
                  ) : (
                    <div className="flex-1 py-4 rounded-2xl text-center text-sm font-bold" style={{ background: 'var(--bg-input)', color: 'var(--fg-muted)' }}>
                      Sin contacto
                    </div>
                  )}

                  {/* Share button */}
                  <button
                    onClick={handleShare}
                    className="w-14 h-14 rounded-2xl flex items-center justify-center transition-all active:scale-[0.95]"
                    style={{ background: 'var(--bg-input)', border: `1px solid var(--border)` }}
                    aria-label="Compartir"
                  >
                    <span className="material-symbols-outlined !text-[22px] text-primary">{copied ? 'check' : 'share'}</span>
                  </button>

                  {/* Dealership profile link */}
                  {dealership && (
                    <Link
                      to={`/dealerships/${dealership.id}`}
                      className="w-14 h-14 rounded-2xl flex items-center justify-center transition-all active:scale-[0.95]"
                      style={{ background: 'var(--bg-input)', border: `1px solid var(--border)` }}
                      aria-label="Ver automotora"
                    >
                      <span className="material-symbols-outlined !text-[22px] text-primary">garage</span>
                    </Link>
                  )}
                </div>
              </div>
            </>
          );
        })()}
      </div>

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          DESKTOP LAYOUT (≥ md) — stacked frames
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <div className="hidden md:block pt-16">
        {(() => {
          const imgs = vehicle.imageUrls?.length > 0 ? vehicle.imageUrls : (vehicle.imageUrl ? [vehicle.imageUrl] : []);
          const cur = imgs[activeImg] || null;
          return (
            <>
              {/* Hero image — full width */}
              <div className="relative w-full h-[58vh] min-h-[400px] bg-black overflow-hidden">
                {cur ? (
                  <img src={cur} alt={`${vehicle.brand} ${vehicle.model}`} className="w-full h-full object-cover opacity-90" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--bg-input)' }}>
                    <span className="material-symbols-outlined !text-[120px]" style={{ color: 'var(--border)' }}>directions_car</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />

                {/* Prev/Next arrows */}
                {imgs.length > 1 && (
                  <>
                    <button onClick={() => setActiveImg(i => Math.max(0, i - 1))} disabled={activeImg === 0}
                      className="absolute left-6 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-primary text-white w-11 h-11 rounded-full flex items-center justify-center transition-all disabled:opacity-30">
                      <span className="material-symbols-outlined">chevron_left</span>
                    </button>
                    <button onClick={() => setActiveImg(i => Math.min(imgs.length - 1, i + 1))} disabled={activeImg === imgs.length - 1}
                      className="absolute right-6 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-primary text-white w-11 h-11 rounded-full flex items-center justify-center transition-all disabled:opacity-30">
                      <span className="material-symbols-outlined">chevron_right</span>
                    </button>
                    <span className="absolute bottom-6 right-6 bg-black/60 text-white text-xs font-bold px-3 py-1.5 rounded-full">
                      {activeImg + 1} / {imgs.length}
                    </span>
                  </>
                )}

                {/* Back + share floating buttons */}
                <button onClick={() => navigate(-1)}
                  className="absolute top-6 left-6 flex items-center gap-2 bg-black/50 backdrop-blur-sm text-white px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider hover:bg-black/70 transition-all">
                  <span className="material-symbols-outlined !text-[16px]">arrow_back</span>{' '}
                  Volver
                </button>
                <button onClick={handleShare}
                  className="absolute top-6 right-6 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-all">
                  <span className="material-symbols-outlined !text-[20px]">{copied ? 'check' : 'share'}</span>
                </button>

                {/* Dot indicators */}
                {imgs.length > 1 && (
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
                    {imgs.map((url, i) => (
                      <button key={`dot-desktop-${url}`} onClick={() => setActiveImg(i)}
                        className={`h-1.5 rounded-full transition-all ${i === activeImg ? 'w-8 bg-primary' : 'w-2 bg-white/40'}`} />
                    ))}
                  </div>
                )}
              </div>

              {/* Thumbnail strip — between hero and frame */}
              {imgs.length > 1 && (
                <div className="relative z-20 px-10 py-3 flex gap-3 overflow-x-auto bg-black" style={{ scrollbarWidth: 'none' }}>
                  {imgs.map((url, i) => (
                    <button
                      key={`strip-${url}`}
                      onClick={() => setActiveImg(i)}
                      className="flex-shrink-0 w-28 h-18 rounded-xl overflow-hidden transition-all"
                      style={{
                        height: '72px',
                        border: `2px solid ${i === activeImg ? '#D32F2F' : 'rgba(255,255,255,0.15)'}`,
                        opacity: i === activeImg ? 1 : 0.55,
                      }}
                    >
                      <img src={url} alt={`${vehicle.model} ${i + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}

              {/* Main frame */}
              <div className="rounded-t-[48px] -mt-10 relative z-10 pb-20"
                style={{ background: 'var(--bg-card)', boxShadow: '0 -12px 40px var(--shadow-frame)' }}>
                <div className="w-14 h-1.5 rounded-full mx-auto mt-4 mb-8" style={{ background: 'var(--border)' }} />

                <div className="max-w-screen-xl mx-auto px-10 flex gap-12 items-start">

                  {/* Left column — gallery thumbnails + specs + description + dealership */}
                  <div className="flex-1 min-w-0">

                  {/* Ficha Técnica */}
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-4" style={{ color: 'var(--fg-muted)' }}>Ficha Técnica</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
                      <Spec icon="settings_input_component" label="Transmisión" value={vehicle.transmission} />
                      <Spec icon="local_gas_station" label="Combustible" value={vehicle.fuel} />
                      <Spec icon="speed" label="Kilometraje" value={`${Number(vehicle.mileage).toLocaleString()} km`} />
                      <Spec icon="calendar_month" label="Año" value={String(vehicle.year)} />
                      {vehicle.color && <Spec icon="palette" label="Color" value={vehicle.color} />}
                      {vehicle.doors > 0 && <Spec icon="sensor_door" label="Puertas" value={String(vehicle.doors)} />}
                      {vehicle.engine && <Spec icon="settings" label="Motor" value={vehicle.engine} />}
                      <Spec icon="tag" label="Referencia" value={`#${vehicle.id.slice(0, 8).toUpperCase()}`} />
                    </div>

                    {/* Description */}
                    {vehicle.description && (
                      <div className="rounded-2xl p-6 mb-8 border" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }}>
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-3" style={{ color: 'var(--fg-muted)' }}>Descripción</p>
                        <p className="leading-relaxed text-sm" style={{ color: 'var(--fg-muted)' }}>{vehicle.description}</p>
                      </div>
                    )}

                    {/* Dealership card */}
                    {dealership && (
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-4" style={{ color: 'var(--fg-muted)' }}>Vendido por</p>
                        <div className="rounded-2xl p-5 flex items-center gap-5 border hover:border-primary/30 transition-colors"
                          style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }}>
                          <div className="w-14 h-14 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0 border"
                            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                            {dealership.logoUrl
                              ? <img src={dealership.logoUrl} alt={dealership.name} className="w-full h-full object-contain p-1" />
                              : <span className="material-symbols-outlined !text-3xl" style={{ color: 'var(--fg-muted)' }}>garage</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-headline font-bold text-lg tracking-tight" style={{ color: 'var(--fg)' }}>{dealership.name}</h3>
                            <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>{dealership.address}, {dealership.city}</p>
                            <div className="flex flex-wrap gap-3 mt-1 text-xs" style={{ color: 'var(--fg-muted)' }}>
                              {dealership.phone && <span className="flex items-center gap-1"><span className="material-symbols-outlined !text-sm text-primary">phone</span>{dealership.phone}</span>}
                              {dealership.email && <span className="flex items-center gap-1"><span className="material-symbols-outlined !text-sm text-primary">mail</span>{dealership.email}</span>}
                            </div>
                          </div>
                          <div className="flex flex-col gap-2 flex-shrink-0">
                            <Link to={`/dealerships/${dealership.id}`}
                              className="flex items-center gap-2 bg-primary/10 text-primary border border-primary/20 px-4 py-2 rounded-xl text-xs font-bold hover:bg-primary/20 transition-colors">
                              <span className="material-symbols-outlined !text-sm">garage</span>Ver perfil
                            </Link>
                            {dealership.latitude !== 0 && (
                              <a href={`https://www.google.com/maps/dir/?api=1&destination=${dealership.latitude},${dealership.longitude}`}
                                target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-[#4285F4] hover:underline border"
                                style={{ borderColor: 'var(--border)' }}>
                                <span className="material-symbols-outlined !text-sm">directions</span>Cómo llegar
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    <AdBanner className="mt-8" />

                    {/* Related vehicles */}
                    {relatedVehicles.length > 0 && (
                      <div className="mt-10">
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-4" style={{ color: 'var(--fg-muted)' }}>Más de esta automotora</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {relatedVehicles.map((v) => {
                            const thumb = v.imageUrls?.length > 0 ? v.imageUrls[0] : v.imageUrl;
                            return (
                              <Link key={v.id} to={`/product/${encodeURIComponent(v.brand)}/${v.id}`}
                                className="rounded-2xl overflow-hidden hover:scale-[1.02] hover:shadow-lg transition-all flex flex-col border"
                                style={{ background: 'var(--frame-mid)', borderColor: 'var(--border)' }}>
                                <div className="w-full h-32 overflow-hidden">
                                  {thumb
                                    ? <img src={thumb} alt={v.model} className="w-full h-full object-cover transition-transform duration-500 hover:scale-105" />
                                    : <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--bg-input)' }}><span className="material-symbols-outlined !text-4xl" style={{ color: 'var(--border)' }}>directions_car</span></div>}
                                </div>
                                <div className="p-3">
                                  <p className="text-[9px] font-black uppercase tracking-wider text-primary">{v.brand}</p>
                                  <p className="font-black text-sm tracking-tight" style={{ color: 'var(--fg)' }}>{v.model}</p>
                                  <p className="font-black text-primary text-sm mt-1">{fmt(v.price)}</p>
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right column — sticky info + CTA */}
                  <div className="w-96 flex-shrink-0">
                    <div className="sticky top-24 rounded-2xl p-6 border flex flex-col gap-5" style={{ background: 'var(--frame-mid)', borderColor: 'var(--border)' }}>
                      <div>
                        <p className="text-primary text-[11px] font-black uppercase tracking-widest mb-1">{vehicle.brand}</p>
                        <h1 className="text-3xl font-headline font-black tracking-tighter leading-tight" style={{ color: 'var(--fg)' }}>{vehicle.model}</h1>
                        <p className="text-sm mt-1" style={{ color: 'var(--fg-muted)' }}>{vehicle.year}</p>
                      </div>

                      <p className="text-3xl font-headline font-black text-primary">{fmt(vehicle.price)} <span className="text-sm font-bold" style={{ color: 'var(--fg-muted)' }}>USD</span></p>

                      {/* Quick specs */}
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { icon: 'speed', label: 'Km', value: `${Number(vehicle.mileage).toLocaleString()}` },
                          { icon: 'settings_input_component', label: 'Transmisión', value: vehicle.transmission },
                          { icon: 'local_gas_station', label: 'Combustible', value: vehicle.fuel },
                          { icon: 'calendar_month', label: 'Año', value: String(vehicle.year) },
                        ].map(({ icon, label, value }) => (
                          <div key={label} className="rounded-xl p-3 flex flex-col gap-1.5" style={{ background: 'var(--bg-card)' }}>
                            <span className="material-symbols-outlined text-primary !text-[18px]">{icon}</span>
                            <span className="text-xs font-black" style={{ color: 'var(--fg)' }}>{value}</span>
                            <span className="text-[10px]" style={{ color: 'var(--fg-muted)' }}>{label}</span>
                          </div>
                        ))}
                      </div>

                      {/* WhatsApp CTA */}
                      {whatsappUrl ? (
                        <button onClick={handleWhatsApp}
                          className="w-full flex items-center justify-center gap-3 bg-[#25D366] hover:bg-[#20ba5a] text-white py-4 rounded-2xl font-black uppercase tracking-wider text-sm transition-all shadow-lg active:scale-[0.98]">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                          </svg>
                          Consultar por WhatsApp
                        </button>
                      ) : (
                        <div className="w-full py-4 rounded-2xl text-center text-sm font-bold" style={{ background: 'var(--bg-input)', color: 'var(--fg-muted)' }}>Sin contacto configurado</div>
                      )}

                      {/* Secondary actions */}
                      <div className="flex gap-3">
                        <button onClick={handleShare}
                          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-xs uppercase tracking-wider border transition-all"
                          style={{ borderColor: 'var(--border)', color: 'var(--fg-muted)', background: 'var(--bg-card)' }}>
                          <span className="material-symbols-outlined !text-[18px] text-primary">{copied ? 'check' : 'share'}</span>
                          {copied ? 'Copiado' : 'Compartir'}
                        </button>
                        {dealership && (
                          <Link to={`/dealerships/${dealership.id}`}
                            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-xs uppercase tracking-wider border transition-all"
                            style={{ borderColor: 'var(--border)', color: 'var(--fg-muted)', background: 'var(--bg-card)' }}>
                            <span className="material-symbols-outlined !text-[18px] text-primary">garage</span>{' '}
                            Automotora
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          );
        })()}
      </div>
      <Footer />
    </div>
  );
};

export default ProductDetailScreen;
