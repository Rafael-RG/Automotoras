import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import TopNavBar from '../components/TopNavBar';
import Footer from '../components/Footer';
import { getVehicles, getDealerships } from '../services/api';
import { VEHICLE_MODELS, VEHICLE_BRANDS } from '../constants/vehicles';
import useSEO from '../hooks/useSEO';

const HERO_IMAGES = [
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBFekBUfcvEyywcbMwbE8ga9QlZ9b8beF7ue62jNZitJw74aebXZzcQQXoHARNOHrx8qwkCuROfv8EPpfEuse5SKEp2f-0nBwoNV284FE5enRd22-VgOUJ5mjPkqaNVtV7DRGwBiwtEkJFLiFMGNwdy5TRw6uToo8f9tNUHDd2Q3O3GhuNVox67cbb4AQBc4huc0j_-40eTUgeoZRczg2uzMAt-K0XojTDJmVen-IXkL5DN2Gx6Vlvu1F8__i8-DETUT_T6G1mHrvM',
  'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1600&q=80',
  'https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=1600&q=80',
  'https://images.unsplash.com/photo-1493238792000-8113da705763?w=1600&q=80',
  'https://images.unsplash.com/photo-1525609004556-c46c7d6cf023?w=1600&q=80',
];

const FilterChip = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`px-3 py-2 text-[10px] font-black uppercase tracking-widest rounded-sm border transition-all ${
      active
        ? 'border-primary bg-primary/10 text-primary'
        : 'border-[#353436] bg-[#1C1B1F]/50 text-[#E5E2E3]/40 hover:border-primary/50 hover:text-primary/70'
    }`}
  >
    {label}
  </button>
);

const RangeInput = ({ label, minVal, maxVal, onMinChange, onMaxChange, prefix = '', placeholder = ['Mín', 'Máx'] }) => (
  <div>
    <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-3">{label}</p>
    <div className="flex gap-2">
      <input
        type="number"
        value={minVal}
        onChange={(e) => onMinChange(e.target.value)}
        placeholder={placeholder[0]}
        className="w-full bg-[#1C1B1F] border border-[#353436] rounded-sm px-3 py-2 text-[#E5E2E3] text-xs focus:border-primary/50 focus:outline-none placeholder:text-[#E5E2E3]/50"
      />
      <input
        type="number"
        value={maxVal}
        onChange={(e) => onMaxChange(e.target.value)}
        placeholder={placeholder[1]}
        className="w-full bg-[#1C1B1F] border border-[#353436] rounded-sm px-3 py-2 text-[#E5E2E3] text-xs focus:border-primary/50 focus:outline-none placeholder:text-[#E5E2E3]/50"
      />
    </div>
  </div>
);

