import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import TopNavBar from '../components/TopNavBar';
import Footer from '../components/Footer';
import { getVehicleById, getDealershipById, getVehicles, trackVehicleEvent } from '../services/api';
import useSEO from '../hooks/useSEO';

const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const Spec = ({ icon, label, value }) => (
  <div className="bg-[#131314] border border-[#E5E2E3]/5 p-4 md:p-6 flex flex-col gap-2 md:gap-3 rounded-lg">
    <span className="material-symbols-outlined text-[#D32F2F] !text-3xl">{icon}</span>
    <div>
      <span className="text-[9px] font-black uppercase tracking-[0.25em] text-[#E5E2E3]/40 mb-1 block">{label}</span>
      <span className="text-lg font-headline font-black text-[#E5E2E3] tracking-tight">{value}</span>
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
    image: vehicle?.images?.[0] || undefined,
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
        setError('No se pudo cargar el vehículo. Verifica que la API esté corriendo.');
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
      image: vehicle.images?.[0] || undefined,
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
      <div className="bg-[#0E0E0F] min-h-screen flex items-center justify-center">
        <TopNavBar />
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#D32F2F] border-t-transparent mt-16" />
      </div>
    );
  }

  if (error || !vehicle) {
    return (
      <div className="bg-[#0E0E0F] min-h-screen text-[#E5E2E3]">
        <TopNavBar />
        <div className="flex flex-col items-center justify-center min-h-[70vh] gap-6">
          <span className="material-symbols-outlined text-7xl text-[#E5E2E3]/35">
            directions_car_off
          </span>
          <p className="text-[#E5E2E3]/40 text-center max-w-sm">{error}</p>
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
    <div className="bg-[#0E0E0F] text-[#E5E2E3]">
      <TopNavBar />
      <main className="pt-20 md:pt-24 pb-20">

        {/* Breadcrumb */}
        <div className="px-4 md:px-8 max-w-screen-2xl mx-auto py-4">
          <div className="flex items-center gap-2 text-[#E5E2E3]/30 text-xs">
            <Link to="/" className="hover:text-[#D32F2F] transition-colors">Inventario</Link>
            <span className="material-symbols-outlined !text-sm">chevron_right</span>
            <span className="text-[#E5E2E3]/50">{vehicle.brand} {vehicle.model}</span>
          </div>
        </div>

        {/* Hero section */}
        <section className="px-4 md:px-8 max-w-screen-2xl mx-auto mt-6">
          <div className="flex flex-col lg:flex-row gap-10 items-start">

            {/* Left: image gallery */}
            <div className="lg:w-2/3 w-full">
              {(() => {
                const imgs = vehicle.imageUrls?.length > 0 ? vehicle.imageUrls : (vehicle.imageUrl ? [vehicle.imageUrl] : []);
                const cur = imgs[activeImg] || null;
                return (
                  <>
                    <div className="relative group overflow-hidden rounded-xl bg-[#131314] shadow-2xl">
                      {cur ? (
                        <img
                          className="w-full aspect-[21/10] object-cover group-hover:scale-[1.02] transition-transform duration-700"
                          src={cur}
                          alt={`${vehicle.brand} ${vehicle.model}`}
                        />
                      ) : (
                        <div className="w-full aspect-[21/10] flex items-center justify-center">
                          <span className="material-symbols-outlined text-[#E5E2E3]/35 !text-8xl">directions_car</span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
                      {imgs.length > 1 && (
                        <>
                          <button
                            onClick={() => setActiveImg(i => Math.max(0, i - 1))}
                            disabled={activeImg === 0}
                            className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white rounded-full w-9 h-9 flex items-center justify-center transition-colors disabled:opacity-30"
                          >
                            <span className="material-symbols-outlined !text-lg">chevron_left</span>
                          </button>
                          <button
                            onClick={() => setActiveImg(i => Math.min(imgs.length - 1, i + 1))}
                            disabled={activeImg === imgs.length - 1}
                            className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white rounded-full w-9 h-9 flex items-center justify-center transition-colors disabled:opacity-30"
                          >
                            <span className="material-symbols-outlined !text-lg">chevron_right</span>
                          </button>
                          <span className="absolute bottom-3 right-4 bg-black/60 text-white text-[10px] font-bold px-2 py-1 rounded">
                            {activeImg + 1} / {imgs.length}
                          </span>
                        </>
                      )}
                    </div>
                    {imgs.length > 1 && (
                      <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
                        {imgs.map((url, i) => (
                          <button
                            key={i}
                            onClick={() => setActiveImg(i)}
                            className={`flex-shrink-0 w-20 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                              activeImg === i ? 'border-[#D32F2F]' : 'border-transparent opacity-50 hover:opacity-80'
                            }`}
                          >
                            <img src={url} alt={`${vehicle.model} ${i + 1}`} className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Right: info panel */}
            <div className="lg:w-1/3 w-full">
              <div className="bg-[#131314] border border-[#E5E2E3]/10 p-4 sm:p-8 rounded-xl shadow-2xl sticky top-24">
                <span className="text-[#D32F2F] font-headline font-black text-[10px] uppercase tracking-[0.4em] block mb-4">
                  {vehicle.brand}
                </span>
                <h1 className="text-3xl md:text-4xl font-headline font-black tracking-tighter leading-none mb-2">
                  {vehicle.model}
                </h1>
                <p className="text-[#E5E2E3]/30 text-sm mb-2">{vehicle.year}</p>
                <p className="text-[#E5E2E3]/25 text-[10px] font-mono tracking-wider mb-6">Ref: #{vehicle.id.slice(0, 8).toUpperCase()}</p>

                <div className="flex items-baseline gap-2 mb-8">
                  <span className="text-3xl md:text-4xl font-headline font-black text-[#D32F2F]">
                    {fmt(vehicle.price)}
                  </span>
                  <span className="text-[#E5E2E3]/30 font-bold text-xs tracking-widest">USD</span>
                </div>

                {/* Quick specs */}
                <div className="grid grid-cols-2 gap-3 mb-8 text-xs">
                  {[
                    { icon: 'speed', label: 'Kilómetros', value: `${Number(vehicle.mileage).toLocaleString()} km` },
                    { icon: 'settings_input_component', label: 'Transmisión', value: vehicle.transmission },
                    { icon: 'local_gas_station', label: 'Combustible', value: vehicle.fuel },
                    { icon: 'calendar_month', label: 'Año', value: String(vehicle.year) },
                  ].map(({ icon, label, value }) => (
                    <div key={label} className="bg-[#0E0E0F] rounded-lg p-3">
                      <span className="material-symbols-outlined text-[#D32F2F] !text-base block mb-1">{icon}</span>
                      <span className="text-[#E5E2E3]/30 text-[9px] uppercase tracking-wider block">{label}</span>
                      <span className="text-[#E5E2E3] font-bold text-xs">{value}</span>
                    </div>
                  ))}
                </div>

                {/* WhatsApp CTA */}
                {whatsappUrl ? (
                  <button
                    onClick={handleWhatsApp}
                    className="w-full flex items-center justify-center gap-3 bg-[#25D366] hover:bg-[#20ba5a] text-white py-4 rounded-lg font-headline font-black uppercase tracking-[0.15em] text-xs transition-all shadow-[0_8px_24px_rgba(37,211,102,0.25)] mb-3"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    Consultar por WhatsApp
                  </button>
                ) : (
                  <div className="w-full py-4 rounded-lg bg-[#E5E2E3]/5 text-center text-[#E5E2E3]/30 text-xs mb-3">
                    Sin contacto configurado
                  </div>
                )}

                {/* Share button */}
                <button
                  onClick={handleShare}
                  className="w-full flex items-center justify-center gap-2 border border-[#E5E2E3]/10 text-[#E5E2E3]/40 py-3 rounded-lg font-bold text-xs uppercase tracking-widest hover:border-[#E5E2E3]/20 hover:text-[#E5E2E3]/60 transition-colors mb-3"
                >
                  <span className="material-symbols-outlined !text-base">{copied ? 'check' : 'share'}</span>
                  {copied ? '¡Enlace copiado!' : 'Compartir vehículo'}
                </button>

                <button
                  onClick={() => navigate(-1)}
                  className="w-full border border-[#E5E2E3]/10 text-[#E5E2E3]/40 py-3 rounded-lg font-bold text-xs uppercase tracking-widest hover:border-[#E5E2E3]/20 hover:text-[#E5E2E3]/60 transition-colors"
                >
                  Volver
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Specs grid */}
        <section className="px-4 md:px-8 max-w-screen-2xl mx-auto mt-12">
          <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#E5E2E3]/40 mb-6">
            Ficha Técnica
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <Spec icon="settings_input_component" label="Transmisión" value={vehicle.transmission} />
            <Spec icon="local_gas_station" label="Combustible" value={vehicle.fuel} />
            <Spec icon="speed" label="Kilometraje" value={`${Number(vehicle.mileage).toLocaleString()} km`} />
            <Spec icon="calendar_month" label="Año" value={String(vehicle.year)} />
            <Spec icon="tag" label="Referencia" value={`#${vehicle.id.slice(0, 8).toUpperCase()}`} />
          </div>

          {vehicle.description && (
            <div className="mt-8 bg-[#131314] border border-[#E5E2E3]/5 rounded-lg p-4 md:p-8">
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#E5E2E3]/40 mb-4">
                Descripción
              </h3>
              <p className="text-[#E5E2E3]/70 leading-relaxed">{vehicle.description}</p>
            </div>
          )}
        </section>

        {/* Dealership card */}
        {dealership && (
          <section className="px-4 md:px-8 max-w-screen-2xl mx-auto mt-12">
            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#E5E2E3]/40 mb-6">
              Vendido por
            </h2>
            <div className="bg-[#131314] border border-[#E5E2E3]/10 rounded-xl p-4 md:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 md:gap-6 hover:border-[#D32F2F]/30 transition-colors">
              <div className="w-16 h-16 rounded-xl bg-[#0E0E0F] border border-[#E5E2E3]/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {dealership.logoUrl ? (
                  <img src={dealership.logoUrl} alt={dealership.name} className="w-full h-full object-cover rounded-xl" />
                ) : (
                  <span className="material-symbols-outlined text-[#E5E2E3]/45 !text-3xl">garage</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[#E5E2E3] font-headline font-bold text-xl tracking-tight">
                  {dealership.name}
                </h3>
                <p className="text-[#E5E2E3]/40 text-sm mt-1">
                  {dealership.address}, {dealership.city}, {dealership.country}
                </p>
                <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-[#E5E2E3]/30">
                  {dealership.phone && (
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined !text-sm">phone</span>
                      {dealership.phone}
                    </span>
                  )}
                  {dealership.email && (
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined !text-sm">mail</span>
                      {dealership.email}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2 flex-shrink-0 w-full sm:w-auto">
                {whatsappUrl && (
                  <button
                    onClick={handleWhatsApp}
                    className="flex items-center justify-center gap-2 whitespace-nowrap bg-[#25D366]/10 text-[#25D366] border border-[#25D366]/20 px-4 py-2 rounded-lg text-xs font-bold hover:bg-[#25D366]/20 transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    WhatsApp
                  </button>
                )}
                <Link
                  to="/dealerships"
                  className="flex items-center justify-center gap-2 whitespace-nowrap bg-[#E5E2E3]/5 text-[#E5E2E3]/50 border border-[#E5E2E3]/10 px-4 py-2 rounded-lg text-xs font-bold hover:border-[#E5E2E3]/20 hover:text-[#E5E2E3]/70 transition-colors"
                >
                  <span className="material-symbols-outlined !text-sm">map</span>
                  Ver en mapa
                </Link>
                <Link
                  to={`/dealerships/${dealership.id}`}
                  className="flex items-center justify-center gap-2 whitespace-nowrap bg-primary/10 text-primary border border-primary/20 px-4 py-2 rounded-lg text-xs font-bold hover:bg-primary/20 transition-colors"
                >
                  <span className="material-symbols-outlined !text-sm">garage</span>
                  Ver perfil
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* Related vehicles */}
        {relatedVehicles.length > 0 && (
          <section className="px-4 md:px-8 max-w-screen-2xl mx-auto mt-12">
            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#E5E2E3]/40 mb-6">
              Más vehículos de esta automotora
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {relatedVehicles.map((v) => (
                <Link
                  key={v.id}
                  to={`/product/${encodeURIComponent(v.brand)}/${v.id}`}
                  className="bg-[#131314] border border-[#E5E2E3]/10 rounded-lg overflow-hidden hover:border-[#D32F2F]/30 transition-colors group"
                >
                  <div className="w-full h-36 bg-[#0E0E0F] overflow-hidden">
                    {v.imageUrl ? (
                      <img
                        src={v.imageUrl}
                        alt={v.model}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="material-symbols-outlined text-[#E5E2E3]/35 !text-4xl">directions_car</span>
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <p className="text-[#E5E2E3] font-bold text-sm truncate">{v.brand} {v.model}</p>
                    <p className="text-[#D32F2F] font-headline font-black text-sm mt-1">{fmt(v.price)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default ProductDetailScreen;
