import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import TopNavBar from '../components/TopNavBar';
import Footer from '../components/Footer';
import AdBanner from '../components/AdBanner';
import { getDealershipById, getVehicles, trackDealershipProfileVisit } from '../services/api';
import { safeExternalUrl } from '../services/safeExternalUrl';
import { VEHICLE_MODELS } from '../constants/vehicles';
import useSEO from '../hooks/useSEO';

// â”€â”€â”€ Shared UI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

const RangeInput = ({ label, minVal, maxVal, onMinChange, onMaxChange, placeholder = ['Mín', 'Máx'] }) => (
  <div>
    <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-3">{label}</p>
    <div className="flex gap-2">
      <input type="number" value={minVal} onChange={(e) => onMinChange(e.target.value)} placeholder={placeholder[0]}
        className="w-full bg-gray-100 dark:bg-[#1C1B1F] border border-gray-200 dark:border-[#353436] rounded-sm px-3 py-2 text-gray-700 dark:text-[#E5E2E3] text-xs focus:border-primary/50 focus:outline-none placeholder:text-gray-400" />
      <input type="number" value={maxVal} onChange={(e) => onMaxChange(e.target.value)} placeholder={placeholder[1]}
        className="w-full bg-gray-100 dark:bg-[#1C1B1F] border border-gray-200 dark:border-[#353436] rounded-sm px-3 py-2 text-gray-700 dark:text-[#E5E2E3] text-xs focus:border-primary/50 focus:outline-none placeholder:text-gray-400" />
    </div>
  </div>
);

