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
        : 'border-gray-200 dark:border-[#353436] bg-gray-100 dark:bg-[#1C1B1F]/50 text-gray-400 dark:text-[#E5E2E3]/40 hover:border-primary hover:text-primary'
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
        className="w-full bg-gray-100 dark:bg-[#1C1B1F] border border-gray-200 dark:border-[#353436] rounded-sm px-3 py-2 text-gray-700 dark:text-[#E5E2E3] text-xs focus:border-primary/50 focus:outline-none placeholder:text-gray-400"
      />
      <input
        type="number"
        value={maxVal}
        onChange={(e) => onMaxChange(e.target.value)}
        placeholder={placeholder[1]}
        className="w-full bg-gray-100 dark:bg-[#1C1B1F] border border-gray-200 dark:border-[#353436] rounded-sm px-3 py-2 text-gray-700 dark:text-[#E5E2E3] text-xs focus:border-primary/50 focus:outline-none placeholder:text-gray-400"
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
      .catch(() => setError('Ocurrió un problema al cargar el inventario. Por favor intentá de nuevo en unos momentos.'))
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
    <div style={{ background: 'var(--bg)' }}>
      <TopNavBar />

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          MOBILE LAYOUT (< md) â€” Stacked frames
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <div className="md:hidden pt-16 min-h-screen flex flex-col">

        {/* Hero image â€” bleeds under the frame */}
        <div
          className="w-full h-48 bg-cover bg-center shrink-0"
          style={{
            backgroundImage: `url('${HERO_IMAGES[heroIndex]}')`,
            transition: 'background-image 0.8s',
          }}
        >
          <div className="w-full h-full bg-gradient-to-b from-black/10 to-black/60" />
        </div>

        {/* Frame 1 â€” search + filter chips */}
        <div
          className="rounded-t-[40px] -mt-8 relative z-10 flex flex-col"
          style={{
            background: 'var(--frame-mid)',
            boxShadow: '0 -8px 30px var(--shadow-frame)',
          }}
        >
          {/* Drag handle */}
          <div className="w-12 h-1.5 rounded-full mx-auto mt-4 mb-4" style={{ background: 'var(--border)' }} />

          {/* Search bar */}
          <div className="px-4 mb-3">
            <div
              className="flex items-center gap-3 rounded-2xl px-4 py-3 border"
              style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }}
            >
              <span className="material-symbols-outlined text-primary !text-[20px]">search</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar marca, modelo, año…"
                className="flex-1 bg-transparent text-sm focus:outline-none"
                style={{ color: 'var(--fg)' }}
              />
              {search && (
                <button onClick={() => setSearch('')}>
                  <span className="material-symbols-outlined !text-[16px]" style={{ color: 'var(--fg-muted)' }}>close</span>
                </button>
              )}
            </div>
          </div>

          {/* Filter chips â€” horizontal scroll */}
          <div className="flex gap-2 px-4 pb-4 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            <button
              onClick={() => setShowFilters(v => !v)}
              className="flex-none flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
              style={{
                background: showFilters ? '#D32F2F' : 'var(--bg-card)',
                color: showFilters ? '#fff' : 'var(--fg)',
                border: `1px solid ${showFilters ? '#D32F2F' : 'var(--border)'}`,
              }}
            >
              <span className="material-symbols-outlined !text-[15px]">tune</span>
              Filtros
              {hasFilters && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
            </button>
            {[
              { label: 'Precio â†‘', value: 'price-asc' },
              { label: 'Precio â†“', value: 'price-desc' },
              { label: 'Más nuevo', value: 'year-desc' },
              { label: 'Menos km', value: 'km-asc' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setSortBy(s => s === opt.value ? 'default' : opt.value)}
                className="flex-none px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
                style={{
                  background: sortBy === opt.value ? '#D32F2F' : 'var(--bg-card)',
                  color: sortBy === opt.value ? '#fff' : 'var(--fg-muted)',
                  border: `1px solid ${sortBy === opt.value ? '#D32F2F' : 'var(--border)'}`,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Collapsible filters */}
          {showFilters && (
            <div className="px-4 pb-4 border-t" style={{ borderColor: 'var(--border)' }}>
              <div className="w-full flex items-center justify-between py-3">
                <span className="text-[10px] font-black uppercase tracking-widest text-primary">Filtros</span>
                {hasFilters && (
                  <button onClick={clearAll} className="text-[10px] font-bold text-primary uppercase tracking-wider">Limpiar todo</button>
                )}
              </div>

              {/* Marca */}
              <div className="mb-4">
                <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-2">Marca</p>
                <div className="flex flex-wrap gap-1.5">
                  {filterBrand && (
                    <button
                      onClick={() => { setFilterBrand(null); setFilterModel(null); }}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all flex items-center gap-1"
                      style={{ background: '#D32F2F', color: '#fff', border: '1px solid #D32F2F' }}
                    >
                      {filterBrand} <span className="material-symbols-outlined !text-[13px]">close</span>
                    </button>
                  )}
                  {brands.filter(b => b !== filterBrand).slice(0, 8).map(b => (
                    <button
                      key={b}
                      onClick={() => { setFilterBrand(b); setFilterModel(null); }}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all"
                      style={{ background: 'var(--bg-input)', color: 'var(--fg-muted)', border: `1px solid var(--border)` }}
                    >
                      {b}
                    </button>
                  ))}
                  <button
                    onClick={() => { setBrandSearch(''); setShowBrandModal(true); }}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all"
                    style={{ background: 'var(--bg-input)', color: 'var(--fg-muted)', border: `1px dashed var(--border)` }}
                  >
                    Ver más…
                  </button>
                </div>
              </div>

              {/* Modelo */}
              {models.length > 0 && (
                <div className="mb-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-2">Modelo</p>
                  <div className="flex flex-wrap gap-1.5">
                    {models.map(m => (
                      <button
                        key={m}
                        onClick={() => setFilterModel(prev => prev === m ? null : m)}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all"
                        style={{
                          background: filterModel === m ? '#D32F2F' : 'var(--bg-input)',
                          color: filterModel === m ? '#fff' : 'var(--fg-muted)',
                          border: `1px solid ${filterModel === m ? '#D32F2F' : 'var(--border)'}`,
                        }}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Carrocería */}
              {bodyTypes.length > 0 && (
                <div className="mb-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-2">Carrocería</p>
                  <div className="flex flex-wrap gap-1.5">
                    {bodyTypes.map(b => (
                      <button
                        key={b}
                        onClick={() => setFilterBody(prev => prev === b ? null : b)}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all"
                        style={{
                          background: filterBody === b ? '#D32F2F' : 'var(--bg-input)',
                          color: filterBody === b ? '#fff' : 'var(--fg-muted)',
                          border: `1px solid ${filterBody === b ? '#D32F2F' : 'var(--border)'}`,
                        }}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Combustible */}
              {fuels.length > 0 && (
                <div className="mb-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-2">Combustible</p>
                  <div className="flex flex-wrap gap-1.5">
                    {fuels.map(f => (
                      <button
                        key={f}
                        onClick={() => setFilterFuel(prev => prev === f ? null : f)}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all"
                        style={{
                          background: filterFuel === f ? '#D32F2F' : 'var(--bg-input)',
                          color: filterFuel === f ? '#fff' : 'var(--fg-muted)',
                          border: `1px solid ${filterFuel === f ? '#D32F2F' : 'var(--border)'}`,
                        }}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Transmisión */}
              {transList.length > 0 && (
                <div className="mb-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-2">Transmisión</p>
                  <div className="flex flex-wrap gap-1.5">
                    {transList.map(t => (
                      <button
                        key={t}
                        onClick={() => setFilterTrans(prev => prev === t ? null : t)}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all"
                        style={{
                          background: filterTrans === t ? '#D32F2F' : 'var(--bg-input)',
                          color: filterTrans === t ? '#fff' : 'var(--fg-muted)',
                          border: `1px solid ${filterTrans === t ? '#D32F2F' : 'var(--border)'}`,
                        }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Precio */}
              <div className="mb-4">
                <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-2">Precio (USD)</p>
                <div className="flex gap-2">
                  <input type="number" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} placeholder="Mín"
                    className="w-full rounded-xl px-3 py-2 text-xs focus:outline-none border"
                    style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--fg)' }} />
                  <input type="number" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} placeholder="Máx"
                    className="w-full rounded-xl px-3 py-2 text-xs focus:outline-none border"
                    style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--fg)' }} />
                </div>
              </div>

              {/* Año */}
              <div className="mb-4">
                <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-2">Año</p>
                <div className="flex gap-2">
                  <input type="number" value={yearMin} onChange={(e) => setYearMin(e.target.value)} placeholder="Desde"
                    className="w-full rounded-xl px-3 py-2 text-xs focus:outline-none border"
                    style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--fg)' }} />
                  <input type="number" value={yearMax} onChange={(e) => setYearMax(e.target.value)} placeholder="Hasta"
                    className="w-full rounded-xl px-3 py-2 text-xs focus:outline-none border"
                    style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--fg)' }} />
                </div>
              </div>

              {/* Km */}
              <div className="mb-4">
                <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-2">Kilómetros máx.</p>
                <input type="number" value={kmMax} onChange={(e) => setKmMax(e.target.value)} placeholder="Ej: 50000"
                  className="w-full rounded-xl px-3 py-2 text-xs focus:outline-none border"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--fg)' }} />
              </div>
            </div>
          )}

          {/* Results count */}
          <div className="px-4 pb-2">
            <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--fg-muted)' }}>
              {loading ? 'Cargando…' : `${vehicles.length} vehículo${vehicles.length !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>

        {/* Frame 2 â€” vehicle cards */}
        <div
          className="flex-1 rounded-t-[32px] -mt-3 relative z-20 pb-8"
          style={{
            background: 'var(--frame-low)',
            boxShadow: '0 -6px 24px var(--shadow-frame)',
          }}
        >
          <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-5" style={{ background: 'var(--border)' }} />

          {loading && (
            <div className="flex flex-col items-center justify-center h-48 gap-3">
              <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-[11px] font-bold uppercase tracking-widest text-primary">Cargando…</p>
            </div>
          )}

          {!loading && !error && vehicles.length === 0 && (
            <div className="text-center py-16 px-6">
              <span className="material-symbols-outlined !text-5xl block mb-3" style={{ color: 'var(--fg-muted)' }}>search_off</span>
              <p className="text-sm font-bold" style={{ color: 'var(--fg-muted)' }}>Sin resultados para estos filtros.</p>
              {hasFilters && <button onClick={clearAll} className="mt-3 text-primary text-xs font-bold uppercase tracking-wider">Limpiar filtros</button>}
            </div>
          )}

          {!loading && !error && (
            <div className="grid grid-cols-2 gap-3 px-4">
              {vehicles.slice(0, visibleCount).map((vehicle) => {
                const thumb = vehicle.imageUrls?.length > 0 ? vehicle.imageUrls[0] : vehicle.imageUrl;
                return (
                  <div
                    key={vehicle.id}
                    className="rounded-2xl overflow-hidden cursor-pointer active:scale-[0.98] transition-transform flex flex-col"
                    style={{ background: 'var(--frame-mid)', border: `1px solid var(--border)` }}
                    onClick={() => navigate(`/product/${encodeURIComponent(vehicle.brand)}/${vehicle.id}`)}
                  >
                    <div className="w-full h-32 relative overflow-hidden">
                      {thumb ? (
                        <img src={thumb} alt={`${vehicle.brand} ${vehicle.model}`} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--bg-input)' }}>
                          <span className="material-symbols-outlined !text-4xl" style={{ color: 'var(--border)' }}>directions_car</span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                    </div>
                    <div className="p-3 flex flex-col gap-1 flex-1">
                      <p className="text-[9px] font-black uppercase tracking-wider text-primary">{vehicle.brand}</p>
                      <p className="font-black text-sm leading-tight tracking-tight" style={{ color: 'var(--fg)' }}>{vehicle.model}</p>
                      <p className="text-[10px]" style={{ color: 'var(--fg-muted)' }}>{vehicle.year} Â· {(vehicle.mileage/1000).toFixed(0)}k km</p>
                      <p className="font-black text-primary text-sm mt-auto">${vehicle.price.toLocaleString('es-CL')}</p>
                    </div>
                  </div>
                );
              })}
              {visibleCount < vehicles.length && (
                <div ref={sentinelRef} className="col-span-2 flex justify-center py-6">
                  <span className="material-symbols-outlined animate-spin text-primary/40">progress_activity</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          DESKTOP LAYOUT (â‰¥ md) â€” stacked frames
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <div className="hidden md:block">

        {/* Hero â€” full width image */}
        <div className="relative w-full h-[55vh] min-h-[420px] overflow-hidden">
          {HERO_IMAGES.map((src, idx) => (
            <div
              key={idx}
              className="absolute inset-0 transition-opacity duration-1000"
              style={{ opacity: idx === heroIndex ? 1 : 0 }}
            >
              <img className="w-full h-full object-cover" src={src} alt={`Hero ${idx + 1}`} />
              <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />
            </div>
          ))}

          {/* Hero text */}
          <div className="absolute inset-0 flex items-center px-16 z-10">
            <div>
              <h1 className="font-headline text-6xl xl:text-8xl font-black text-white leading-none tracking-tighter mb-4">
                Tu próximo auto,<br /><span className="text-primary italic">te está esperando.</span>
              </h1>
            </div>
          </div>

          {/* Prev/Next arrows */}
          <button onClick={heroPrev} className="absolute left-6 top-1/2 -translate-y-1/2 z-20 bg-black/40 hover:bg-primary border border-white/10 text-white w-11 h-11 rounded-full flex items-center justify-center transition-all">
            <span className="material-symbols-outlined">chevron_left</span>
          </button>
          <button onClick={heroNext} className="absolute right-6 top-1/2 -translate-y-1/2 z-20 bg-black/40 hover:bg-primary border border-white/10 text-white w-11 h-11 rounded-full flex items-center justify-center transition-all">
            <span className="material-symbols-outlined">chevron_right</span>
          </button>

          {/* Dots */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex gap-2">
            {HERO_IMAGES.map((_, idx) => (
              <button
                key={idx}
                onClick={() => { setHeroIndex(idx); restartHeroTimer(); }}
                className={`h-1.5 rounded-full transition-all duration-300 ${idx === heroIndex ? 'w-8 bg-primary' : 'w-2 bg-white/30 hover:bg-white/60'}`}
              />
            ))}
          </div>
        </div>

        {/* Frame 1 â€” search + filter bar */}
        <div
          className="rounded-t-[48px] -mt-6 relative z-10 px-8 pt-8 pb-6"
          style={{ background: 'var(--frame-mid)', boxShadow: '0 -12px 40px var(--shadow-frame)' }}
        >
          <div className="max-w-screen-2xl mx-auto flex items-center gap-4">
            {/* Search */}
            <div
              className="flex-1 flex items-center gap-3 rounded-2xl px-5 py-3.5 border"
              style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }}
            >
              <span className="material-symbols-outlined text-primary !text-[22px]">search</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar marca, modelo, año…"
                className="flex-1 bg-transparent text-base focus:outline-none"
                style={{ color: 'var(--fg)' }}
              />
              {search && (
                <button onClick={() => setSearch('')}>
                  <span className="material-symbols-outlined !text-[18px]" style={{ color: 'var(--fg-muted)' }}>close</span>
                </button>
              )}
            </div>

            {/* Sort select */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-2xl px-4 py-3.5 text-sm font-bold focus:outline-none border cursor-pointer"
              style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--fg)' }}
            >
              <option value="default">Ordenar</option>
              <option value="price-asc">Precio ↑</option>
              <option value="price-desc">Precio ↓</option>
              <option value="year-desc">Más nuevo</option>
              <option value="year-asc">Más antiguo</option>
              <option value="km-asc">Menos km</option>
            </select>

            {/* Results count */}
            <span className="text-sm font-bold whitespace-nowrap" style={{ color: 'var(--fg-muted)' }}>
              {loading ? '…' : `${vehicles.length} vehículos`}
            </span>
          </div>
        </div>

        {/* Frame 2 â€” sidebar + grid */}
        <div
          className="rounded-t-[36px] -mt-4 relative z-20 px-8 pt-8 pb-20"
          style={{ background: 'var(--frame-low)', boxShadow: '0 -8px 30px var(--shadow-frame)' }}
        >
          <div className="max-w-screen-2xl mx-auto flex gap-10">

            {/* Sidebar */}
            <aside className="w-64 xl:w-72 flex-shrink-0">
              <div className="sticky top-24 space-y-7">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Filtros</p>
                  {hasFilters && (
                    <button onClick={clearAll} className="text-[10px] font-black uppercase tracking-wider text-primary flex items-center gap-1 hover:opacity-70 transition-opacity">
                      <span className="material-symbols-outlined !text-sm">close</span> Limpiar
                    </button>
                  )}
                </div>

                {/* Marca */}
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-3">Marca</p>
                  <div className="flex flex-wrap gap-1.5">
                    {filterBrand && (
                      <FilterChip key={filterBrand} label={filterBrand} active={true} onClick={() => { setFilterBrand(null); setFilterModel(null); }} />
                    )}
                    {brands.filter(b => b !== filterBrand).slice(0, 6).map(b => (
                      <FilterChip key={b} label={b} active={false} onClick={() => { setFilterBrand(b); setFilterModel(null); }} />
                    ))}
                    <button
                      onClick={() => { setBrandSearch(''); setShowBrandModal(true); }}
                      className="px-3 py-2 text-[10px] font-black uppercase tracking-widest rounded-sm border border-dashed border-gray-300 dark:border-[#353436] text-gray-400 dark:text-[#E5E2E3]/40 hover:border-primary hover:text-primary transition-all"
                    >
                      Ver más…
                    </button>
                  </div>
                </div>

                {models.length > 0 && (
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-3">Modelo</p>
                    <div className="flex flex-wrap gap-1.5">
                      {models.map(m => <FilterChip key={m} label={m} active={filterModel === m} onClick={() => setFilterModel(p => p === m ? null : m)} />)}
                    </div>
                  </div>
                )}

                {bodyTypes.length > 0 && (
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-3">Carrocería</p>
                    <div className="flex flex-wrap gap-1.5">
                      {bodyTypes.map(b => <FilterChip key={b} label={b} active={filterBody === b} onClick={() => setFilterBody(p => p === b ? null : b)} />)}
                    </div>
                  </div>
                )}

                {fuels.length > 0 && (
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-3">Combustible</p>
                    <div className="flex flex-wrap gap-1.5">
                      {fuels.map(f => <FilterChip key={f} label={f} active={filterFuel === f} onClick={() => setFilterFuel(p => p === f ? null : f)} />)}
                    </div>
                  </div>
                )}

                {transList.length > 0 && (
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-3">Transmisión</p>
                    <div className="flex flex-wrap gap-1.5">
                      {transList.map(t => <FilterChip key={t} label={t} active={filterTrans === t} onClick={() => setFilterTrans(p => p === t ? null : t)} />)}
                    </div>
                  </div>
                )}

                <RangeInput label="Precio (USD)" minVal={priceMin} maxVal={priceMax} onMinChange={setPriceMin} onMaxChange={setPriceMax} placeholder={['Mín', 'Máx']} />
                <RangeInput label="Año" minVal={yearMin} maxVal={yearMax} onMinChange={setYearMin} onMaxChange={setYearMax} placeholder={['Desde', 'Hasta']} />

                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-3">Kilómetros máx.</p>
                  <input type="number" value={kmMax} onChange={(e) => setKmMax(e.target.value)} placeholder="Ej: 50000"
                    className="w-full bg-gray-100 dark:bg-[#1C1B1F] border border-gray-200 dark:border-[#353436] rounded-sm px-3 py-2 text-gray-700 dark:text-[#E5E2E3] text-xs focus:border-primary/50 focus:outline-none placeholder:text-gray-400" />
                </div>

                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-3">Distancia automotora</p>
                  {locationStatus === 'idle' && (
                    <button onClick={requestLocation} className="w-full flex items-center justify-center gap-2 bg-gray-100 dark:bg-[#1C1B1F] hover:bg-primary/10 border border-gray-200 dark:border-[#353436] hover:border-primary/50 text-gray-400 dark:text-[#E5E2E3]/50 hover:text-primary rounded-sm px-3 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all">
                      <span className="material-symbols-outlined !text-sm">my_location</span> Usar mi ubicación
                    </button>
                  )}
                  {locationStatus === 'loading' && <div className="flex items-center gap-2 text-gray-400 dark:text-[#E5E2E3]/30 text-[10px] font-bold"><div className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin" /> Detectando…</div>}
                  {locationStatus === 'denied' && <p className="text-[10px] text-gray-400 dark:text-[#E5E2E3]/30 leading-relaxed">Permiso denegado.</p>}
                  {locationStatus === 'granted' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-gray-400 dark:text-[#E5E2E3]/30 text-[10px] mb-3">
                        <span className="material-symbols-outlined !text-xs text-primary">location_on</span> Ubicación detectada
                      </div>
                      <input type="number" value={distanceMax} onChange={(e) => setDistanceMax(e.target.value)} placeholder="Ej: 20 km"
                        className="w-full bg-gray-100 dark:bg-[#1C1B1F] border border-gray-200 dark:border-[#353436] rounded-sm px-3 py-2 text-gray-700 dark:text-[#E5E2E3] text-xs focus:border-primary/50 focus:outline-none placeholder:text-gray-400" />
                    </div>
                  )}
                </div>
              </div>
            </aside>

            {/* Vehicle grid */}
            <div className="flex-1 min-w-0">
              {loading && (
                <div className="flex flex-col items-center justify-center h-64 gap-4">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--fg-muted)' }}>Cargando inventario…</p>
                </div>
              )}

              {error && !loading && (
                <div className="rounded-2xl p-10 text-center border" style={{ borderColor: 'var(--border)', background: 'var(--bg-input)' }}>
                  <span className="material-symbols-outlined text-primary text-4xl mb-4 block">cloud_off</span>
                  <p className="text-sm font-bold" style={{ color: 'var(--fg-muted)' }}>{error}</p>
                </div>
              )}

              {!loading && !error && vehicles.length === 0 && (
                <div className="text-center py-24">
                  <span className="material-symbols-outlined text-6xl block mb-4" style={{ color: 'var(--fg-muted)' }}>search_off</span>
                  <p className="font-bold text-sm" style={{ color: 'var(--fg-muted)' }}>No hay vehículos para estos filtros.</p>
                  {hasFilters && <button onClick={clearAll} className="mt-4 text-primary text-xs font-bold uppercase tracking-wider hover:underline">Limpiar filtros</button>}
                </div>
              )}

              {!loading && !error && vehicles.length > 0 && (
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {vehicles.slice(0, visibleCount).map((vehicle) => {
                    const thumb = vehicle.imageUrls?.length > 0 ? vehicle.imageUrls[0] : vehicle.imageUrl;
                    return (
                      <div
                        key={vehicle.id}
                        className="rounded-2xl overflow-hidden cursor-pointer group transition-transform hover:scale-[1.02] hover:shadow-xl flex flex-col"
                        style={{ background: 'var(--frame-mid)', border: `1px solid var(--border)` }}
                        onClick={() => navigate(`/product/${encodeURIComponent(vehicle.brand)}/${vehicle.id}`)}
                      >
                        <div className="w-full h-44 relative overflow-hidden">
                          {thumb ? (
                            <img
                              src={thumb}
                              alt={`${vehicle.brand} ${vehicle.model}`}
                              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--bg-input)' }}>
                              <span className="material-symbols-outlined !text-5xl" style={{ color: 'var(--border)' }}>directions_car</span>
                            </div>
                          )}
                          {vehicle.imageUrls?.length > 1 && (
                            <span className="absolute bottom-2 right-2 bg-black/70 text-white text-[9px] font-bold px-2 py-1 rounded-lg flex items-center gap-1">
                              <span className="material-symbols-outlined !text-[10px]">photo_library</span>
                              {vehicle.imageUrls.length}
                            </span>
                          )}
                        </div>
                        <div className="p-4 flex flex-col gap-1.5 flex-1">
                          <p className="text-[9px] font-black uppercase tracking-widest text-primary">{vehicle.brand}</p>
                          <h3 className="font-headline font-black text-base tracking-tight leading-tight" style={{ color: 'var(--fg)' }}>{vehicle.model}</h3>
                          {vehicle.bodyType && <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--fg-muted)' }}>{vehicle.bodyType}</p>}
                          <div className="flex items-center gap-3 pt-2 mt-auto" style={{ borderTop: `1px solid var(--border)` }}>
                            <span className="text-[10px] font-bold" style={{ color: 'var(--fg-muted)' }}>{vehicle.year}</span>
                            <span className="text-[10px] font-bold" style={{ color: 'var(--fg-muted)' }}>{vehicle.mileage.toLocaleString('es-CL')} km</span>
                            <span className="text-[10px] font-bold text-primary ml-auto">${vehicle.price.toLocaleString('es-CL')}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {visibleCount < vehicles.length && (
                    <div ref={sentinelRef} className="col-span-2 lg:col-span-3 xl:col-span-4 py-6 flex justify-center">
                      <span className="material-symbols-outlined animate-spin text-primary/40">progress_activity</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <Footer />


      {/* â”€â”€ Brand picker modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {showBrandModal && (
        <div
          className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowBrandModal(false)}
        >
          <div
            className="rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl border"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <p className="text-[10px] font-black uppercase tracking-[0.3em]" style={{ color: 'var(--fg)' }}>Seleccionar Marca</p>
              <button onClick={() => setShowBrandModal(false)} className="hover:text-primary transition-colors" style={{ color: 'var(--fg-muted)' }}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Search */}
            <div className="px-6 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2 rounded-lg px-3 py-2 border" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }}>
                <span className="material-symbols-outlined text-primary/60 !text-sm">search</span>
                <input
                  autoFocus
                  value={brandSearch}
                  onChange={(e) => setBrandSearch(e.target.value)}
                  placeholder="Buscar marca..."
                  className="flex-1 bg-transparent text-xs focus:outline-none"
                  style={{ color: 'var(--fg)' }}
                />
                {brandSearch && (
                  <button onClick={() => setBrandSearch('')} className="hover:text-primary" style={{ color: 'var(--fg-muted)' }}>
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
                          className={`px-3 py-2 text-[10px] font-black uppercase tracking-widest rounded-sm border transition-all ${filterBrand === b ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200 dark:border-[#353436] bg-gray-100 dark:bg-[#1C1B1F]/50 text-gray-500 dark:text-[#E5E2E3]/40 hover:border-primary hover:text-primary'}`}>
                          {b}
                        </button>
                      ))}
                    </div>
                  );
                }
                const grouped = filtered.reduce((acc, b) => {
                  const letter = b[0].toUpperCase();
                  if (!acc[letter]) acc[letter] = [];
                  acc[letter].push(b);
                  return acc;
                }, {});
                const letters = Object.keys(grouped).sort();
                return (
                  <div className="space-y-5">
                    <div className="flex flex-wrap gap-1 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
                      {letters.map(l => (
                        <button key={l}
                          onClick={() => document.getElementById(`brand-letter-${l}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })}
                          className="w-6 h-6 text-[10px] font-black hover:text-primary transition-colors"
                          style={{ color: 'var(--fg-muted)' }}>
                          {l}
                        </button>
                      ))}
                    </div>
                    {letters.map(l => (
                      <div key={l} id={`brand-letter-${l}`}>
                        <p className="text-[9px] font-black text-primary tracking-[0.3em] mb-2">{l}</p>
                        <div className="flex flex-wrap gap-2">
                          {grouped[l].map(b => (
                            <button key={b} onClick={() => { setFilterBrand(b === filterBrand ? null : b); setFilterModel(null); setShowBrandModal(false); }}
                              className={`px-3 py-2 text-[10px] font-black uppercase tracking-widest rounded-sm border transition-all ${filterBrand === b ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200 dark:border-[#353436] bg-gray-100 dark:bg-[#1C1B1F]/50 text-gray-500 dark:text-[#E5E2E3]/40 hover:border-primary hover:text-primary'}`}>
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
              <div className="px-6 py-4 border-t flex justify-between items-center" style={{ borderColor: 'var(--border)' }}>
                <span className="text-[10px]" style={{ color: 'var(--fg-muted)' }}>Seleccionada: <span className="text-primary font-bold">{filterBrand}</span></span>
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
