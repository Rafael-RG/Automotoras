import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import TopNavBar from '../components/TopNavBar';
import Footer from '../components/Footer';
import { getVehicles } from '../services/api';

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
        className="w-full bg-[#1C1B1F] border border-[#353436] rounded-sm px-3 py-2 text-[#E5E2E3] text-xs focus:border-primary/50 focus:outline-none placeholder:text-[#E5E2E3]/20"
      />
      <input
        type="number"
        value={maxVal}
        onChange={(e) => onMaxChange(e.target.value)}
        placeholder={placeholder[1]}
        className="w-full bg-[#1C1B1F] border border-[#353436] rounded-sm px-3 py-2 text-[#E5E2E3] text-xs focus:border-primary/50 focus:outline-none placeholder:text-[#E5E2E3]/20"
      />
    </div>
  </div>
);

const InventoryScreen = () => {
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
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [yearMin, setYearMin] = useState('');
  const [yearMax, setYearMax] = useState('');
  const [kmMax, setKmMax] = useState('');
  const [sortBy, setSortBy] = useState('default');

  useEffect(() => {
    getVehicles()
      .then(setAllVehicles)
      .catch(() => setError('No se pudo conectar con el servidor. Verifica que la API esté corriendo.'))
      .finally(() => setLoading(false));
  }, []);

  // Derived options
  const brands    = useMemo(() => [...new Set(allVehicles.filter(v => v.isAvailable).map(v => v.brand))].sort(), [allVehicles]);
  const models    = useMemo(() => {
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

    const s = [...r];
    if (sortBy === 'price-asc')  return s.sort((a, b) => a.price - b.price);
    if (sortBy === 'price-desc') return s.sort((a, b) => b.price - a.price);
    if (sortBy === 'year-desc')  return s.sort((a, b) => b.year - a.year);
    if (sortBy === 'year-asc')   return s.sort((a, b) => a.year - b.year);
    if (sortBy === 'km-asc')     return s.sort((a, b) => a.mileage - b.mileage);
    return s;
  }, [allVehicles, search, filterBrand, filterModel, filterFuel, filterTrans, filterBody, priceMin, priceMax, yearMin, yearMax, kmMax, sortBy]);

  const hasFilters = search || filterBrand || filterModel || filterFuel || filterTrans || filterBody ||
    priceMin || priceMax || yearMin || yearMax || kmMax;

  const clearAll = () => {
    setSearch(''); setFilterBrand(null); setFilterModel(null); setFilterFuel(null); setFilterTrans(null);
    setFilterBody(null); setPriceMin(''); setPriceMax('');
    setYearMin(''); setYearMax(''); setKmMax('');
  };

  return (
    <div className="bg-[#0E0E0F]">
      <TopNavBar />
      <main className="pt-36 pb-20 px-12 max-w-screen-2xl mx-auto">

        {/* Hero */}
        <section className="mb-20">
          <div className="relative overflow-hidden rounded-sm bg-black h-[520px] flex items-center px-16 border border-[#353436]/30">
            <div className="absolute inset-0 z-0">
              <img
                className="w-full h-full object-cover opacity-50 grayscale hover:grayscale-0 transition-all duration-1000"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuBFekBUfcvEyywcbMwbE8ga9QlZ9b8beF7ue62jNZitJw74aebXZzcQQXoHARNOHrx8qwkCuROfv8EPpfEuse5SKEp2f-0nBwoNV284FE5enRd22-VgOUJ5mjPkqaNVtV7DRGwBiwtEkJFLiFMGNwdy5TRw6uToo8f9tNUHDd2Q3O3GhuNVox67cbb4AQBc4huc0j_-40eTUgeoZRczg2uzMAt-K0XojTDJmVen-IXkL5DN2Gx6Vlvu1F8__i8-DETUT_T6G1mHrvM"
                alt="Hero"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-black via-black/60 to-transparent" />
            </div>
            <div className="relative z-10 max-w-3xl">
              <div className="mb-4 inline-flex items-center gap-2 px-3 py-1 bg-primary/10 border border-primary/20 rounded-full">
                <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">Inventario en vivo</span>
              </div>
              <h1 className="font-headline text-7xl font-black text-white leading-[1] mb-10 tracking-tighter">
                Dominio <br /><span className="text-primary italic">Sin Compromiso.</span>
              </h1>
              <div className="bg-[#131314]/80 backdrop-blur-md p-1 rounded-sm flex border border-[#353436]/50 items-center max-w-2xl shadow-2xl">
                <div className="flex-1 px-5 flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary/50">search</span>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full bg-transparent border-none focus:ring-0 text-white font-bold placeholder:text-white/20 text-xs uppercase tracking-widest"
                    placeholder="MARCA, MODELO, AÑO..."
                    type="text"
                  />
                </div>
                {search && (
                  <button onClick={() => setSearch('')} className="px-4 text-white/30 hover:text-primary transition-colors">
                    <span className="material-symbols-outlined !text-lg">close</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        <div className="flex flex-col lg:flex-row gap-16">
          {/* Sidebar */}
          <aside className="w-full lg:w-72 flex-shrink-0">
            <div className="sticky top-32 space-y-8">
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
              {brands.length > 0 && (
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-primary mb-3">Manufactura</p>
                  <div className="flex flex-wrap gap-1.5">
                    {brands.map(b => (
                      <FilterChip
                        key={b} label={b} active={filterBrand === b}
                        onClick={() => {
                          const next = filterBrand === b ? null : b;
                          setFilterBrand(next);
                          setFilterModel(null);
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

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
                  className="w-full bg-[#1C1B1F] border border-[#353436] rounded-sm px-3 py-2 text-[#E5E2E3] text-xs focus:border-primary/50 focus:outline-none placeholder:text-[#E5E2E3]/20"
                />
              </div>
            </div>
          </aside>

          {/* Grid */}
          <div className="flex-1">
            <div className="flex justify-between items-center mb-10 border-b border-[#353436]/30 pb-6 flex-wrap gap-4">
              <div>
                <h2 className="font-headline text-4xl font-black text-white tracking-tighter">STOCK DISPONIBLE</h2>
                <p className="text-primary text-[10px] font-black uppercase tracking-[0.4em] mt-2">
                  {loading ? 'Cargando...' : `${vehicles.length} unidad${vehicles.length !== 1 ? 'es' : ''} encontrada${vehicles.length !== 1 ? 's' : ''}`}
                </p>
              </div>
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
                <span className="material-symbols-outlined text-6xl text-[#E5E2E3]/10 block mb-4">search_off</span>
                <p className="text-[#E5E2E3]/30 font-bold text-sm">No hay vehículos que coincidan con los filtros.</p>
                {hasFilters && (
                  <button onClick={clearAll} className="mt-4 text-primary text-xs font-bold uppercase tracking-wider hover:underline">
                    Limpiar filtros
                  </button>
                )}
              </div>
            )}

            {!loading && !error && vehicles.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-10 gap-y-16">
                {vehicles.map((vehicle) => {
                  const thumb = vehicle.imageUrls?.length > 0 ? vehicle.imageUrls[0] : vehicle.imageUrl;
                  return (
                    <div
                      key={vehicle.id}
                      className="group cursor-pointer"
                      onClick={() => navigate(`/product/${encodeURIComponent(vehicle.brand)}/${vehicle.id}`)}
                    >
                      <div className="relative overflow-hidden rounded-sm aspect-[16/10] bg-black mb-6 border border-[#353436]/50">
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
                      <div className="space-y-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-primary mb-1">{vehicle.brand}</p>
                            <h3 className="font-headline text-2xl font-black text-white group-hover:text-primary transition-colors tracking-tighter">
                              {vehicle.model}
                            </h3>
                            {vehicle.bodyType && (
                              <p className="text-[#E5E2E3]/30 text-[10px] uppercase tracking-wider mt-0.5">{vehicle.bodyType}</p>
                            )}
                          </div>
                          <span className="font-headline text-xl font-black text-white tracking-tighter">
                            ${vehicle.price.toLocaleString('es-CL')}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-4 border-t border-[#353436]/50">
                          <div className="spec-chip">{vehicle.year}</div>
                          <div className="spec-chip">{vehicle.mileage.toLocaleString('es-CL')} KM</div>
                          <div className="spec-chip text-primary">{vehicle.transmission} / {vehicle.fuel}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default InventoryScreen;