const InventoryScreen = () => {
  useSEO({
    title: 'Autos en Uruguay',
    description: 'Encontrá autos, camionetas, SUVs y más en los mejores concesionarios de Uruguay. Filtrá por marca, precio, año y kilómetros.',
    url: '/',
  });
  const navigate = useNavigate();
  const [allVehicles, setAllVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter state
  const [search, setSearch] = useState('');
  const [filterBrand, setFilterBrand] = useState(null);
  const [filterModel, setFilterModel] = useState(null);
  const [filterFuel, setFilterFuel] = useState(null);
  const [filterTrans, setFilterTrans] = useState(null);
  const [filterBody, setFilterBody] = useState(null);
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [brandSearch, setBrandSearch] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [yearMin, setYearMin] = useState('');
  const [yearMax, setYearMax] = useState('');
  const [kmMax, setKmMax] = useState('');
  const [sortBy, setSortBy] = useState('default');
  const [showFilters, setShowFilters] = useState(false);

  // Infinite scroll
  const PAGE = 12;
  const [visibleCount, setVisibleCount] = useState(PAGE);
  const sentinelRef = useRef(null);

  // Geolocation + distance filter
  const [dealershipMap, setDealershipMap] = useState({});
  const [userLocation, setUserLocation] = useState(null); // { lat, lng }
  const [locationStatus, setLocationStatus] = useState('idle'); // idle | loading | granted | denied
  const [distanceMax, setDistanceMax] = useState('');

  // Hero slideshow
  const [heroIndex, setHeroIndex] = useState(0);
  const heroTimerRef = useRef(null);

  const restartHeroTimer = () => {
    clearInterval(heroTimerRef.current);
    heroTimerRef.current = setInterval(() => setHeroIndex(i => (i + 1) % HERO_IMAGES.length), 5000);
  };

  useEffect(() => {
    restartHeroTimer();
    return () => clearInterval(heroTimerRef.current);
  }, []);

  const heroPrev = () => { setHeroIndex(i => (i - 1 + HERO_IMAGES.length) % HERO_IMAGES.length); restartHeroTimer(); };
  const heroNext = () => { setHeroIndex(i => (i + 1) % HERO_IMAGES.length); restartHeroTimer(); };

  // Haversine distance in km
  const haversine = (lat1, lng1, lat2, lng2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const requestLocation = () => {
    setLocationStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationStatus('granted');
      },
      () => setLocationStatus('denied')
    );
  };

  useEffect(() => {
    Promise.all([getVehicles(), getDealerships()])
      .then(([vehicles, dealerships]) => {
        setAllVehicles(vehicles);
        const map = {};
        dealerships.forEach(d => { map[d.id] = d; });
        setDealershipMap(map);
      })
      .catch(() => setError('No se pudo conectar con el servidor. Verifica que la API esté corriendo.'))
      .finally(() => setLoading(false));
  }, []);

  // Derived options
  const brands    = useMemo(() => VEHICLE_BRANDS, []);
  const models    = useMemo(() => {
    if (filterBrand && VEHICLE_MODELS[filterBrand]) {
      return VEHICLE_MODELS[filterBrand];
    }
    const source = filterBrand
      ? allVehicles.filter(v => v.isAvailable && v.brand === filterBrand)
      : allVehicles.filter(v => v.isAvailable);
    return [...new Set(source.map(v => v.model).filter(Boolean))].sort();
  }, [allVehicles, filterBrand]);
  const fuels     = useMemo(() => [...new Set(allVehicles.filter(v => v.isAvailable).map(v => v.fuel).filter(Boolean))].sort(), [allVehicles]);
  const transList = useMemo(() => [...new Set(allVehicles.filter(v => v.isAvailable).map(v => v.transmission).filter(Boolean))].sort(), [allVehicles]);
  const bodyTypes = useMemo(() => [...new Set(allVehicles.filter(v => v.isAvailable).map(v => v.bodyType).filter(Boolean))].sort(), [allVehicles]);

  // Filtered + sorted vehicles
  const vehicles = useMemo(() => {
    let r = allVehicles.filter(v => v.isAvailable);
    if (search) { const q = search.toLowerCase(); r = r.filter(v => `${v.brand} ${v.model} ${v.year}`.toLowerCase().includes(q)); }
    if (filterBrand) r = r.filter(v => v.brand === filterBrand);
    if (filterModel) r = r.filter(v => v.model === filterModel);
    if (filterFuel)  r = r.filter(v => v.fuel === filterFuel);
    if (filterTrans) r = r.filter(v => v.transmission === filterTrans);
    if (filterBody)  r = r.filter(v => v.bodyType === filterBody);
    if (priceMin) r = r.filter(v => v.price >= Number(priceMin));
    if (priceMax) r = r.filter(v => v.price <= Number(priceMax));
    if (yearMin)  r = r.filter(v => v.year  >= Number(yearMin));
    if (yearMax)  r = r.filter(v => v.year  <= Number(yearMax));
    if (kmMax)    r = r.filter(v => v.mileage <= Number(kmMax));
    if (distanceMax && userLocation) {
      const maxKm = Number(distanceMax);
      r = r.filter(v => {
        const d = dealershipMap[v.dealershipId];
        if (!d || (d.latitude === 0 && d.longitude === 0)) return true;
        return haversine(userLocation.lat, userLocation.lng, d.latitude, d.longitude) <= maxKm;
      });
    }

    const s = [...r];
    if (sortBy === 'price-asc')  return s.sort((a, b) => a.price - b.price);
    if (sortBy === 'price-desc') return s.sort((a, b) => b.price - a.price);
    if (sortBy === 'year-desc')  return s.sort((a, b) => b.year - a.year);
    if (sortBy === 'year-asc')   return s.sort((a, b) => a.year - b.year);
    if (sortBy === 'km-asc')     return s.sort((a, b) => a.mileage - b.mileage);
    return s;
  }, [allVehicles, search, filterBrand, filterModel, filterFuel, filterTrans, filterBody, priceMin, priceMax, yearMin, yearMax, kmMax, distanceMax, userLocation, dealershipMap, sortBy]);

  const hasFilters = search || filterBrand || filterModel || filterFuel || filterTrans || filterBody ||
    priceMin || priceMax || yearMin || yearMax || kmMax || distanceMax;

  // Reset visible count when filters/sort change
  useEffect(() => { setVisibleCount(PAGE); }, [vehicles]);

  // IntersectionObserver to load more
  const handleSentinel = useCallback((entries) => {
    if (entries[0].isIntersecting) {
      setVisibleCount((prev) => Math.min(prev + PAGE, vehicles.length));
    }
  }, [vehicles.length]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(handleSentinel, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleSentinel]);

  const clearAll = () => {
    setSearch(''); setFilterBrand(null); setFilterModel(null); setFilterFuel(null); setFilterTrans(null);
    setFilterBody(null); setPriceMin(''); setPriceMax('');
    setYearMin(''); setYearMax(''); setKmMax(''); setDistanceMax('');
  };

  return (
    <div className="bg-[#0E0E0F]">
      <TopNavBar />
      <main className="pt-20 md:pt-36 pb-20 px-4 md:px-12 max-w-screen-2xl mx-auto">

        {/* Hero Slideshow */}
        <section className="mb-10 md:mb-20">
          <div className="relative overflow-hidden rounded-sm bg-black h-[220px] sm:h-[360px] md:h-[520px] flex items-center px-5 md:px-16 border border-[#353436]/30 group">

            {/* Images — crossfade */}
            {HERO_IMAGES.map((src, idx) => (
              <div
                key={idx}
                className="absolute inset-0 z-0 transition-opacity duration-1000"
                style={{ opacity: idx === heroIndex ? 1 : 0 }}
              >
                <img
                  className="w-full h-full object-cover opacity-50 grayscale"
                  src={src}
                  alt={`Hero ${idx + 1}`}
                />
                <div className="absolute inset-0 bg-gradient-to-r from-black via-black/60 to-transparent" />
              </div>
            ))}

            {/* Text */}
            <div className="relative z-10 max-w-3xl">
              <h1 className="font-headline text-3xl sm:text-5xl md:text-7xl font-black text-white leading-[1] tracking-tighter">
                Tu próximo auto,<br /><span className="text-primary italic">te está esperando.</span>
              </h1>
            </div>

            {/* Prev / Next arrows */}
            <button
              onClick={heroPrev}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-20 bg-black/40 hover:bg-primary/80 border border-white/10 text-white w-10 h-10 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300"
            >
              <span className="material-symbols-outlined !text-lg">chevron_left</span>
            </button>
            <button
              onClick={heroNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-20 bg-black/40 hover:bg-primary/80 border border-white/10 text-white w-10 h-10 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300"
            >
              <span className="material-symbols-outlined !text-lg">chevron_right</span>
            </button>

            {/* Dot indicators */}
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 flex gap-2">
              {HERO_IMAGES.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => { setHeroIndex(idx); restartHeroTimer(); }}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    idx === heroIndex ? 'w-6 bg-primary' : 'w-2 bg-white/30 hover:bg-white/60'
                  }`}
                />
              ))}
            </div>

          </div>
        </section>

        {/* Search bar */}
        <div className="flex items-center gap-2 bg-[#1C1B1F] border border-[#353436] rounded-sm px-4 py-3 mb-10">
          <span className="material-symbols-outlined text-primary/50 !text-base">search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-[#E5E2E3] text-sm focus:outline-none placeholder:text-[#E5E2E3]/50"
            placeholder="Buscar por marca, modelo, año…"
            type="text"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-[#E5E2E3]/30 hover:text-primary transition-colors">
              <span className="material-symbols-outlined !text-base">close</span>
            </button>
          )}
        </div>

        {/* Mobile filter toggle */}
        <div className="lg:hidden flex items-center justify-between mb-4">
          <button
            onClick={() => setShowFilters(v => !v)}
            className="flex items-center gap-2 bg-[#1C1B1F] border border-[#353436] rounded-sm px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-[#E5E2E3]/70 hover:text-primary hover:border-primary/50 transition-all"
          >
            <span className="material-symbols-outlined !text-sm">tune</span>
            {showFilters ? 'Ocultar filtros' : 'Filtros'}
            {hasFilters && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
          </button>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-[#1C1B1F] border border-[#353436] text-[#E5E2E3]/60 text-xs font-bold uppercase tracking-wider px-3 py-2.5 rounded-sm focus:border-primary/50 focus:outline-none"
          >
            <option value="default">Ordenar</option>
            <option value="price-asc">Precio ↑</option>
            <option value="price-desc">Precio ↓</option>
            <option value="year-desc">Año más nuevo</option>
            <option value="year-asc">Año más antiguo</option>
            <option value="km-asc">Km menor</option>
          </select>
        </div>

        <div className="flex flex-col lg:flex-row gap-8 md:gap-16">
          {/* Sidebar */}
          <aside className={`w-full lg:w-72 flex-shrink-0 ${showFilters ? 'block' : 'hidden'} lg:block`}>
            <div className="lg:sticky lg:top-32 space-y-8">
              <div className="flex items-center justify-between">
                <h3 className="font-headline text-[10px] font-black uppercase tracking-[0.3em] text-white flex items-center gap-4">
                  Filtros <span className="h-[1px] w-12 bg-gradient-to-r from-[#353436] to-transparent" />
                </h3>
                {hasFilters && (
                  <button onClick={clearAll} className="text-[9px] font-black uppercase tracking-widest text-primary hover:text-primary/70 transition-colors flex items-center gap-1">
                    <span className="material-symbols-outlined !text-sm">close</span> Limpiar
                  </button>
                )}
              </div>

              {/* Marca */}
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-3">Marca</p>
                <div className="flex flex-wrap gap-1.5">
                  {/* Show selected brand chip if any */}
                  {filterBrand && (
                    <FilterChip
                      key={filterBrand} label={filterBrand} active={true}
                      onClick={() => { setFilterBrand(null); setFilterModel(null); }}
                    />
                  )}
                  {/* Show first 6 brands (excluding selected) */}
                  {brands.filter(b => b !== filterBrand).slice(0, 6).map(b => (
                    <FilterChip
                      key={b} label={b} active={false}
                      onClick={() => { setFilterBrand(b); setFilterModel(null); }}
                    />
                  ))}
                  <button
                    onClick={() => { setBrandSearch(''); setShowBrandModal(true); }}
                    className="px-3 py-2 text-[10px] font-black uppercase tracking-widest rounded-sm border border-dashed border-[#353436] text-[#E5E2E3]/40 hover:border-primary/50 hover:text-primary/70 transition-all"
                  >
                    Ver más…
                  </button>
                </div>
              </div>

              {/* Modelo */}
              {models.length > 0 && (
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-3">
                    Modelo {filterBrand && <span className="text-[#E5E2E3]/30 normal-case font-normal tracking-normal">({filterBrand})</span>}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {models.map(m => (
                      <FilterChip key={m} label={m} active={filterModel === m} onClick={() => setFilterModel(prev => prev === m ? null : m)} />
                    ))}
                  </div>
                </div>
              )}

              {/* Carrocería */}
              {bodyTypes.length > 0 && (
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-3">Carrocería</p>
                  <div className="flex flex-wrap gap-1.5">
                    {bodyTypes.map(b => (
                      <FilterChip key={b} label={b} active={filterBody === b} onClick={() => setFilterBody(prev => prev === b ? null : b)} />
                    ))}
                  </div>
                </div>
              )}

              {/* Combustible */}
              {fuels.length > 0 && (
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-3">Combustible</p>
                  <div className="flex flex-wrap gap-1.5">
                    {fuels.map(f => (
                      <FilterChip key={f} label={f} active={filterFuel === f} onClick={() => setFilterFuel(prev => prev === f ? null : f)} />
                    ))}
                  </div>
                </div>
              )}

              {/* Transmisión */}
              {transList.length > 0 && (
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-3">Transmisión</p>
                  <div className="flex flex-wrap gap-1.5">
                    {transList.map(t => (
                      <FilterChip key={t} label={t} active={filterTrans === t} onClick={() => setFilterTrans(prev => prev === t ? null : t)} />
                    ))}
                  </div>
                </div>
              )}

              {/* Precio */}
              <RangeInput
                label="Precio (USD)"
                minVal={priceMin} maxVal={priceMax}
                onMinChange={setPriceMin} onMaxChange={setPriceMax}
                placeholder={['Mín', 'Máx']}
              />

              {/* Año */}
              <RangeInput
                label="Año"
                minVal={yearMin} maxVal={yearMax}
                onMinChange={setYearMin} onMaxChange={setYearMax}
                placeholder={['Desde', 'Hasta']}
              />

              {/* Km */}
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-3">Kilómetros máx.</p>
                <input
                  type="number"
                  value={kmMax}
                  onChange={(e) => setKmMax(e.target.value)}
                  placeholder="Ej: 50000"
                  className="w-full bg-[#1C1B1F] border border-[#353436] rounded-sm px-3 py-2 text-[#E5E2E3] text-xs focus:border-primary/50 focus:outline-none placeholder:text-[#E5E2E3]/50"
                />
              </div>

              {/* Distancia automotora */}
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-3">Distancia automotora</p>
                {locationStatus === 'idle' && (
                  <button
                    onClick={requestLocation}
                    className="w-full flex items-center justify-center gap-2 bg-[#1C1B1F] hover:bg-primary/10 border border-[#353436] hover:border-primary/50 text-[#E5E2E3]/50 hover:text-primary rounded-sm px-3 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all"
                  >
                    <span className="material-symbols-outlined !text-sm">my_location</span>
                    Usar mi ubicación
                  </button>
                )}
                {locationStatus === 'loading' && (
                  <div className="flex items-center gap-2 text-[#E5E2E3]/30 text-[10px] font-bold">
                    <div className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin" />
                    Detectando ubicación…
                  </div>
                )}
                {locationStatus === 'denied' && (
                  <p className="text-[10px] text-[#E5E2E3]/30 leading-relaxed">
                    Permiso de ubicación denegado. Habilítalo en la configuración del navegador.
                  </p>
                )}
                {locationStatus === 'granted' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-[#E5E2E3]/30 text-[10px] mb-3">
                      <span className="material-symbols-outlined !text-xs text-primary">location_on</span>
                      Ubicación detectada
                    </div>
                    <input
                      type="number"
                      value={distanceMax}
                      onChange={(e) => setDistanceMax(e.target.value)}
                      placeholder="Ej: 20 km"
                      className="w-full bg-[#1C1B1F] border border-[#353436] rounded-sm px-3 py-2 text-[#E5E2E3] text-xs focus:border-primary/50 focus:outline-none placeholder:text-[#E5E2E3]/50"
                    />
                    {distanceMax && (
                      <p className="text-[10px] text-[#E5E2E3]/30">Hasta {distanceMax} km de distancia</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </aside>

          {/* Grid */}
          <div className="flex-1">
            <div className="hidden lg:flex justify-end items-center mb-10 border-b border-[#353436]/30 pb-6 flex-wrap gap-4">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-[#1C1B1F] border border-[#353436] text-[#E5E2E3]/60 text-xs font-bold uppercase tracking-wider px-4 py-2.5 rounded-sm focus:border-primary/50 focus:outline-none"
              >
                <option value="default">Ordenar: Por defecto</option>
                <option value="price-asc">Precio: Menor a mayor</option>
                <option value="price-desc">Precio: Mayor a menor</option>
                <option value="year-desc">Año: Más nuevo</option>
                <option value="year-asc">Año: Más antiguo</option>
                <option value="km-asc">Kilómetros: Menor</option>
              </select>
            </div>

            {loading && (
              <div className="flex items-center justify-center h-64">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#E5E2E3]/40">Cargando inventario...</p>
                </div>
              </div>
            )}

            {error && !loading && (
              <div className="border border-primary/30 bg-primary/5 rounded-sm p-8 text-center">
                <span className="material-symbols-outlined text-primary text-4xl mb-4 block">cloud_off</span>
                <p className="text-sm font-bold text-[#E5E2E3]/60">{error}</p>
              </div>
            )}

            {!loading && !error && vehicles.length === 0 && (
              <div className="text-center py-24">
                <span className="material-symbols-outlined text-6xl text-[#E5E2E3]/35 block mb-4">search_off</span>
                <p className="text-[#E5E2E3]/30 font-bold text-sm">No hay vehículos que coincidan con los filtros.</p>
                {hasFilters && (
                  <button onClick={clearAll} className="mt-4 text-primary text-xs font-bold uppercase tracking-wider hover:underline">
                    Limpiar filtros
                  </button>
                )}
              </div>
            )}

            {!loading && !error && vehicles.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-3 gap-x-4 gap-y-8 md:gap-x-10 md:gap-y-16">
                {vehicles.slice(0, visibleCount).map((vehicle) => {
                  const thumb = vehicle.imageUrls?.length > 0 ? vehicle.imageUrls[0] : vehicle.imageUrl;
                  return (
                    <div
                      key={vehicle.id}
                      className="group cursor-pointer"
                      onClick={() => navigate(`/product/${encodeURIComponent(vehicle.brand)}/${vehicle.id}`)}
                    >
                      <div className="relative overflow-hidden rounded-sm aspect-[16/10] bg-black mb-3 md:mb-6 border border-[#353436]/50">
                        {thumb ? (
                          <img
                            className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110 opacity-80 group-hover:opacity-100"
                            src={thumb}
                            alt={`${vehicle.brand} ${vehicle.model}`}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="material-symbols-outlined text-[#353436] text-6xl">directions_car</span>
                          </div>
                        )}
                        {/* Image count badge */}
                        {vehicle.imageUrls?.length > 1 && (
                          <span className="absolute bottom-2 right-2 bg-black/70 text-white text-[9px] font-bold px-2 py-1 rounded flex items-center gap-1">
                            <span className="material-symbols-outlined !text-[11px]">photo_library</span>
                            {vehicle.imageUrls.length}
                          </span>
                        )}
                      </div>
                      <div className="space-y-2 md:space-y-4">
                        <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-1">
                          <div className="min-w-0">
                            <p className="text-[8px] md:text-[9px] font-black uppercase tracking-[0.3em] text-primary mb-0.5">{vehicle.brand}</p>
                            <h3 className="font-headline text-base md:text-2xl font-black text-white group-hover:text-primary transition-colors tracking-tighter leading-tight truncate">
                              {vehicle.model}
                            </h3>
                            {vehicle.bodyType && (
                              <p className="text-[#E5E2E3]/30 text-[9px] md:text-[10px] uppercase tracking-wider mt-0.5">{vehicle.bodyType}</p>
                            )}
                          </div>
                          <span className="font-headline text-sm md:text-xl font-black text-white tracking-tighter whitespace-nowrap">
                            ${vehicle.price.toLocaleString('es-CL')}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 md:gap-x-6 md:gap-y-2 pt-2 md:pt-4 border-t border-[#353436]/50">
                          <div className="spec-chip text-[9px] md:text-xs">{vehicle.year}</div>
                          <div className="spec-chip text-[9px] md:text-xs hidden sm:block">{vehicle.mileage.toLocaleString('es-CL')} KM</div>
                          <div className="spec-chip text-[9px] md:text-xs text-primary">{vehicle.transmission}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}                
                {/* Infinite scroll sentinel */}
                {visibleCount < vehicles.length && (
                  <div ref={sentinelRef} className="col-span-2 xl:col-span-3 py-6 flex justify-center">
                    <span className="material-symbols-outlined animate-spin text-primary/40">progress_activity</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />

      {/* ── Brand picker modal ──────────────────────────────────────── */}
      {showBrandModal && (
        <div
          className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowBrandModal(false)}
        >
          <div
            className="bg-[#131314] border border-[#353436] rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#353436]">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Seleccionar Marca</p>
              <button onClick={() => setShowBrandModal(false)} className="text-[#E5E2E3]/40 hover:text-primary transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Search */}
            <div className="px-6 py-3 border-b border-[#353436]">
              <div className="flex items-center gap-2 bg-[#1C1B1F] border border-[#353436] rounded-sm px-3 py-2">
                <span className="material-symbols-outlined text-primary/40 !text-sm">search</span>
                <input
                  autoFocus
                  value={brandSearch}
                  onChange={(e) => setBrandSearch(e.target.value)}
                  placeholder="Buscar marca..."
                  className="flex-1 bg-transparent text-[#E5E2E3] text-xs focus:outline-none placeholder:text-[#E5E2E3]/50"
                />
                {brandSearch && (
                  <button onClick={() => setBrandSearch('')} className="text-[#E5E2E3]/30 hover:text-primary">
                    <span className="material-symbols-outlined !text-sm">close</span>
                  </button>
                )}
              </div>
            </div>

            {/* Brand list */}
            <div className="overflow-y-auto flex-1 p-4">
              {(() => {
                const filtered = brands.filter(b => b.toLowerCase().includes(brandSearch.toLowerCase()));
                if (brandSearch) {
                  return (
                    <div className="flex flex-wrap gap-2">
                      {filtered.map(b => (
                        <button key={b} onClick={() => { setFilterBrand(b === filterBrand ? null : b); setFilterModel(null); setShowBrandModal(false); }}
                          className={`px-3 py-2 text-[10px] font-black uppercase tracking-widest rounded-sm border transition-all ${filterBrand === b ? 'border-primary bg-primary/10 text-primary' : 'border-[#353436] bg-[#1C1B1F]/50 text-[#E5E2E3]/40 hover:border-primary/50 hover:text-primary/70'}`}>
                          {b}
                        </button>
                      ))}
                    </div>
                  );
                }
                // Group by first letter
                const grouped = filtered.reduce((acc, b) => {
                  const letter = b[0].toUpperCase();
                  if (!acc[letter]) acc[letter] = [];
                  acc[letter].push(b);
                  return acc;
                }, {});
                const letters = Object.keys(grouped).sort();
                return (
                  <div className="space-y-5">
                    {/* Alphabet index */}
                    <div className="flex flex-wrap gap-1 pb-3 border-b border-[#353436]/50">
                      {letters.map(l => (
                        <button key={l}
                          onClick={() => document.getElementById(`brand-letter-${l}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })}
                          className="w-6 h-6 text-[10px] font-black text-[#E5E2E3]/40 hover:text-primary transition-colors">
                          {l}
                        </button>
                      ))}
                    </div>
                    {/* Groups */}
                    {letters.map(l => (
                      <div key={l} id={`brand-letter-${l}`}>
                        <p className="text-[9px] font-black text-primary tracking-[0.3em] mb-2">{l}</p>
                        <div className="flex flex-wrap gap-2">
                          {grouped[l].map(b => (
                            <button key={b} onClick={() => { setFilterBrand(b === filterBrand ? null : b); setFilterModel(null); setShowBrandModal(false); }}
                              className={`px-3 py-2 text-[10px] font-black uppercase tracking-widest rounded-sm border transition-all ${filterBrand === b ? 'border-primary bg-primary/10 text-primary' : 'border-[#353436] bg-[#1C1B1F]/50 text-[#E5E2E3]/40 hover:border-primary/50 hover:text-primary/70'}`}>
                              {b}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            {filterBrand && (
              <div className="px-6 py-4 border-t border-[#353436] flex justify-between items-center">
                <span className="text-[10px] text-[#E5E2E3]/40">Seleccionada: <span className="text-primary font-bold">{filterBrand}</span></span>
                <button onClick={() => { setFilterBrand(null); setFilterModel(null); setShowBrandModal(false); }}
                  className="text-[9px] font-black uppercase tracking-widest text-primary hover:underline">
                  Quitar filtro
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryScreen;
