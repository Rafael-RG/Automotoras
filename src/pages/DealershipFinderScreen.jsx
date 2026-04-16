import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import ReactDOM from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import useSEO from '../hooks/useSEO';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import TopNavBar from '../components/TopNavBar';
import { getDealerships, getVehicles } from '../services/api';

// ─── Custom map marker ────────────────────────────────────────────────────────
const createPin = (active = false) =>
  L.divIcon({
    className: '',
    html: `<svg width="30" height="38" viewBox="0 0 30 38" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 0C6.716 0 0 6.716 0 15c0 5.083 2.568 9.568 6.486 12.283L15 38l8.514-10.717C27.432 24.568 30 20.083 30 15 30 6.716 23.284 0 15 0z"
        fill="${active ? '#D32F2F' : '#1C1C1E'}"
        stroke="${active ? '#FF5252' : '#555'}"
        stroke-width="1.5"/>
      <circle cx="15" cy="15" r="6" fill="white"/>
    </svg>`,
    iconSize: [30, 38],
    iconAnchor: [15, 38],
    popupAnchor: [0, -40],
  });

// ─── Haversine distance (km) ─────────────────────────────────────────────────
const haversine = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ─── User location marker ────────────────────────────────────────────────────
const userPin = L.divIcon({
  className: '',
  html: `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" fill="#1565C0" opacity="0.25"/>
    <circle cx="12" cy="12" r="6" fill="#2196F3" stroke="white" stroke-width="2"/>
  </svg>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -14],
});

// ─── Fly-to controller (must be inside MapContainer) ─────────────────────────
const MapController = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, 13, { duration: 1.2 });
  }, [center, map]);
  return null;
};

// ─── Fly to user on first load ────────────────────────────────────────────────
const FlyToUser = ({ userLocation }) => {
  const map = useMap();
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (userLocation && !done) {
      map.flyTo([userLocation.lat, userLocation.lng], 12, { duration: 1.5 });
      setDone(true);
    }
  }, [userLocation, map, done]);
  return null;
};

// ─── Brand picker modal (portal → map never re-renders) ───────────────────────
const BrandPickerModal = memo(({ allBrands, selectedBrand, onSelect, onClose }) => {
  const [brandSearch, setBrandSearch] = useState('');
  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#131314] border border-[#353436] rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#353436]">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Seleccionar Marca</p>
          <button onClick={onClose} className="text-[#E5E2E3]/40 hover:text-[#D32F2F] transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="px-6 py-3 border-b border-[#353436]">
          <div className="flex items-center gap-2 bg-[#1C1B1F] border border-[#353436] rounded-sm px-3 py-2">
            <span className="material-symbols-outlined text-[#D32F2F]/40 !text-sm">search</span>
            <input
              autoFocus
              value={brandSearch}
              onChange={(e) => setBrandSearch(e.target.value)}
              placeholder="Buscar marca..."
              className="flex-1 bg-transparent text-[#E5E2E3] text-xs focus:outline-none placeholder:text-[#E5E2E3]/50"
            />
            {brandSearch && (
              <button onClick={() => setBrandSearch('')} className="text-[#E5E2E3]/30 hover:text-[#D32F2F]">
                <span className="material-symbols-outlined !text-sm">close</span>
              </button>
            )}
          </div>
        </div>
        <div className="overflow-y-auto flex-1 p-4">
          {(() => {
            const filtered = allBrands.filter(b => b.toLowerCase().includes(brandSearch.toLowerCase()));
            if (brandSearch) {
              return (
                <div className="flex flex-wrap gap-2">
                  {filtered.map(b => (
                    <button key={b} onClick={() => onSelect(b)}
                      className={`px-3 py-2 text-[10px] font-black uppercase tracking-widest rounded-sm border transition-all ${selectedBrand === b ? 'border-[#D32F2F] bg-[#D32F2F]/10 text-[#D32F2F]' : 'border-[#353436] bg-[#1C1B1F]/50 text-[#E5E2E3]/40 hover:border-[#D32F2F]/50 hover:text-[#D32F2F]/70'}`}>
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
                <div className="flex flex-wrap gap-1 pb-3 border-b border-[#353436]/50">
                  {letters.map(l => (
                    <button key={l}
                      onClick={() => document.getElementById(`df-brand-letter-${l}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })}
                      className="w-6 h-6 text-[10px] font-black text-[#E5E2E3]/40 hover:text-[#D32F2F] transition-colors">
                      {l}
                    </button>
                  ))}
                </div>
                {letters.map(l => (
                  <div key={l} id={`df-brand-letter-${l}`}>
                    <p className="text-[9px] font-black text-[#D32F2F] tracking-[0.3em] mb-2">{l}</p>
                    <div className="flex flex-wrap gap-2">
                      {grouped[l].map(b => (
                        <button key={b} onClick={() => onSelect(b)}
                          className={`px-3 py-2 text-[10px] font-black uppercase tracking-widest rounded-sm border transition-all ${selectedBrand === b ? 'border-[#D32F2F] bg-[#D32F2F]/10 text-[#D32F2F]' : 'border-[#353436] bg-[#1C1B1F]/50 text-[#E5E2E3]/40 hover:border-[#D32F2F]/50 hover:text-[#D32F2F]/70'}`}>
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
        {selectedBrand && (
          <div className="px-6 py-4 border-t border-[#353436] flex justify-between items-center">
            <span className="text-[10px] text-[#E5E2E3]/40">Seleccionada: <span className="text-[#D32F2F] font-bold">{selectedBrand}</span></span>
            <button onClick={() => onSelect(null)}
              className="text-[9px] font-black uppercase tracking-widest text-[#D32F2F] hover:underline">
              Quitar filtro
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
});

// ─── Main component ───────────────────────────────────────────────────────────
const DealershipFinderScreen = () => {
  useSEO({
    title: 'Concesionarios en Uruguay',
    description: 'Encontrá los mejores concesionarios de autos en Uruguay. Buscá por ubicación, marca y más en RedAutos.',
    url: '/dealerships',
  });
  const navigate = useNavigate();

  const [dealerships, setDealerships] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [selectedDealership, setSelectedDealership] = useState(null);
  const [flyTarget, setFlyTarget] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [geoError, setGeoError] = useState(false);
  const [maxDistance, setMaxDistance] = useState(null);
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [brandSearch, setBrandSearch] = useState('');
  const [mobileTab, setMobileTab] = useState('map'); // 'map' | 'list'
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Load data on mount
  useEffect(() => {
    Promise.all([getDealerships(), getVehicles()])
      .then(([ds, vs]) => { setDealerships(ds); setVehicles(vs); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Request user geolocation
  useEffect(() => {
    if (!navigator.geolocation) { setGeoError(true); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGeoError(true),
      { timeout: 10000 }
    );
  }, []);

  // Map of dealershipId → Set of brands
  const dealershipBrands = useMemo(() => {
    const map = {};
    vehicles.forEach((v) => {
      if (!map[v.dealershipId]) map[v.dealershipId] = new Set();
      map[v.dealershipId].add(v.brand);
    });
    return map;
  }, [vehicles]);

  // All unique brands (sorted)
  const allBrands = useMemo(() => {
    const set = new Set(vehicles.map((v) => v.brand));
    return [...set].sort();
  }, [vehicles]);

  // Distance from user to each dealership
  const dealershipDistances = useMemo(() => {
    if (!userLocation) return {};
    const map = {};
    dealerships.forEach((d) => {
      if (d.latitude !== 0 || d.longitude !== 0) {
        map[d.id] = haversine(userLocation.lat, userLocation.lng, d.latitude, d.longitude);
      }
    });
    return map;
  }, [userLocation, dealerships]);

  // Filtered dealerships
  const filteredDealerships = useMemo(() => {
    let result = dealerships;
    if (selectedBrand) result = result.filter((d) => dealershipBrands[d.id]?.has(selectedBrand));
    if (maxDistance && userLocation) {
      result = result.filter((d) => {
        const dist = dealershipDistances[d.id];
        return dist !== undefined && dist <= maxDistance;
      });
    }
    if (userLocation) {
      result = [...result].sort((a, b) => {
        const da = dealershipDistances[a.id] ?? Infinity;
        const db = dealershipDistances[b.id] ?? Infinity;
        return da - db;
      });
    }
    return result;
  }, [dealerships, dealershipBrands, selectedBrand, maxDistance, userLocation, dealershipDistances]);

  // Dealerships with valid coords
  const mappableDealerships = useMemo(
    () => filteredDealerships.filter((d) => d.latitude !== 0 || d.longitude !== 0),
    [filteredDealerships]
  );

  const handleSelectDealership = useCallback((d) => {
    setSelectedDealership((prev) => (prev?.id === d.id ? null : d));
    if (d.latitude !== 0 || d.longitude !== 0) {
      setFlyTarget([d.latitude, d.longitude]);
    }
    setMobileTab('map');
  }, []);

  const mapCenter = useMemo(() => {
    if (userLocation) return [userLocation.lat, userLocation.lng];
    if (mappableDealerships.length === 0) return [47, 8];
    const lats = mappableDealerships.map((d) => d.latitude);
    const lngs = mappableDealerships.map((d) => d.longitude);
    return [
      (Math.min(...lats) + Math.max(...lats)) / 2,
      (Math.min(...lngs) + Math.max(...lngs)) / 2,
    ];
  }, [userLocation, mappableDealerships]);

  return (
    <div className="bg-[#0E0E0F] text-[#E5E2E3] flex flex-col" style={{ height: '100dvh' }}>
      <TopNavBar />

      {/* Mobile tab bar */}
      <div className="lg:hidden fixed top-20 left-0 right-0 z-40 flex bg-[#131314] border-b border-[#E5E2E3]/10">
        <button
          onClick={() => setMobileTab('map')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-[10px] font-black uppercase tracking-widest transition-colors ${
            mobileTab === 'map' ? 'text-primary border-b-2 border-primary' : 'text-[#E5E2E3]/40'
          }`}
        >
          <span className="material-symbols-outlined !text-sm">map</span>
          Mapa
        </button>
        <button
          onClick={() => setMobileTab('list')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-[10px] font-black uppercase tracking-widest transition-colors ${
            mobileTab === 'list' ? 'text-primary border-b-2 border-primary' : 'text-[#E5E2E3]/40'
          }`}
        >
          <span className="material-symbols-outlined !text-sm">list</span>
          Lista ({filteredDealerships.length})
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden pt-[124px] lg:pt-24">
        {/* ── Sidebar ───────────────────────────────── */}
        <aside className={`${
          mobileTab === 'list' ? 'flex' : 'hidden'
        } lg:flex w-full lg:w-72 flex-shrink-0 bg-[#0E0E0F] border-r border-[#E5E2E3]/10 flex-col overflow-y-auto`}>

          {/* Header — desktop only */}
          <div className="hidden lg:block p-6 border-b border-[#E5E2E3]/10">
            <h2 className="font-headline text-lg font-extrabold tracking-tight text-[#E5E2E3]">
              Localizador
            </h2>
            <p className="text-[#E5E2E3]/30 text-[10px] font-bold uppercase tracking-[0.2em] mt-1">
              Red Global de Automotoras
            </p>
          </div>

          {/* ── Filtros colapsables (mobile) / siempre visibles (desktop) ── */}
          <div className="border-b border-[#E5E2E3]/10">

            {/* Barra toggle — solo mobile */}
            <button
              className="lg:hidden w-full flex items-center justify-between px-4 py-2.5"
              onClick={() => setFiltersOpen(o => !o)}
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined !text-sm text-[#D32F2F]">tune</span>
                <span className="text-[9px] font-black uppercase tracking-[0.25em] text-[#E5E2E3]/60">Filtros</span>
                {/* Badges de filtros activos */}
                {maxDistance && (
                  <span className="px-1.5 py-0.5 bg-[#2196F3]/20 text-[#2196F3] text-[9px] font-bold rounded">
                    &lt;{maxDistance}km
                  </span>
                )}
                {selectedBrand && (
                  <span className="px-1.5 py-0.5 bg-[#D32F2F]/20 text-[#D32F2F] text-[9px] font-bold rounded truncate max-w-[80px]">
                    {selectedBrand}
                  </span>
                )}
              </div>
              <span className={`material-symbols-outlined !text-sm text-[#E5E2E3]/30 transition-transform duration-200 ${filtersOpen ? 'rotate-180' : ''}`}>
                expand_more
              </span>
            </button>

            {/* Contenido de filtros */}
            <div className={`${filtersOpen ? 'block' : 'hidden'} lg:block`}>

              {/* Distance filter */}
              {!geoError && (
                <div className="px-4 py-3 lg:p-6 border-t lg:border-t-0 border-[#E5E2E3]/10 lg:border-b">
                  <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[#D32F2F] mb-2">
                    {userLocation ? 'Distancia' : 'Obteniendo ubicación…'}
                  </p>
                  {userLocation ? (
                    <div className="flex flex-wrap gap-1.5">
                      {[null, 10, 25, 50, 100].map((km) => (
                        <button
                          key={km ?? 'all'}
                          onClick={() => setMaxDistance(km)}
                          className={`px-2.5 py-1 rounded-lg text-[9px] font-bold transition-colors ${
                            maxDistance === km
                              ? 'bg-[#2196F3]/20 text-[#2196F3] border border-[#2196F3]/30'
                              : 'bg-[#1C1C1E] text-[#E5E2E3]/40 border border-[#E5E2E3]/10 hover:border-[#E5E2E3]/20 hover:text-[#E5E2E3]/60'
                          }`}
                        >
                          {km ? `< ${km} km` : 'Todas'}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full border-2 border-[#2196F3] border-t-transparent animate-spin" />
                      <span className="text-[#E5E2E3]/45 text-[10px]">Localizando…</span>
                    </div>
                  )}
                </div>
              )}

              {/* Brand filter */}
              <div className="px-4 py-3 lg:p-6">
                <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[#D32F2F] mb-2">
                  Filtrar por marca
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedBrand && (
                    <button
                      onClick={() => setSelectedBrand(null)}
                      className="px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-sm border border-[#D32F2F] bg-[#D32F2F]/10 text-[#D32F2F] transition-all"
                    >
                      {selectedBrand} ✕
                    </button>
                  )}
                  {allBrands.filter(b => b !== selectedBrand).slice(0, 5).map((brand) => (
                    <button
                      key={brand}
                      onClick={() => setSelectedBrand((b) => (b === brand ? null : brand))}
                      className="px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-sm border border-[#353436] bg-[#1C1B1F]/50 text-[#E5E2E3]/40 hover:border-[#D32F2F]/50 hover:text-[#D32F2F]/70 transition-all"
                    >
                      {brand}
                    </button>
                  ))}
                  <button
                    onClick={() => { setBrandSearch(''); setShowBrandModal(true); }}
                    className="px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-sm border border-dashed border-[#353436] text-[#E5E2E3]/40 hover:border-[#D32F2F]/50 hover:text-[#D32F2F]/70 transition-all"
                  >
                    Ver más…
                  </button>
                </div>
              </div>

            </div>
          </div>

          {/* Dealership list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#D32F2F] border-t-transparent" />
              </div>
            ) : filteredDealerships.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-[#E5E2E3]/45 text-xs">
                  No hay automotoras con {selectedBrand}
                </p>
              </div>
            ) : (
              filteredDealerships.map((d) => {
                const brands = [...(dealershipBrands[d.id] || new Set())].sort();
                const isSelected = selectedDealership?.id === d.id;
                return (
                  <div
                    key={d.id}
                    className={`w-full text-left rounded-lg transition-all border overflow-hidden ${
                      isSelected
                        ? 'bg-[#D32F2F]/10 border-[#D32F2F]/30'
                        : 'bg-[#1C1C1E] border-[#E5E2E3]/5 hover:border-[#E5E2E3]/15'
                    }`}
                  >
                    {/* Clickable area → select on map */}
                    <div
                      className="p-4 cursor-pointer"
                      onClick={() => handleSelectDealership(d)}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-[#0E0E0F] border border-[#E5E2E3]/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {d.logoUrl ? (
                            <img src={d.logoUrl} alt={d.name} className="w-full h-full object-cover rounded-lg" />
                          ) : (
                            <span className="material-symbols-outlined !text-sm text-[#E5E2E3]/45">garage</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[#E5E2E3] font-bold text-sm truncate">{d.name}</p>
                          <p className="text-[#E5E2E3]/30 text-xs">{d.city}, {d.country}</p>
                          {dealershipDistances[d.id] !== undefined && (
                            <p className="text-[#2196F3] text-[10px] font-bold mt-0.5">
                              {dealershipDistances[d.id] < 1
                                ? `${Math.round(dealershipDistances[d.id] * 1000)} m`
                                : `${dealershipDistances[d.id].toFixed(1)} km`}
                            </p>
                          )}
                        </div>
                      </div>
                      {brands.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {brands.map((b) => (
                            <span
                              key={b}
                              className="px-2 py-0.5 bg-[#E5E2E3]/5 text-[#E5E2E3]/40 text-[9px] font-bold uppercase tracking-wider rounded"
                            >
                              {b}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Ver perfil link */}
                    <div className="px-4 pb-3 flex justify-end border-t border-[#E5E2E3]/5">
                      <Link
                        to={`/dealerships/${d.id}`}
                        className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Ver perfil
                        <span className="material-symbols-outlined !text-xs">arrow_forward</span>
                      </Link>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* ── Map + detail ──────────────────────────── */}
        <div className={`${
          mobileTab === 'map' ? 'flex' : 'hidden'
        } lg:flex flex-1 flex-col overflow-hidden`}>
          {/* Map */}
          <div className="flex-1 relative isolate">
            {!loading && (
              <MapContainer
                center={mapCenter}
                zoom={5}
                style={{ width: '100%', height: '100%' }}
                zoomControl={false}
              >
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                />
                {flyTarget && <MapController center={flyTarget} />}
                <FlyToUser userLocation={userLocation} />
                {userLocation && (
                  <Marker position={[userLocation.lat, userLocation.lng]} icon={userPin}>
                    <Popup>
                      <div style={{ background: '#1C1C1E', border: '1px solid #333', padding: '10px', borderRadius: '8px', color: '#E5E2E3', fontSize: '12px', fontWeight: 'bold' }}>
                        📍 Tu ubicación
                      </div>
                    </Popup>
                  </Marker>
                )}
                {mappableDealerships.map((d) => (
                  <Marker
                    key={d.id}
                    position={[d.latitude, d.longitude]}
                    icon={createPin(selectedDealership?.id === d.id)}
                    eventHandlers={{ click: () => handleSelectDealership(d) }}
                  >
                    <Popup>
                      <div style={{ background: '#1C1C1E', border: '1px solid #333', padding: '12px', borderRadius: '8px', minWidth: '200px', color: '#E5E2E3' }}>
                        <p style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '4px' }}>{d.name}</p>
                        <p style={{ color: '#999', fontSize: '11px', marginBottom: '8px' }}>{d.city}, {d.country}</p>
                        {[...(dealershipBrands[d.id] || [])].sort().map((b) => (
                          <span key={b} style={{ display: 'inline-block', background: '#333', color: '#ccc', fontSize: '9px', padding: '2px 6px', marginRight: '4px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 'bold' }}>{b}</span>
                        ))}
                        {(d.latitude !== 0 || d.longitude !== 0) && (
                          <div style={{ marginTop: '10px' }}>
                            <a
                              href={`https://www.google.com/maps/dir/?api=1&destination=${d.latitude},${d.longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#4285F4', color: 'white', fontSize: '10px', padding: '5px 10px', borderRadius: '5px', fontWeight: 'bold', textDecoration: 'none' }}
                            >
                              Cómo llegar
                            </a>
                          </div>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            )}
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#0E0E0F]">
                <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#D32F2F] border-t-transparent" />
              </div>
            )}
          </div>

          {/* Selected dealership detail panel */}
          {selectedDealership && (
            <div className="bg-[#131314] border-t border-[#E5E2E3]/10 p-3 md:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-3 md:gap-6 flex-wrap overflow-y-auto max-h-[45vh] sm:max-h-none">
              <div className="w-12 h-12 rounded-xl bg-[#0E0E0F] border border-[#E5E2E3]/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {selectedDealership.logoUrl ? (
                  <img src={selectedDealership.logoUrl} alt={selectedDealership.name} className="w-full h-full object-cover rounded-xl" />
                ) : (
                  <span className="material-symbols-outlined text-[#E5E2E3]/45">garage</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[#E5E2E3] font-headline font-bold text-xl tracking-tight">
                  {selectedDealership.name}
                </h3>
                <p className="text-[#E5E2E3]/40 text-sm">
                  {selectedDealership.address}, {selectedDealership.city}, {selectedDealership.country}
                </p>
                <div className="flex items-center gap-4 mt-1 text-xs text-[#E5E2E3]/30 flex-wrap">
                  {selectedDealership.phone && (
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined !text-sm">phone</span>
                      {selectedDealership.phone}
                    </span>
                  )}
                  {selectedDealership.email && (
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined !text-sm">mail</span>
                      {selectedDealership.email}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 flex-wrap">
                {/* Brands available */}
                <div className="hidden md:flex gap-1 flex-wrap">
                  {[...(dealershipBrands[selectedDealership.id] || [])].sort().map((b) => (
                    <span
                      key={b}
                      className="px-2 py-1 bg-[#D32F2F]/10 text-[#D32F2F] border border-[#D32F2F]/20 text-[9px] font-black uppercase tracking-wider rounded"
                    >
                      {b}
                    </span>
                  ))}
                </div>
                {/* Google Maps */}
                {(selectedDealership.latitude !== 0 || selectedDealership.longitude !== 0) && (
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${selectedDealership.latitude},${selectedDealership.longitude}&destination_place_id=${encodeURIComponent(selectedDealership.name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 bg-[#4285F4]/10 text-[#4285F4] border border-[#4285F4]/20 px-4 py-2 rounded-lg text-xs font-bold hover:bg-[#4285F4]/20 transition-colors"
                  >
                    <span className="material-symbols-outlined !text-sm">directions</span>
                    Cómo llegar
                  </a>
                )}
                {/* WhatsApp */}
                {selectedDealership.phone && (
                  <a
                    href={`https://wa.me/${selectedDealership.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola! Los contacto desde RedAutos para consultar sobre sus vehículos disponibles.`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 bg-[#25D366]/10 text-[#25D366] border border-[#25D366]/20 px-4 py-2 rounded-lg text-xs font-bold hover:bg-[#25D366]/20 transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    WhatsApp
                  </a>
                )}
                {/* See inventory */}
                <button
                  onClick={() => navigate(`/?dealership=${selectedDealership.id}`)}
                  className="flex items-center gap-2 bg-[#E5E2E3]/5 text-[#E5E2E3]/60 border border-[#E5E2E3]/10 px-4 py-2 rounded-lg text-xs font-bold hover:bg-[#E5E2E3]/10 hover:text-[#E5E2E3] transition-colors"
                >
                  <span className="material-symbols-outlined !text-sm">directions_car</span>
                  Ver inventario
                </button>
                <button
                  onClick={() => setSelectedDealership(null)}
                  className="p-2 text-[#E5E2E3]/30 hover:text-[#E5E2E3]/60 transition-colors"
                >
                  <span className="material-symbols-outlined !text-lg">close</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Brand picker modal (portal) ────────────────────────────── */}
      {showBrandModal && (
        <BrandPickerModal
          allBrands={allBrands}
          selectedBrand={selectedBrand}
          onSelect={(b) => { setSelectedBrand(b === selectedBrand ? null : b); setShowBrandModal(false); }}
          onClose={() => setShowBrandModal(false)}
        />
      )}
    </div>
  );
};

export default DealershipFinderScreen;
