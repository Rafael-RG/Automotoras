import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import TopNavBar from '../components/TopNavBar';
import Footer from '../components/Footer';
import { getDealershipById, getVehicles } from '../services/api';
import { VEHICLE_MODELS } from '../constants/vehicles';

// ─── Shared UI ───────────────────────────────────────────────────────────────
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

const RangeInput = ({ label, minVal, maxVal, onMinChange, onMaxChange, placeholder = ['Mín', 'Máx'] }) => (
  <div>
    <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-3">{label}</p>
    <div className="flex gap-2">
      <input type="number" value={minVal} onChange={(e) => onMinChange(e.target.value)} placeholder={placeholder[0]}
        className="w-full bg-[#1C1B1F] border border-[#353436] rounded-sm px-3 py-2 text-[#E5E2E3] text-xs focus:border-primary/50 focus:outline-none placeholder:text-[#E5E2E3]/20" />
      <input type="number" value={maxVal} onChange={(e) => onMaxChange(e.target.value)} placeholder={placeholder[1]}
        className="w-full bg-[#1C1B1F] border border-[#353436] rounded-sm px-3 py-2 text-[#E5E2E3] text-xs focus:border-primary/50 focus:outline-none placeholder:text-[#E5E2E3]/20" />
    </div>
  </div>
);