// â”€â”€â”€ Main component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const DealershipProfileScreen = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [dealership, setDealership] = useState(null);
  const [allVehicles, setAllVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useSEO({
    title: dealership
      ? `${dealership.name} – Concesionario en ${dealership.city}`
      : 'Concesionario',
    description: dealership
      ? `Visitá ${dealership.name} en ${dealership.city}. Autos disponibles en RedAutos.`
      : '',
    url: `/dealerships/${id}`,
  });

  // Filter state
  const [filtersOpen, setFiltersOpen] = useState(false);
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

  // Infinite scroll
  const PAGE = 12;
  const [visibleCount, setVisibleCount] = useState(PAGE);
  const sentinelRef = useRef(null);

  useEffect(() => {
    Promise.all([getDealershipById(id), getVehicles()])
      .then(([ds, vs]) => { setDealership(ds); setAllVehicles(vs); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    trackDealershipProfileVisit(id);
  }, [id]);

  // All available vehicles of this dealership
  const dealershipVehicles = useMemo(
    () => allVehicles.filter((v) => v.isAvailable && v.dealershipId === id),
    [allVehicles, id]
  );
  const websiteUrl = safeExternalUrl(dealership?.website);

  // Derived filter options
  const brands    = useMemo(() => [...new Set(dealershipVehicles.map(v => v.brand).filter(Boolean))].sort(), [dealershipVehicles]);
  const models    = useMemo(() => {
    if (filterBrand && VEHICLE_MODELS[filterBrand]) return VEHICLE_MODELS[filterBrand];
    const source = filterBrand ? dealershipVehicles.filter(v => v.brand === filterBrand) : dealershipVehicles;
    return [...new Set(source.map(v => v.model).filter(Boolean))].sort();
  }, [dealershipVehicles, filterBrand]);
  const fuels     = useMemo(() => [...new Set(dealershipVehicles.map(v => v.fuel).filter(Boolean))].sort(), [dealershipVehicles]);
  const transList = useMemo(() => [...new Set(dealershipVehicles.map(v => v.transmission).filter(Boolean))].sort(), [dealershipVehicles]);
  const bodyTypes = useMemo(() => [...new Set(dealershipVehicles.map(v => v.bodyType).filter(Boolean))].sort(), [dealershipVehicles]);

  // Filtered + sorted
  const vehicles = useMemo(() => {
    let r = [...dealershipVehicles];
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
    if (sortBy === 'price-asc')  return [...r].sort((a, b) => a.price - b.price);
    if (sortBy === 'price-desc') return [...r].sort((a, b) => b.price - a.price);
    if (sortBy === 'year-desc')  return [...r].sort((a, b) => b.year - a.year);
    if (sortBy === 'year-asc')   return [...r].sort((a, b) => a.year - b.year);
    if (sortBy === 'km-asc')     return [...r].sort((a, b) => a.mileage - b.mileage);
    return r;
  }, [dealershipVehicles, search, filterBrand, filterModel, filterFuel, filterTrans, filterBody, priceMin, priceMax, yearMin, yearMax, kmMax, sortBy]);

  const hasFilters = search || filterBrand || filterModel || filterFuel || filterTrans || filterBody ||
    priceMin || priceMax || yearMin || yearMax || kmMax;

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
    setFilterBody(null); setPriceMin(''); setPriceMax(''); setYearMin(''); setYearMax(''); setKmMax('');
  };

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--fg)' }} className="min-h-screen flex flex-col">
      <TopNavBar />

      {loading && (
        <div className="flex-1 flex justify-center items-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
        </div>
      )}

      {error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <span className="material-symbols-outlined text-primary text-5xl">error</span>
          <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>{error}</p>
        </div>
      )}

      {!loading && !error && dealership && (
        <>
          {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
              MOBILE LAYOUT (< md)
          â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
          <div className="md:hidden flex flex-col pt-16 min-h-screen">

            {/* Hero banner */}
            <div className="w-full h-36 relative overflow-hidden bg-[#0E0E0F] flex items-center justify-center">
              {dealership.logoUrl ? (
                <img src={dealership.logoUrl} alt={dealership.name} className="w-full h-full object-cover opacity-40" />
              ) : (
                <span className="material-symbols-outlined !text-[80px] text-[#353436]">garage</span>
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-black/70" />
              {/* Back button */}
              <button onClick={() => navigate('/dealerships')}
                className="absolute top-4 left-4 w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white">
                <span className="material-symbols-outlined !text-[18px]">arrow_back</span>
              </button>
            </div>

            {/* Frame 1 â€” dealership info */}
            <div className="rounded-t-[36px] -mt-8 relative z-10 px-5 pt-2 pb-5"
              style={{ background: 'var(--frame-mid)', boxShadow: '0 -8px 24px var(--shadow-frame)' }}>
              <div className="w-12 h-1.5 rounded-full mx-auto mt-3 mb-5" style={{ background: 'var(--border)' }} />

              {/* Logo + name */}
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center overflow-hidden flex-shrink-0 border"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }}>
                  {dealership.logoUrl
                    ? <img src={dealership.logoUrl} alt={dealership.name} className="w-full h-full object-contain p-1" />
                    : <span className="material-symbols-outlined text-3xl" style={{ color: 'var(--fg-muted)' }}>garage</span>}
                </div>
                <div className="min-w-0">
                  {(dealership.city || dealership.country) && (
                    <p className="text-primary text-[10px] font-black uppercase tracking-widest">{[dealership.city, dealership.country].filter(Boolean).join(', ')}</p>
                  )}
                  <h1 className="font-headline font-black text-xl tracking-tight leading-tight" style={{ color: 'var(--fg)' }}>{dealership.name}</h1>
                  <p className="text-[11px] font-bold" style={{ color: 'var(--fg-muted)' }}>{dealershipVehicles.length} vehículos</p>
                </div>
              </div>

              {/* Contact chips */}
              <div className="flex flex-wrap gap-2">
                {dealership.phone && (
                  <a href={`tel:${dealership.phone}`} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold" style={{ background: 'var(--bg-input)', color: 'var(--fg-muted)', border: `1px solid var(--border)` }}>
                    <span className="material-symbols-outlined !text-[14px] text-primary">call</span>{dealership.phone}
                  </a>
                )}
                {dealership.latitude !== 0 && (
                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${dealership.latitude},${dealership.longitude}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold" style={{ background: 'var(--bg-input)', color: '#4285F4', border: `1px solid var(--border)` }}>
                    <span className="material-symbols-outlined !text-[14px]">directions</span>Cómo llegar
                  </a>
                )}
                {dealership.instagram && (
                  <a href={`https://instagram.com/${dealership.instagram.replace('@','')}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold" style={{ background: 'var(--bg-input)', color: 'var(--fg-muted)', border: `1px solid var(--border)` }}>
                    <span className="material-symbols-outlined !text-[14px] text-primary">photo_camera</span>Instagram
                  </a>
                )}
                {websiteUrl && (
                  <a href={websiteUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold" style={{ background: 'var(--bg-input)', color: 'var(--fg-muted)', border: `1px solid var(--border)` }}>
                    <span className="material-symbols-outlined !text-[14px] text-primary">language</span>Sitio web
                  </a>
                )}
              </div>

              {dealership.bio && (
                <p className="text-sm leading-relaxed mt-4" style={{ color: 'var(--fg-muted)' }}>{dealership.bio}</p>
              )}

              <AdBanner className="mt-4" />
            </div>

            {/* Frame 2 — search + filters + vehicles */}
            <div className="flex-1 rounded-t-[28px] -mt-3 relative z-20 pb-8"
              style={{ background: 'var(--frame-low)', boxShadow: '0 -6px 20px var(--shadow-frame)' }}>
              <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-4" style={{ background: 'var(--border)' }} />

              {/* Search + filter toggle */}
              <div className="px-4 mb-3 flex gap-2">
                <div className="flex-1 flex items-center gap-2 rounded-2xl px-4 py-3 border"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }}>
                  <span className="material-symbols-outlined text-primary !text-[18px]">search</span>
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar…"
                    className="flex-1 bg-transparent text-sm focus:outline-none" style={{ color: 'var(--fg)' }} />
                  {search && <button onClick={() => setSearch('')}><span className="material-symbols-outlined !text-[15px]" style={{ color: 'var(--fg-muted)' }}>close</span></button>}
                </div>
                <button onClick={() => setFiltersOpen(v => !v)}
                  className="w-12 h-12 rounded-2xl flex items-center justify-center border transition-all"
                  style={{ background: filtersOpen ? '#D32F2F' : 'var(--bg-input)', borderColor: filtersOpen ? '#D32F2F' : 'var(--border)' }}>
                  <span className="material-symbols-outlined !text-[20px]" style={{ color: filtersOpen ? '#fff' : 'var(--fg-muted)' }}>tune</span>
                </button>
              </div>

              {/* Sort chips */}
              <div className="flex gap-2 px-4 pb-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                {[{ label: 'Precio ↑', value: 'price-asc' }, { label: 'Precio ↓', value: 'price-desc' },
                  { label: 'Más nuevo', value: 'year-desc' }, { label: 'Menos km', value: 'km-asc' }].map(opt => (
                  <button key={opt.value} onClick={() => setSortBy(s => s === opt.value ? 'default' : opt.value)}
                    className="flex-none px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
                    style={{ background: sortBy === opt.value ? '#D32F2F' : 'var(--bg-card)', color: sortBy === opt.value ? '#fff' : 'var(--fg-muted)', border: `1px solid ${sortBy === opt.value ? '#D32F2F' : 'var(--border)'}` }}>
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Collapsible filters */}
              {filtersOpen && (
                <div className="px-4 pb-4 border-t" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center justify-between py-3">
                    <span className="text-[10px] font-black uppercase tracking-widest text-primary">Filtros</span>
                    {hasFilters && <button onClick={clearAll} className="text-[10px] font-bold text-primary uppercase tracking-wider">Limpiar</button>}
                  </div>
                  {brands.length > 0 && (
                    <div className="mb-4">
                      <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-2">Marca</p>
                      <div className="flex flex-wrap gap-1.5">
                        {brands.map(b => (
                          <button key={b} onClick={() => { setFilterBrand(p => p === b ? null : b); setFilterModel(null); }}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all"
                            style={{ background: filterBrand === b ? '#D32F2F' : 'var(--bg-input)', color: filterBrand === b ? '#fff' : 'var(--fg-muted)', border: `1px solid ${filterBrand === b ? '#D32F2F' : 'var(--border)'}` }}>{b}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {bodyTypes.length > 0 && (
                    <div className="mb-4">
                      <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-2">Carrocería</p>
                      <div className="flex flex-wrap gap-1.5">
                        {bodyTypes.map(b => (
                          <button key={b} onClick={() => setFilterBody(p => p === b ? null : b)}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all"
                            style={{ background: filterBody === b ? '#D32F2F' : 'var(--bg-input)', color: filterBody === b ? '#fff' : 'var(--fg-muted)', border: `1px solid ${filterBody === b ? '#D32F2F' : 'var(--border)'}` }}>{b}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {fuels.length > 0 && (
                    <div className="mb-4">
                      <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-2">Combustible</p>
                      <div className="flex flex-wrap gap-1.5">
                        {fuels.map(f => (
                          <button key={f} onClick={() => setFilterFuel(p => p === f ? null : f)}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all"
                            style={{ background: filterFuel === f ? '#D32F2F' : 'var(--bg-input)', color: filterFuel === f ? '#fff' : 'var(--fg-muted)', border: `1px solid ${filterFuel === f ? '#D32F2F' : 'var(--border)'}` }}>{f}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {transList.length > 0 && (
                    <div className="mb-4">
                      <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-2">Transmisión</p>
                      <div className="flex flex-wrap gap-1.5">
                        {transList.map(t => (
                          <button key={t} onClick={() => setFilterTrans(p => p === t ? null : t)}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all"
                            style={{ background: filterTrans === t ? '#D32F2F' : 'var(--bg-input)', color: filterTrans === t ? '#fff' : 'var(--fg-muted)', border: `1px solid ${filterTrans === t ? '#D32F2F' : 'var(--border)'}` }}>{t}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {models.length > 0 && (
                    <div className="mb-4">
                      <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-2">Modelo</p>
                      <div className="flex flex-wrap gap-1.5">
                        {models.map(m => (
                          <button key={m} onClick={() => setFilterModel(p => p === m ? null : m)}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all"
                            style={{ background: filterModel === m ? '#D32F2F' : 'var(--bg-input)', color: filterModel === m ? '#fff' : 'var(--fg-muted)', border: `1px solid ${filterModel === m ? '#D32F2F' : 'var(--border)'}` }}>{m}</button>
                        ))}
                      </div>
                    </div>
                  )}
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
                  <div className="mb-2">
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
                  {vehicles.length} vehículo{vehicles.length !== 1 ? 's' : ''}
                </p>
              </div>

              {/* Vehicle cards â€” 2 columns */}
              {vehicles.length === 0 ? (
                <div className="text-center py-16 px-6">
                  <span className="material-symbols-outlined !text-5xl block mb-3" style={{ color: 'var(--fg-muted)' }}>search_off</span>
                  <p className="text-sm font-bold" style={{ color: 'var(--fg-muted)' }}>Sin vehículos para estos filtros.</p>
                  {hasFilters && <button onClick={clearAll} className="mt-3 text-primary text-xs font-bold uppercase tracking-wider">Limpiar</button>}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 px-4">
                  {vehicles.slice(0, visibleCount).map((v) => {
                    const thumb = v.imageUrls?.length > 0 ? v.imageUrls[0] : v.imageUrl;
                    return (
                      <button key={v.id} type="button" className="rounded-2xl overflow-hidden cursor-pointer active:scale-[0.98] transition-transform flex flex-col text-left w-full"
                        style={{ background: 'var(--frame-mid)', border: `1px solid var(--border)` }}
                        onClick={() => navigate(`/product/${encodeURIComponent(v.brand)}/${v.id}`)}
                        onKeyDown={(e) => e.key === 'Enter' && navigate(`/product/${encodeURIComponent(v.brand)}/${v.id}`)}>
                        <div className="w-full h-32 relative overflow-hidden">
                          {thumb ? <img src={thumb} alt={`${v.brand} ${v.model}`} className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--bg-input)' }}>
                                <span className="material-symbols-outlined !text-4xl" style={{ color: 'var(--border)' }}>directions_car</span>
                              </div>}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                        </div>
                        <div className="p-3 flex flex-col gap-1 flex-1">
                          <p className="text-[9px] font-black uppercase tracking-wider text-primary">{v.brand}</p>
                          <p className="font-black text-sm leading-tight tracking-tight" style={{ color: 'var(--fg)' }}>{v.model}</p>
                          <p className="text-[10px]" style={{ color: 'var(--fg-muted)' }}>{v.year} · {(v.mileage / 1000).toFixed(0)}k km</p>
                          <p className="font-black text-primary text-sm mt-auto">${v.price.toLocaleString('es-CL')}</p>
                        </div>
                      </button>
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

          {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
              DESKTOP LAYOUT (â‰¥ md)
          â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
          <div className="hidden md:block flex-1">

            {/* Hero banner */}
            <div className="w-full h-44 relative overflow-hidden bg-[#0E0E0F]">
              {dealership.logoUrl && (
                <img src={dealership.logoUrl} alt={dealership.name} className="w-full h-full object-cover opacity-20 blur-sm" />
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-black/30 to-black/80" />
            </div>

            {/* Frame 1 â€” dealership header */}
            <div className="rounded-t-[48px] -mt-8 relative z-10 px-12 pt-2 pb-8"
              style={{ background: 'var(--frame-mid)', boxShadow: '0 -12px 40px var(--shadow-frame)' }}>
              <div className="w-12 h-1.5 rounded-full mx-auto mt-4 mb-6" style={{ background: 'var(--border)' }} />
              <div className="max-w-screen-2xl mx-auto flex items-start gap-8">
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center overflow-hidden flex-shrink-0 border"
                  style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }}>
                  {dealership.logoUrl
                    ? <img src={dealership.logoUrl} alt={dealership.name} className="w-full h-full object-contain p-2" />
                    : <span className="material-symbols-outlined !text-4xl" style={{ color: 'var(--fg-muted)' }}>garage</span>}
                </div>
                <div className="flex-1 min-w-0">
                  {(dealership.city || dealership.country) && (
                    <p className="text-primary text-[10px] font-black uppercase tracking-widest mb-1">{[dealership.city, dealership.country].filter(Boolean).join(', ')}</p>
                  )}
                  <div className="flex flex-wrap items-baseline gap-4 mb-3">
                    <h1 className="font-headline text-4xl font-black tracking-tighter" style={{ color: 'var(--fg)' }}>{dealership.name}</h1>
                    <span className="rounded-xl px-3 py-1 border" style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }}>
                      <span className="font-black text-lg" style={{ color: 'var(--fg)' }}>{dealershipVehicles.length}</span>
                      <span className="text-[9px] font-black uppercase tracking-widest ml-1.5" style={{ color: 'var(--fg-muted)' }}>unid.</span>
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {dealership.address && (
                      <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--fg-muted)' }}>
                        <span className="material-symbols-outlined !text-sm text-primary">location_on</span>{dealership.address}
                      </span>
                    )}
                    {dealership.phone && (
                      <a href={`tel:${dealership.phone}`} className="flex items-center gap-1.5 text-xs hover:text-primary transition-colors" style={{ color: 'var(--fg-muted)' }}>
                        <span className="material-symbols-outlined !text-sm text-primary">call</span>{dealership.phone}
                      </a>
                    )}
                    {dealership.email && (
                      <a href={`mailto:${dealership.email}`} className="flex items-center gap-1.5 text-xs hover:text-primary transition-colors" style={{ color: 'var(--fg-muted)' }}>
                        <span className="material-symbols-outlined !text-sm text-primary">mail</span>{dealership.email}
                      </a>
                    )}
                    {dealership.latitude !== 0 && (
                      <a href={`https://www.google.com/maps/dir/?api=1&destination=${dealership.latitude},${dealership.longitude}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs font-bold text-[#4285F4] hover:underline">
                        <span className="material-symbols-outlined !text-sm">directions</span>Cómo llegar
                      </a>
                    )}
                    {dealership.instagram && (
                      <a href={`https://instagram.com/${dealership.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs hover:text-pink-400 transition-colors" style={{ color: 'var(--fg-muted)' }}>
                        <span className="material-symbols-outlined !text-sm text-primary">photo_camera</span>@{dealership.instagram.replace('@', '')}
                      </a>
                    )}
                    {websiteUrl && (
                      <a href={websiteUrl} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs hover:text-primary transition-colors" style={{ color: 'var(--fg-muted)' }}>
                        <span className="material-symbols-outlined !text-sm text-primary">language</span>Sitio web
                      </a>
                    )}
                    {dealership.businessHours && (
                      <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--fg-muted)' }}>
                        <span className="material-symbols-outlined !text-sm text-primary">schedule</span>{dealership.businessHours}
                      </span>
                    )}
                  </div>
                  {dealership.bio && <p className="text-sm leading-relaxed mt-3 max-w-2xl" style={{ color: 'var(--fg-muted)' }}>{dealership.bio}</p>}
                </div>
              </div>

              <div className="max-w-screen-2xl mx-auto mt-6">
                <AdBanner />
              </div>
            </div>

            {/* Frame 2 — sidebar + grid */}
            <div className="rounded-t-[36px] -mt-4 relative z-20 px-12 pt-8 pb-20"
              style={{ background: 'var(--frame-low)', boxShadow: '0 -8px 30px var(--shadow-frame)' }}>
              <div className="max-w-screen-2xl mx-auto flex gap-10">

                {/* Sidebar */}
                <aside className="w-64 flex-shrink-0">
                  <div className="sticky top-24 space-y-7">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Filtros</p>
                      {hasFilters && <button onClick={clearAll} className="text-[10px] font-black uppercase tracking-wider text-primary flex items-center gap-1 hover:opacity-70"><span className="material-symbols-outlined !text-sm">close</span>Limpiar</button>}
                    </div>
                    {/* Search */}
                    <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 border"
                      style={{ background: 'var(--bg-input)', borderColor: 'var(--border)' }}>
                      <span className="material-symbols-outlined text-primary !text-[18px]">search</span>
                      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar…"
                        className="flex-1 bg-transparent text-sm focus:outline-none" style={{ color: 'var(--fg)' }} />
                      {search && <button onClick={() => setSearch('')}><span className="material-symbols-outlined !text-[15px]" style={{ color: 'var(--fg-muted)' }}>close</span></button>}
                    </div>
                    {brands.length > 0 && (
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-3">Marca</p>
                        <div className="flex flex-wrap gap-1.5">
                          {brands.map(b => <FilterChip key={b} label={b} active={filterBrand === b} onClick={() => { setFilterBrand(p => p === b ? null : b); setFilterModel(null); }} />)}
                        </div>
                      </div>
                    )}
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
                        className="w-full bg-gray-100 dark:bg-[#1C1B1F] border border-gray-200 dark:border-[#353436] rounded-xl px-3 py-2 text-gray-700 dark:text-[#E5E2E3] text-xs focus:border-primary/50 focus:outline-none placeholder:text-gray-400" />
                    </div>
                  </div>
                </aside>

                {/* Vehicle grid */}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-6 pb-4 border-b flex-wrap gap-4" style={{ borderColor: 'var(--border)' }}>
                    <div>
                      <h2 className="font-headline text-2xl font-black tracking-tighter" style={{ color: 'var(--fg)' }}>VEHÍCULOS DISPONIBLES</h2>
                      <p className="text-primary text-[10px] font-black uppercase tracking-[0.4em] mt-1">{vehicles.length} unidad{vehicles.length !== 1 ? 'es' : ''}</p>
                    </div>
                    <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                      className="rounded-xl px-4 py-2.5 text-sm font-bold focus:outline-none border cursor-pointer"
                      style={{ background: 'var(--bg-input)', borderColor: 'var(--border)', color: 'var(--fg)' }}>
                      <option value="default">Ordenar</option>
                      <option value="price-asc">Precio ↑</option>
                      <option value="price-desc">Precio ↓</option>
                      <option value="year-desc">Más nuevo</option>
                      <option value="year-asc">Más antiguo</option>
                      <option value="km-asc">Menos km</option>
                    </select>
                  </div>

                  {vehicles.length === 0 ? (
                    <div className="text-center py-24">
                      <span className="material-symbols-outlined text-6xl block mb-4" style={{ color: 'var(--fg-muted)' }}>search_off</span>
                      <p className="font-bold text-sm" style={{ color: 'var(--fg-muted)' }}>
                        {hasFilters ? 'No hay vehículos que coincidan.' : 'Sin vehículos disponibles.'}
                      </p>
                      {hasFilters && <button onClick={clearAll} className="mt-4 text-primary text-xs font-bold uppercase tracking-wider hover:underline">Limpiar filtros</button>}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {vehicles.slice(0, visibleCount).map((v) => {
                        const thumb = v.imageUrls?.length > 0 ? v.imageUrls[0] : v.imageUrl;
                        return (
                          <button key={v.id} type="button" className="rounded-2xl overflow-hidden cursor-pointer group hover:scale-[1.02] hover:shadow-xl transition-transform flex flex-col text-left w-full"
                            style={{ background: 'var(--frame-mid)', border: `1px solid var(--border)` }}
                            onClick={() => navigate(`/product/${encodeURIComponent(v.brand)}/${v.id}`)}
                            onKeyDown={(e) => e.key === 'Enter' && navigate(`/product/${encodeURIComponent(v.brand)}/${v.id}`)}>
                            <div className="w-full h-44 relative overflow-hidden">
                              {thumb ? <img src={thumb} alt={`${v.brand} ${v.model}`} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                                : <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--bg-input)' }}>
                                    <span className="material-symbols-outlined !text-5xl" style={{ color: 'var(--border)' }}>directions_car</span>
                                  </div>}
                              {v.imageUrls?.length > 1 && (
                                <span className="absolute bottom-2 right-2 bg-black/70 text-white text-[9px] font-bold px-2 py-1 rounded-lg flex items-center gap-1">
                                  <span className="material-symbols-outlined !text-[10px]">photo_library</span>{v.imageUrls.length}
                                </span>
                              )}
                            </div>
                            <div className="p-4 flex flex-col gap-1.5 flex-1">
                              <p className="text-[9px] font-black uppercase tracking-widest text-primary">{v.brand}</p>
                              <h3 className="font-headline font-black text-base tracking-tight leading-tight" style={{ color: 'var(--fg)' }}>{v.model}</h3>
                              {v.bodyType && <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--fg-muted)' }}>{v.bodyType}</p>}
                              <div className="flex items-center gap-3 pt-2 mt-auto" style={{ borderTop: `1px solid var(--border)` }}>
                                <span className="text-[10px] font-bold" style={{ color: 'var(--fg-muted)' }}>{v.year}</span>
                                <span className="text-[10px] font-bold" style={{ color: 'var(--fg-muted)' }}>{v.mileage.toLocaleString('es-CL')} km</span>
                                <span className="text-[10px] font-bold text-primary ml-auto">${v.price.toLocaleString('es-CL')}</span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                      {visibleCount < vehicles.length && (
                        <div ref={sentinelRef} className="col-span-2 lg:col-span-3 xl:col-span-4 flex justify-center py-6">
                          <span className="material-symbols-outlined animate-spin text-primary/40">progress_activity</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <Footer />
    </div>
  );
};

export default DealershipProfileScreen;