// ─── Main component ──────────────────────────────────────────────────────────
const DealershipProfileScreen = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [dealership, setDealership] = useState(null);
  const [allVehicles, setAllVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  useEffect(() => {
    Promise.all([getDealershipById(id), getVehicles()])
      .then(([ds, vs]) => { setDealership(ds); setAllVehicles(vs); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  // All available vehicles of this dealership
  const dealershipVehicles = useMemo(
    () => allVehicles.filter((v) => v.isAvailable && v.dealershipId === id),
    [allVehicles, id]
  );

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

  const clearAll = () => {
    setSearch(''); setFilterBrand(null); setFilterModel(null); setFilterFuel(null); setFilterTrans(null);
    setFilterBody(null); setPriceMin(''); setPriceMax(''); setYearMin(''); setYearMax(''); setKmMax('');
  };

  return (
    <div className="bg-[#0E0E0F] text-[#E5E2E3] min-h-screen flex flex-col">
      <TopNavBar />

      <main className="flex-1 pt-28 pb-20 px-6 md:px-12 max-w-screen-2xl mx-auto w-full">

        {/* Back */}
        <button
          onClick={() => navigate('/dealerships')}
          className="flex items-center gap-2 text-[#E5E2E3]/40 hover:text-primary transition-colors text-xs font-bold uppercase tracking-widest mb-10"
        >
          <span className="material-symbols-outlined !text-sm">arrow_back</span>
          Automotoras
        </button>

        {loading && (
          <div className="flex justify-center py-32">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#D32F2F] border-t-transparent" />
          </div>
        )}

        {error && (
          <div className="text-center py-32">
            <span className="material-symbols-outlined text-primary text-5xl block mb-4">error</span>
            <p className="text-[#E5E2E3]/40 text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && dealership && (
          <>
            {/* ── Header ─────────────────────────────────────────── */}
            <div className="flex flex-col md:flex-row items-start gap-8 mb-16 pb-16 border-b border-[#353436]/50">
              <div className="w-24 h-24 rounded-2xl bg-[#1C1C1E] border border-[#E5E2E3]/10 flex items-center justify-center flex-shrink-0 overflow-hidden p-2">
                {dealership.logoUrl
                  ? <img src={dealership.logoUrl} alt={dealership.name} className="w-full h-full object-contain" />
                  : <span className="material-symbols-outlined text-4xl text-[#E5E2E3]/20">garage</span>}
              </div>
              <div className="flex-1">
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-primary mb-2">{dealership.city}, {dealership.country}</p>
                <h1 className="font-headline text-4xl md:text-5xl font-black tracking-tighter text-white mb-6">{dealership.name}</h1>
                <div className="flex flex-wrap gap-6">
                  {dealership.address && (
                    <span className="flex items-center gap-2 text-[#E5E2E3]/50 text-sm">
                      <span className="material-symbols-outlined !text-base">location_on</span>{dealership.address}
                    </span>
                  )}
                  {dealership.phone && (
                    <a href={`tel:${dealership.phone}`} className="flex items-center gap-2 text-[#E5E2E3]/50 hover:text-primary transition-colors text-sm">
                      <span className="material-symbols-outlined !text-base">call</span>{dealership.phone}
                    </a>
                  )}
                  {dealership.email && (
                    <a href={`mailto:${dealership.email}`} className="flex items-center gap-2 text-[#E5E2E3]/50 hover:text-primary transition-colors text-sm">
                      <span className="material-symbols-outlined !text-base">mail</span>{dealership.email}
                    </a>
                  )}
                  {dealership.latitude !== 0 && (
                    <a href={`https://www.google.com/maps/dir/?api=1&destination=${dealership.latitude},${dealership.longitude}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 text-[#4285F4] hover:underline text-sm font-bold">
                      <span className="material-symbols-outlined !text-base">directions</span>Cómo llegar
                    </a>
                  )}
                </div>
              </div>
              <div className="bg-[#1C1C1E] border border-[#E5E2E3]/10 rounded-xl px-6 py-4 text-center flex-shrink-0">
                <p className="font-headline text-3xl font-black text-white">{dealershipVehicles.length}</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-[#E5E2E3]/30 mt-1">Vehículos</p>
              </div>
            </div>

            {/* ── Vehicles + filters ──────────────────────────────── */}
            <div className="flex flex-col lg:flex-row gap-16">

              {/* Sidebar */}
              <aside className="w-full lg:w-64 flex-shrink-0">
                {/* Mobile toggle */}
                <button
                  className="lg:hidden w-full flex items-center justify-between bg-[#131314] border border-[#353436] rounded-sm px-4 py-3 mb-4"
                  onClick={() => setFiltersOpen(v => !v)}
                >
                  <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-white">
                    <span className="material-symbols-outlined !text-sm text-primary">tune</span>
                    Filtros
                    {hasFilters && <span className="bg-primary text-white text-[8px] font-black px-1.5 py-0.5 rounded-full">ON</span>}
                  </span>
                  <span className={`material-symbols-outlined text-[#E5E2E3]/40 transition-transform duration-200 ${filtersOpen ? 'rotate-180' : ''}`}>expand_more</span>
                </button>

                <div className={`sticky top-28 space-y-8 ${filtersOpen ? 'block' : 'hidden'} lg:block`}>
                  <div className="flex items-center justify-between">
                    <h3 className="font-headline text-[10px] font-black uppercase tracking-[0.3em] text-white flex items-center gap-3">
                      Filtros <span className="h-[1px] w-8 bg-gradient-to-r from-[#353436] to-transparent" />
                    </h3>
                    {hasFilters && (
                      <button onClick={clearAll} className="text-[9px] font-black uppercase tracking-widest text-primary hover:text-primary/70 transition-colors flex items-center gap-1">
                        <span className="material-symbols-outlined !text-sm">close</span> Limpiar
                      </button>
                    )}
                  </div>

                  {/* Search */}
                  <div className="flex items-center gap-2 bg-[#1C1B1F] border border-[#353436] rounded-sm px-3 py-2">
                    <span className="material-symbols-outlined text-primary/40 !text-sm">search</span>
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..."
                      className="flex-1 bg-transparent text-[#E5E2E3] text-xs focus:outline-none placeholder:text-[#E5E2E3]/20" />
                    {search && (
                      <button onClick={() => setSearch('')} className="text-[#E5E2E3]/30 hover:text-primary">
                        <span className="material-symbols-outlined !text-sm">close</span>
                      </button>
                    )}
                  </div>

                  {/* Marca */}
                  {brands.length > 0 && (
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-3">Marca</p>
                      <div className="flex flex-wrap gap-1.5">
                        {filterBrand && (
                          <FilterChip key={filterBrand} label={filterBrand} active={true}
                            onClick={() => { setFilterBrand(null); setFilterModel(null); }} />
                        )}
                        {brands.filter(b => b !== filterBrand).slice(0, 5).map(b => (
                          <FilterChip key={b} label={b} active={false}
                            onClick={() => { setFilterBrand(b); setFilterModel(null); }} />
                        ))}
                        {brands.length > 5 && (
                          <button onClick={() => { setBrandSearch(''); setShowBrandModal(true); }}
                            className="px-3 py-2 text-[10px] font-black uppercase tracking-widest rounded-sm border border-dashed border-[#353436] text-[#E5E2E3]/40 hover:border-primary/50 hover:text-primary/70 transition-all">
                            Ver más…
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Modelo */}
                  {models.length > 0 && (
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-3">Modelo</p>
                      <div className="flex flex-wrap gap-1.5">
                        {models.map(m => (
                          <FilterChip key={m} label={m} active={filterModel === m} onClick={() => setFilterModel(p => p === m ? null : m)} />
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
                          <FilterChip key={b} label={b} active={filterBody === b} onClick={() => setFilterBody(p => p === b ? null : b)} />
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
                          <FilterChip key={f} label={f} active={filterFuel === f} onClick={() => setFilterFuel(p => p === f ? null : f)} />
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
                          <FilterChip key={t} label={t} active={filterTrans === t} onClick={() => setFilterTrans(p => p === t ? null : t)} />
                        ))}
                      </div>
                    </div>
                  )}

                  <RangeInput label="Precio (USD)" minVal={priceMin} maxVal={priceMax}
                    onMinChange={setPriceMin} onMaxChange={setPriceMax} placeholder={['Mín', 'Máx']} />

                  <RangeInput label="Año" minVal={yearMin} maxVal={yearMax}
                    onMinChange={setYearMin} onMaxChange={setYearMax} placeholder={['Desde', 'Hasta']} />

                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-3">Kilómetros máx.</p>
                    <input type="number" value={kmMax} onChange={(e) => setKmMax(e.target.value)} placeholder="Ej: 50000"
                      className="w-full bg-[#1C1B1F] border border-[#353436] rounded-sm px-3 py-2 text-[#E5E2E3] text-xs focus:border-primary/50 focus:outline-none placeholder:text-[#E5E2E3]/20" />
                  </div>
                </div>
              </aside>

              {/* Grid */}
              <div className="flex-1">
                <div className="flex justify-between items-center mb-10 border-b border-[#353436]/30 pb-6 flex-wrap gap-4">
                  <div>
                    <h2 className="font-headline text-3xl font-black text-white tracking-tighter">VEHÍCULOS DISPONIBLES</h2>
                    <p className="text-primary text-[10px] font-black uppercase tracking-[0.4em] mt-2">
                      {vehicles.length} unidad{vehicles.length !== 1 ? 'es' : ''} encontrada{vehicles.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                    className="bg-[#1C1B1F] border border-[#353436] text-[#E5E2E3]/60 text-xs font-bold uppercase tracking-wider px-4 py-2.5 rounded-sm focus:border-primary/50 focus:outline-none">
                    <option value="default">Ordenar: Por defecto</option>
                    <option value="price-asc">Precio: Menor a mayor</option>
                    <option value="price-desc">Precio: Mayor a menor</option>
                    <option value="year-desc">Año: Más nuevo</option>
                    <option value="year-asc">Año: Más antiguo</option>
                    <option value="km-asc">Kilómetros: Menor</option>
                  </select>
                </div>

                {vehicles.length === 0 ? (
                  <div className="text-center py-24">
                    <span className="material-symbols-outlined text-6xl text-[#E5E2E3]/10 block mb-4">search_off</span>
                    <p className="text-[#E5E2E3]/30 font-bold text-sm">
                      {hasFilters ? 'No hay vehículos que coincidan con los filtros.' : 'Sin vehículos disponibles por el momento.'}
                    </p>
                    {hasFilters && (
                      <button onClick={clearAll} className="mt-4 text-primary text-xs font-bold uppercase tracking-wider hover:underline">
                        Limpiar filtros
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-3 gap-x-4 gap-y-8 md:gap-x-10 md:gap-y-16">
                    {vehicles.map((v) => {
                      const thumb = v.imageUrls?.length > 0 ? v.imageUrls[0] : v.imageUrl;
                      return (
                        <div key={v.id} className="group cursor-pointer"
                          onClick={() => navigate(`/product/${encodeURIComponent(v.brand)}/${v.id}`)}>
                          <div className="relative overflow-hidden rounded-sm aspect-[16/10] bg-black mb-3 md:mb-6 border border-[#353436]/50">
                            {thumb ? (
                              <img className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110 opacity-80 group-hover:opacity-100"
                                src={thumb} alt={`${v.brand} ${v.model}`} />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <span className="material-symbols-outlined text-[#353436] text-6xl">directions_car</span>
                              </div>
                            )}
                            {v.imageUrls?.length > 1 && (
                              <span className="absolute bottom-2 right-2 bg-black/70 text-white text-[9px] font-bold px-2 py-1 rounded flex items-center gap-1">
                                <span className="material-symbols-outlined !text-[11px]">photo_library</span>{v.imageUrls.length}
                              </span>
                            )}
                          </div>
                          <div className="space-y-2 md:space-y-4">
                            <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-1">
                              <div className="min-w-0">
                                <p className="text-[8px] md:text-[9px] font-black uppercase tracking-[0.3em] text-primary mb-0.5">{v.brand}</p>
                                <h3 className="font-headline text-base md:text-2xl font-black text-white group-hover:text-primary transition-colors tracking-tighter leading-tight truncate">{v.model}</h3>
                                {v.bodyType && <p className="text-[#E5E2E3]/30 text-[9px] md:text-[10px] uppercase tracking-wider mt-0.5">{v.bodyType}</p>}
                              </div>
                              <span className="font-headline text-sm md:text-xl font-black text-white tracking-tighter whitespace-nowrap">${v.price.toLocaleString('es-CL')}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 md:gap-x-6 md:gap-y-2 pt-2 md:pt-4 border-t border-[#353436]/50">
                              <div className="spec-chip text-[9px] md:text-xs">{v.year}</div>
                              <div className="spec-chip text-[9px] md:text-xs hidden sm:block">{v.mileage.toLocaleString('es-CL')} KM</div>
                              <div className="spec-chip text-[9px] md:text-xs text-primary">{v.transmission}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      <Footer />

      {/* ── Brand picker modal ─────────────────────────────────────── */}
      {showBrandModal && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowBrandModal(false)}>
          <div className="bg-[#131314] border border-[#353436] rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#353436]">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Seleccionar Marca</p>
              <button onClick={() => setShowBrandModal(false)} className="text-[#E5E2E3]/40 hover:text-primary transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="px-6 py-3 border-b border-[#353436]">
              <div className="flex items-center gap-2 bg-[#1C1B1F] border border-[#353436] rounded-sm px-3 py-2">
                <span className="material-symbols-outlined text-primary/40 !text-sm">search</span>
                <input autoFocus value={brandSearch} onChange={(e) => setBrandSearch(e.target.value)}
                  placeholder="Buscar marca..."
                  className="flex-1 bg-transparent text-[#E5E2E3] text-xs focus:outline-none placeholder:text-[#E5E2E3]/20" />
                {brandSearch && (
                  <button onClick={() => setBrandSearch('')} className="text-[#E5E2E3]/30 hover:text-primary">
                    <span className="material-symbols-outlined !text-sm">close</span>
                  </button>
                )}
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              {(() => {
                const filtered = brands.filter(b => b.toLowerCase().includes(brandSearch.toLowerCase()));
                if (brandSearch) {
                  return (
                    <div className="flex flex-wrap gap-2">
                      {filtered.map(b => (
                        <button key={b} onClick={() => { setFilterBrand(b === filterBrand ? null : b); setFilterModel(null); setShowBrandModal(false); }}
                          className={`px-3 py-2 text-[10px] font-black uppercase tracking-widest rounded-sm border transition-all ${filterBrand === b ? 'border-primary bg-primary/10 text-primary' : 'border-[#353436] bg-[#1C1B1F]/50 text-[#E5E2E3]/40 hover:border-primary/50 hover:text-primary/70'}`}>{b}</button>
                      ))}
                    </div>
                  );
                }
                const grouped = filtered.reduce((acc, b) => { const l = b[0].toUpperCase(); if (!acc[l]) acc[l] = []; acc[l].push(b); return acc; }, {});
                const letters = Object.keys(grouped).sort();
                return (
                  <div className="space-y-5">
                    <div className="flex flex-wrap gap-1 pb-3 border-b border-[#353436]/50">
                      {letters.map(l => (
                        <button key={l} onClick={() => document.getElementById(`dp-brand-letter-${l}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })}
                          className="w-6 h-6 text-[10px] font-black text-[#E5E2E3]/40 hover:text-primary transition-colors">{l}</button>
                      ))}
                    </div>
                    {letters.map(l => (
                      <div key={l} id={`dp-brand-letter-${l}`}>
                        <p className="text-[9px] font-black text-primary tracking-[0.3em] mb-2">{l}</p>
                        <div className="flex flex-wrap gap-2">
                          {grouped[l].map(b => (
                            <button key={b} onClick={() => { setFilterBrand(b === filterBrand ? null : b); setFilterModel(null); setShowBrandModal(false); }}
                              className={`px-3 py-2 text-[10px] font-black uppercase tracking-widest rounded-sm border transition-all ${filterBrand === b ? 'border-primary bg-primary/10 text-primary' : 'border-[#353436] bg-[#1C1B1F]/50 text-[#E5E2E3]/40 hover:border-primary/50 hover:text-primary/70'}`}>{b}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
            {filterBrand && (
              <div className="px-6 py-4 border-t border-[#353436] flex justify-between items-center">
                <span className="text-[10px] text-[#E5E2E3]/40">Seleccionada: <span className="text-primary font-bold">{filterBrand}</span></span>
                <button onClick={() => { setFilterBrand(null); setFilterModel(null); setShowBrandModal(false); }}
                  className="text-[9px] font-black uppercase tracking-widest text-primary hover:underline">Quitar filtro</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DealershipProfileScreen;
