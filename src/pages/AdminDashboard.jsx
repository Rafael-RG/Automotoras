import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import logoSrc from '../assets/Logo.png';
import {
  getDealerships, createDealership, updateDealership, uploadDealershipLogo,
  getVehicles, createVehicle, updateVehicle, deleteVehicle, uploadVehicleImage, removeVehicleImage,
} from '../services/api';
import { TRANSMISSIONS, FUELS, BODY_TYPES, VEHICLE_BRANDS, VEHICLE_MODELS } from '../constants/vehicles';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const EMPTY_VEHICLE = {
  brand: '', model: '', year: new Date().getFullYear(), price: '',
  mileage: 0, transmission: 'Automática', fuel: 'Gasolina', bodyType: 'Sedán',
  description: '', isAvailable: true,
};

// ─── Dealership Selector ──────────────────────────────────────────────────────
const DealershipSelector = ({ dealerships, onSelect }) => {
  const multi = dealerships.length > 1;
  return (
    <div className="min-h-screen bg-[#0E0E0F] flex items-center justify-center">
      <div className="max-w-lg w-full mx-4">
        <div className="flex justify-center mb-8">
          <img src={logoSrc} alt="RedAutos" className="h-20 object-contain" />
        </div>
        <p className="text-[#E5E2E3]/40 text-center text-sm mb-2">
          {multi ? `Seleccioná tu sucursal (${dealerships.length} disponibles)` : 'Seleccioná tu automotora para continuar'}
        </p>
        <h2 className="text-[#E5E2E3] font-headline font-black text-2xl text-center tracking-tighter mb-8">
          {multi ? '¿Desde qué sucursal vas a trabajar?' : dealerships[0]?.name}
        </h2>
        <div className="space-y-3">
          {dealerships.map((d) => (
            <button
              key={d.id}
              onClick={() => onSelect(d.id)}
              className="w-full bg-[#1C1C1E] border border-[#E5E2E3]/10 rounded-sm p-5 text-left hover:border-[#D32F2F]/50 hover:bg-[#D32F2F]/5 transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-[#D32F2F]/10 rounded-sm flex items-center justify-center group-hover:bg-[#D32F2F]/20 transition-colors flex-shrink-0">
                  {d.logoUrl
                    ? <img src={d.logoUrl} alt={d.name} className="w-9 h-9 object-cover rounded-sm" />
                    : <span className="material-symbols-outlined text-[#D32F2F]">garage</span>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[#E5E2E3] font-headline font-bold text-base tracking-tight truncate">{d.name}</div>
                  <div className="text-[#E5E2E3]/40 text-xs">{d.city}, {d.country}</div>
                </div>
                <span className="material-symbols-outlined text-[#E5E2E3]/20 group-hover:text-[#D32F2F] transition-colors">
                  arrow_forward
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Sidebar ──────────────────────────────────────────────────────────────────
const Sidebar = ({ activeTab, setActiveTab, dealership, onChangeDealership, onLogout }) => {
  const nav = [
    { id: 'dashboard', icon: 'speed', label: 'Panel' },
    { id: 'fleet', icon: 'directions_car', label: 'Mi Flota' },
    { id: 'sucursales', icon: 'store', label: 'Sucursales' },
    { id: 'config', icon: 'tune', label: 'Configuración' },
  ];
  return (
    <aside className="fixed left-0 h-full w-64 border-r border-[#E5E2E3]/10 bg-[#0E0E0F] flex flex-col py-8 z-40">
      <div className="px-6 mb-10">
        <img src={logoSrc} alt="RedAutos" className="h-14 w-auto object-contain mb-2" />
        <span className="text-[10px] font-semibold text-[#D32F2F] tracking-widest uppercase block truncate">
          {dealership?.name ?? '...'}
        </span>
      </div>
      <nav className="flex-1 space-y-1">
        {nav.map((n) => (
          <button
            key={n.id}
            onClick={() => setActiveTab(n.id)}
            className={`w-full flex items-center gap-3 px-6 py-4 text-[11px] font-semibold uppercase tracking-wider transition-all ${
              activeTab === n.id
                ? 'bg-gradient-to-r from-[#D32F2F]/10 to-transparent text-[#FFB3AC] border-l-4 border-[#D32F2F]'
                : 'text-[#E5E2E3]/50 hover:text-[#E5E2E3] border-l-4 border-transparent'
            }`}
          >
            <span className="material-symbols-outlined !text-xl">{n.icon}</span>
            {n.label}
          </button>
        ))}
        <button
          onClick={onChangeDealership}
          className="w-full flex items-center gap-3 px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-[#E5E2E3]/50 hover:text-[#E5E2E3] border-l-4 border-transparent transition-all"
        >
          <span className="material-symbols-outlined !text-xl">swap_horiz</span>
          Cambiar sucursal
        </button>
      </nav>
      <div className="px-6 mt-auto">
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 border border-[#E5E2E3]/10 text-[#E5E2E3]/40 hover:text-[#E5E2E3] hover:border-[#E5E2E3]/30 py-3 rounded-sm text-[11px] font-semibold uppercase tracking-wider transition-all"
        >
          <span className="material-symbols-outlined !text-base">logout</span>
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
};

// ─── Metric Card ──────────────────────────────────────────────────────────────
const MetricCard = ({ label, value, sub, icon, highlight }) => (
  <div
    className={`bg-[#1C1C1E] border rounded-lg p-6 ${
      highlight ? 'border-[#D32F2F]/40' : 'border-[#E5E2E3]/10'
    }`}
  >
    <div className="flex items-start justify-between">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#E5E2E3]/40 mb-3">{label}</p>
        <p className="text-4xl font-headline font-black text-[#E5E2E3] tracking-tighter">{value}</p>
        {sub && <p className="text-xs text-[#E5E2E3]/40 mt-1">{sub}</p>}
      </div>
      <div
        className={`w-10 h-10 rounded-lg flex items-center justify-center ${
          highlight ? 'bg-[#D32F2F]/20' : 'bg-[#E5E2E3]/5'
        }`}
      >
        <span
          className={`material-symbols-outlined !text-xl ${
            highlight ? 'text-[#D32F2F]' : 'text-[#E5E2E3]/40'
          }`}
        >
          {icon}
        </span>
      </div>
    </div>
  </div>
);

// ─── Distribution Bar ─────────────────────────────────────────────────────────
const DistBar = ({ label, count, max, color = 'bg-[#D32F2F]' }) => (
  <div className="flex items-center gap-3">
    <span className="text-[#E5E2E3]/50 text-xs w-24 truncate flex-shrink-0">{label}</span>
    <div className="flex-1 h-1.5 bg-[#E5E2E3]/5 rounded-full overflow-hidden">
      <div
        className={`h-full ${color} rounded-full transition-all duration-700`}
        style={{ width: max > 0 ? `${(count / max) * 100}%` : '0%' }}
      />
    </div>
    <span className="text-[#E5E2E3]/40 text-xs w-5 text-right flex-shrink-0">{count}</span>
  </div>
);

// ─── Dashboard Tab ────────────────────────────────────────────────────────────
const DashboardTab = ({ vehicles, dealership }) => {
  const metrics = useMemo(() => {
    if (!vehicles.length) return null;
    const available = vehicles.filter((v) => v.isAvailable).length;
    const prices = vehicles.map((v) => v.price);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const totalValue = prices.reduce((a, b) => a + b, 0);
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);

    const totalViews = vehicles.reduce((s, v) => s + (v.viewCount || 0), 0);
    const totalLeads = vehicles.reduce((s, v) => s + (v.leadCount || 0), 0);
    const totalShares = vehicles.reduce((s, v) => s + (v.shareCount || 0), 0);
    const convRate = totalViews > 0 ? ((totalLeads / totalViews) * 100).toFixed(1) : '0.0';

    const brandMap = {};
    vehicles.forEach((v) => { brandMap[v.brand] = (brandMap[v.brand] || 0) + 1; });
    const brands = Object.entries(brandMap).sort((a, b) => b[1] - a[1]);

    const fuelMap = {};
    vehicles.forEach((v) => { fuelMap[v.fuel] = (fuelMap[v.fuel] || 0) + 1; });
    const fuels = Object.entries(fuelMap).sort((a, b) => b[1] - a[1]);

    const transMap = {};
    vehicles.forEach((v) => { transMap[v.transmission] = (transMap[v.transmission] || 0) + 1; });
    const transmissions = Object.entries(transMap).sort((a, b) => b[1] - a[1]);

    const topViewed = [...vehicles].sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0)).slice(0, 5);
    const topLeads = [...vehicles].sort((a, b) => (b.leadCount || 0) - (a.leadCount || 0)).slice(0, 5);
    const topShared = [...vehicles].sort((a, b) => (b.shareCount || 0) - (a.shareCount || 0)).slice(0, 3);

    return {
      available, avgPrice, totalValue, maxPrice, minPrice,
      brands, fuels, transmissions,
      totalViews, totalLeads, totalShares, convRate,
      topViewed, topLeads, topShared,
    };
  }, [vehicles]);

  if (!metrics) {
    return (
      <div className="text-center py-24">
        <span className="material-symbols-outlined text-7xl text-[#E5E2E3]/10">directions_car</span>
        <p className="text-[#E5E2E3]/30 mt-4 text-sm">No hay vehículos en la flota todavía.</p>
        <p className="text-[#E5E2E3]/20 text-xs mt-1">Agregá unidades desde la sección Mi Flota.</p>
      </div>
    );
  }

  const sorted = [...vehicles].sort((a, b) => a.price - b.price);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-headline font-extrabold text-[#E5E2E3] tracking-tighter uppercase">
          Panel General
        </h1>
        <p className="text-[#E5E2E3]/30 text-sm mt-1">{dealership?.name}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          label="Total en Flota"
          value={vehicles.length}
          sub={`${vehicles.length - metrics.available} reservados`}
          icon="directions_car"
        />
        <MetricCard
          label="Disponibles"
          value={metrics.available}
          sub={`${Math.round((metrics.available / vehicles.length) * 100)}% del inventario`}
          icon="check_circle"
          highlight
        />
        <MetricCard
          label="Leads Generados"
          value={metrics.totalLeads}
          sub={`${metrics.totalViews} vistas totales`}
          icon="forum"
          highlight
        />
        <MetricCard
          label="Tasa de Conversión"
          value={`${metrics.convRate}%`}
          sub={`${metrics.totalShares} veces compartido`}
          icon="trending_up"
        />
      </div>

      {/* Engagement: most viewed + most leads */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#1C1C1E] border border-[#E5E2E3]/10 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-5">
            <span className="material-symbols-outlined text-[#E5E2E3]/30 !text-lg">visibility</span>
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#E5E2E3]/40">
              Autos más buscados
            </h3>
          </div>
          {metrics.totalViews === 0 ? (
            <p className="text-[#E5E2E3]/20 text-xs text-center py-6">
              Las vistas se registrarán cuando los clientes visiten los autos.
            </p>
          ) : (
            <div className="space-y-3">
              {metrics.topViewed.map((v, i) => {
                const maxV = metrics.topViewed[0]?.viewCount || 1;
                const pct = ((v.viewCount || 0) / maxV) * 100;
                return (
                  <div key={v.id}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[#E5E2E3]/20 text-[10px] font-black w-4">{i + 1}</span>
                        <p className="text-[#E5E2E3] text-xs font-semibold truncate max-w-[160px]">
                          {v.brand} {v.model}
                        </p>
                      </div>
                      <span className="text-[#E5E2E3]/50 text-xs tabular-nums">{v.viewCount || 0}</span>
                    </div>
                    <div className="h-1.5 bg-[#E5E2E3]/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#D32F2F] rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-[#1C1C1E] border border-[#E5E2E3]/10 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-5">
            <span className="material-symbols-outlined text-[#E5E2E3]/30 !text-lg">forum</span>
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#E5E2E3]/40">
              Autos con más leads
            </h3>
          </div>
          {metrics.totalLeads === 0 ? (
            <p className="text-[#E5E2E3]/20 text-xs text-center py-6">
              Los leads aparecerán cuando los clientes contacten vía WhatsApp.
            </p>
          ) : (
            <div className="space-y-3">
              {metrics.topLeads.map((v, i) => {
                const maxL = metrics.topLeads[0]?.leadCount || 1;
                const pct = ((v.leadCount || 0) / maxL) * 100;
                return (
                  <div key={v.id}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[#E5E2E3]/20 text-[10px] font-black w-4">{i + 1}</span>
                        <p className="text-[#E5E2E3] text-xs font-semibold truncate max-w-[160px]">
                          {v.brand} {v.model}
                        </p>
                      </div>
                      <span className="text-[#E5E2E3]/50 text-xs tabular-nums">{v.leadCount || 0}</span>
                    </div>
                    <div className="h-1.5 bg-[#E5E2E3]/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#1565C0] rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Shares + Fleet status + Brand */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Shares leaderboard */}
        <div className="bg-[#1C1C1E] border border-[#E5E2E3]/10 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-[#E5E2E3]/30 !text-lg">share</span>
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#E5E2E3]/40">Compartidos</h3>
          </div>
          <div className="flex items-baseline gap-2 mb-5">
            <span className="text-3xl font-headline font-black text-[#E5E2E3]">{metrics.totalShares}</span>
            <span className="text-[#E5E2E3]/30 text-xs">veces en total</span>
          </div>
          <div className="space-y-1">
            {metrics.topShared.map((v, i) => (
              <div key={v.id} className="flex items-center justify-between py-1.5 border-b border-[#E5E2E3]/5 last:border-0">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-black ${
                    i === 0 ? 'text-yellow-400' : i === 1 ? 'text-[#E5E2E3]/40' : 'text-amber-700/70'
                  }`}>
                    #{i + 1}
                  </span>
                  <p className="text-[#E5E2E3]/70 text-xs truncate max-w-[110px]">{v.brand} {v.model}</p>
                </div>
                <span className="text-[#E5E2E3]/50 text-xs font-bold tabular-nums">{v.shareCount || 0}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Fleet status + fuel */}
        <div className="bg-[#1C1C1E] border border-[#E5E2E3]/10 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-5">
            <span className="material-symbols-outlined text-[#E5E2E3]/30 !text-lg">donut_large</span>
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#E5E2E3]/40">Estado de Flota</h3>
          </div>
          <div className="space-y-3 mb-6">
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-green-400 font-semibold">Disponibles</span>
                <span className="text-[#E5E2E3]/50">{metrics.available}</span>
              </div>
              <div className="h-2 bg-[#E5E2E3]/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full"
                  style={{ width: `${(metrics.available / vehicles.length) * 100}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-yellow-400 font-semibold">Reservados</span>
                <span className="text-[#E5E2E3]/50">{vehicles.length - metrics.available}</span>
              </div>
              <div className="h-2 bg-[#E5E2E3]/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-yellow-500 rounded-full"
                  style={{ width: `${((vehicles.length - metrics.available) / vehicles.length) * 100}%` }}
                />
              </div>
            </div>
          </div>
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#E5E2E3]/40 mb-3">Por Combustible</h3>
          <div className="space-y-2">
            {metrics.fuels.map(([fuel, count]) => (
              <DistBar key={fuel} label={fuel} count={count} max={metrics.fuels[0][1]} color="bg-[#1565C0]" />
            ))}
          </div>
        </div>

        {/* Brand distribution */}
        <div className="bg-[#1C1C1E] border border-[#E5E2E3]/10 rounded-lg p-6">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#E5E2E3]/40 mb-5">Por Marca</h3>
          <div className="space-y-3">
            {metrics.brands.map(([brand, count]) => (
              <DistBar key={brand} label={brand} count={count} max={metrics.brands[0][1]} />
            ))}
          </div>
        </div>
      </div>

      {/* Price distribution */}
      <div className="bg-[#1C1C1E] border border-[#E5E2E3]/10 rounded-lg p-6">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#E5E2E3]/40 mb-5">
          Distribución de Precios
        </h3>
        <div className="flex items-end gap-1.5 h-20">
          {sorted.map((v) => {
            const heightPct = (v.price / metrics.maxPrice) * 100;
            return (
              <div
                key={v.id}
                className="flex-1 flex flex-col justify-end group/bar"
                title={`${v.brand} ${v.model} — ${fmt(v.price)}`}
              >
                <div
                  className="w-full bg-[#D32F2F]/30 group-hover/bar:bg-[#D32F2F] rounded-t transition-colors duration-200"
                  style={{ height: `${Math.max(heightPct, 6)}%` }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-2">
          <span className="text-xs text-[#E5E2E3]/30">Min: {fmt(metrics.minPrice)}</span>
          <span className="text-xs text-[#E5E2E3]/30">Max: {fmt(metrics.maxPrice)}</span>
        </div>
      </div>

      {/* Vehicles — engagement performance */}
      <div className="bg-[#1C1C1E] border border-[#E5E2E3]/10 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E5E2E3]/10">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#E5E2E3]/40">
            Vehículos — Rendimiento
          </h3>
        </div>
        <div className="divide-y divide-[#E5E2E3]/5">
          {vehicles.slice(0, 6).map((v) => (
            <div key={v.id} className="flex items-center gap-4 px-6 py-3">
              <div className="w-12 h-8 rounded bg-[#0E0E0F] overflow-hidden flex-shrink-0">
                {v.imageUrl
                  ? <img src={v.imageUrl} alt={v.model} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center">
                      <span className="material-symbols-outlined text-[#E5E2E3]/10 !text-base">directions_car</span>
                    </div>
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[#E5E2E3] text-sm font-semibold truncate">{v.brand} {v.model}</p>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                  <span className="flex items-center gap-1 text-[#E5E2E3]/30 text-[11px]">
                    <span className="material-symbols-outlined !text-[12px]">visibility</span>
                    {v.viewCount || 0}
                  </span>
                  <span className="flex items-center gap-1 text-[#E5E2E3]/30 text-[11px]">
                    <span className="material-symbols-outlined !text-[12px]">forum</span>
                    {v.leadCount || 0}
                  </span>
                  <span className="flex items-center gap-1 text-[#E5E2E3]/30 text-[11px]">
                    <span className="material-symbols-outlined !text-[12px]">share</span>
                    {v.shareCount || 0}
                  </span>
                </div>
              </div>
              <p className="text-[#D32F2F] font-headline font-bold text-sm flex-shrink-0">{fmt(v.price)}</p>
              <span
                className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                  v.isAvailable
                    ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                    : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                }`}
              >
                {v.isAvailable ? 'OK' : 'Reservado'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Vehicle Modal ─────────────────────────────────────────────────────────────
const VehicleModal = ({ vehicle, dealershipId, dealerships, onClose, onSaved }) => {
  const isEdit = !!vehicle;
  const [form, setForm] = useState(
    vehicle
      ? {
          brand: vehicle.brand, model: vehicle.model, year: vehicle.year,
          price: vehicle.price, mileage: vehicle.mileage, transmission: vehicle.transmission,
          fuel: vehicle.fuel, bodyType: vehicle.bodyType || 'Sedán', description: vehicle.description, isAvailable: vehicle.isAvailable,
        }
      : { ...EMPTY_VEHICLE }
  );
  const [customBrand, setCustomBrand] = useState(
    vehicle && !VEHICLE_BRANDS.includes(vehicle.brand) ? vehicle.brand : ''
  );
  const [brandMode, setBrandMode] = useState(
    vehicle && !VEHICLE_BRANDS.includes(vehicle.brand) ? 'other' : 'list'
  );
  const [imageFiles, setImageFiles] = useState([]);
  const [existingUrls, setExistingUrls] = useState(
    vehicle?.imageUrls?.length > 0 ? vehicle.imageUrls
    : vehicle?.imageUrl ? [vehicle.imageUrl]
    : []
  );
  const [removingUrl, setRemovingUrl] = useState(null);
  const [selectedDealershipId, setSelectedDealershipId] = useState(
    vehicle?.dealershipId || dealershipId
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (field) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [field]: val }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        year: Number.parseInt(form.year, 10),
        price: Number.parseFloat(form.price),
        mileage: Number.parseInt(form.mileage, 10),
        dealershipId: selectedDealershipId,
      };
      let saved;
      if (isEdit) {
        saved = await updateVehicle(vehicle.brand, vehicle.id, payload);
      } else {
        saved = await createVehicle(payload);
      }
      if (imageFiles.length > 0 && saved) {
        for (const f of imageFiles) {
          await uploadVehicleImage(saved.brand, saved.id, f).catch(() => {});
        }
      }
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#141415] border border-[#E5E2E3]/10 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-[#E5E2E3]/10">
          <h2 className="text-xl font-headline font-black text-[#E5E2E3] uppercase tracking-tight">
            {isEdit ? 'Editar Vehículo' : 'Nueva Unidad'}
          </h2>
          <button onClick={onClose} className="text-[#E5E2E3]/40 hover:text-[#E5E2E3] transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-[#E5E2E3]/40 mb-2">
                Marca
              </label>
              {isEdit ? (
                <>
                  <input
                    value={form.brand} readOnly disabled
                    className="w-full bg-[#1C1C1E] border border-[#E5E2E3]/10 rounded-lg px-4 py-3 text-[#E5E2E3] text-sm opacity-40 cursor-not-allowed"
                  />
                  <p className="text-[#E5E2E3]/20 text-[10px] mt-1">La marca no puede modificarse</p>
                </>
              ) : (
                <>
                  <select
                    value={brandMode === 'other' ? '__other__' : (form.brand || '')}
                    onChange={(e) => {
                      if (e.target.value === '__other__') {
                        setBrandMode('other');
                        setForm((f) => ({ ...f, brand: customBrand }));
                      } else {
                        setBrandMode('list');
                        setCustomBrand('');
                        setForm((f) => ({ ...f, brand: e.target.value }));
                      }
                    }}
                    required={brandMode !== 'other'}
                    className="w-full bg-[#1C1C1E] border border-[#E5E2E3]/10 rounded-lg px-4 py-3 text-[#E5E2E3] text-sm focus:border-[#D32F2F]/50 focus:outline-none appearance-none"
                  >
                    <option value="" disabled>Seleccionar marca…</option>
                    {VEHICLE_BRANDS.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                    <option value="__other__">Otra marca…</option>
                  </select>
                  {brandMode === 'other' && (
                    <input
                      value={customBrand}
                      onChange={(e) => {
                        setCustomBrand(e.target.value);
                        setForm((f) => ({ ...f, brand: e.target.value }));
                      }}
                      required
                      placeholder="Escribí la marca"
                      className="w-full mt-2 bg-[#1C1C1E] border border-[#D32F2F]/40 rounded-lg px-4 py-3 text-[#E5E2E3] text-sm focus:border-[#D32F2F]/80 focus:outline-none"
                    />
                  )}
                </>
              )}
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-[#E5E2E3]/40 mb-2">
                Modelo
              </label>
              {(() => {
                const modelOptions = VEHICLE_MODELS[form.brand] || [];
                if (modelOptions.length > 0) {
                  const isCustom = form.model && !modelOptions.includes(form.model);
                  return (
                    <>
                      <select
                        value={isCustom ? '__other__' : (form.model || '')}
                        onChange={(e) => {
                          if (e.target.value === '__other__') {
                            setForm((f) => ({ ...f, model: '' }));
                          } else {
                            setForm((f) => ({ ...f, model: e.target.value }));
                          }
                        }}
                        required={!isCustom}
                        className="w-full bg-[#1C1C1E] border border-[#E5E2E3]/10 rounded-lg px-4 py-3 text-[#E5E2E3] text-sm focus:border-[#D32F2F]/50 focus:outline-none appearance-none"
                      >
                        <option value="" disabled>Seleccionar modelo…</option>
                        {modelOptions.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                        <option value="__other__">Otro modelo…</option>
                      </select>
                      {isCustom && (
                        <input
                          value={form.model}
                          onChange={set('model')}
                          required
                          placeholder="Escribí el modelo"
                          className="w-full mt-2 bg-[#1C1C1E] border border-[#D32F2F]/40 rounded-lg px-4 py-3 text-[#E5E2E3] text-sm focus:border-[#D32F2F]/80 focus:outline-none"
                        />
                      )}
                    </>
                  );
                }
                return (
                  <input
                    value={form.model} onChange={set('model')} required placeholder="Ej: Corolla"
                    className="w-full bg-[#1C1C1E] border border-[#E5E2E3]/10 rounded-lg px-4 py-3 text-[#E5E2E3] text-sm focus:border-[#D32F2F]/50 focus:outline-none"
                  />
                );
              })()}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-[#E5E2E3]/40 mb-2">Año</label>
              <input
                type="number" value={form.year} onChange={set('year')} required min="1990" max="2030"
                className="w-full bg-[#1C1C1E] border border-[#E5E2E3]/10 rounded-lg px-4 py-3 text-[#E5E2E3] text-sm focus:border-[#D32F2F]/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-[#E5E2E3]/40 mb-2">
                Precio (USD)
              </label>
              <input
                type="number" value={form.price} onChange={set('price')} required min="0" placeholder="145900"
                className="w-full bg-[#1C1C1E] border border-[#E5E2E3]/10 rounded-lg px-4 py-3 text-[#E5E2E3] text-sm focus:border-[#D32F2F]/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-[#E5E2E3]/40 mb-2">
                Kilometraje
              </label>
              <input
                type="number" value={form.mileage} onChange={set('mileage')} required min="0" placeholder="0"
                className="w-full bg-[#1C1C1E] border border-[#E5E2E3]/10 rounded-lg px-4 py-3 text-[#E5E2E3] text-sm focus:border-[#D32F2F]/50 focus:outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-[#E5E2E3]/40 mb-2">
                Transmisión
              </label>
              <select
                value={form.transmission} onChange={set('transmission')}
                className="w-full bg-[#1C1C1E] border border-[#E5E2E3]/10 rounded-lg px-4 py-3 text-[#E5E2E3] text-sm focus:border-[#D32F2F]/50 focus:outline-none"
              >
                {TRANSMISSIONS.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-[#E5E2E3]/40 mb-2">
                Combustible
              </label>
              <select
                value={form.fuel} onChange={set('fuel')}
                className="w-full bg-[#1C1C1E] border border-[#E5E2E3]/10 rounded-lg px-4 py-3 text-[#E5E2E3] text-sm focus:border-[#D32F2F]/50 focus:outline-none"
              >
                {FUELS.map((f) => <option key={f}>{f}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-[#E5E2E3]/40 mb-2">
              Tipo de Carrocería
            </label>
            <select
              value={form.bodyType} onChange={set('bodyType')}
              className="w-full bg-[#1C1C1E] border border-[#E5E2E3]/10 rounded-lg px-4 py-3 text-[#E5E2E3] text-sm focus:border-[#D32F2F]/50 focus:outline-none"
            >
              {BODY_TYPES.map((b) => <option key={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-[#E5E2E3]/40 mb-2">
              Descripción
            </label>
            <textarea
              value={form.description} onChange={set('description')} rows={3}
              placeholder="Descripción del vehículo..."
              className="w-full bg-[#1C1C1E] border border-[#E5E2E3]/10 rounded-lg px-4 py-3 text-[#E5E2E3] text-sm focus:border-[#D32F2F]/50 focus:outline-none resize-none"
            />
          </div>
          {/* Existing images */}
          {isEdit && existingUrls.length > 0 && (
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-[#E5E2E3]/40 mb-2">
                Imágenes actuales ({existingUrls.length})
              </label>
              <div className="flex flex-wrap gap-2">
                {existingUrls.map((url) => (
                  <div key={url} className="relative group/img w-20 h-14 rounded-lg overflow-hidden border border-[#E5E2E3]/10">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      disabled={removingUrl === url}
                      onClick={async () => {
                        setRemovingUrl(url);
                        try {
                          await removeVehicleImage(vehicle.brand, vehicle.id, url);
                          setExistingUrls((prev) => prev.filter((u) => u !== url));
                        } catch {}
                        setRemovingUrl(null);
                      }}
                      className="absolute inset-0 bg-black/60 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity"
                    >
                      <span className="material-symbols-outlined text-red-400 !text-lg">
                        {removingUrl === url ? 'hourglass_empty' : 'delete'}
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex-1">
              {(() => {
                const MAX = 10;
                const slots = MAX - existingUrls.length;
                const atLimit = slots <= 0;
                return (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#E5E2E3]/40">
                        {isEdit ? 'Agregar imágenes' : 'Imágenes'}
                      </label>
                      <span className={`text-[10px] font-bold tabular-nums ${
                        atLimit ? 'text-red-400' : existingUrls.length >= 8 ? 'text-yellow-400' : 'text-[#E5E2E3]/30'
                      }`}>
                        {existingUrls.length + imageFiles.length} / {MAX}
                      </span>
                    </div>
                    {atLimit ? (
                      <p className="text-yellow-400/70 text-[11px] font-semibold">
                        Límite de {MAX} imágenes alcanzado. Eliminá alguna para agregar más.
                      </p>
                    ) : (
                      <>
                        <input
                          type="file" accept="image/jpeg,image/png,image/webp" multiple
                          disabled={atLimit}
                          onChange={(e) => {
                            const picked = Array.from(e.target.files).slice(0, slots);
                            setImageFiles(picked);
                          }}
                          className="text-[#E5E2E3]/40 text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-xs file:bg-[#D32F2F]/20 file:text-[#FFB3AC] hover:file:bg-[#D32F2F]/30 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        />
                        <p className="text-[#E5E2E3]/20 text-[10px] mt-1">
                          {imageFiles.length > 0
                            ? `${imageFiles.length} archivo${imageFiles.length > 1 ? 's' : ''} seleccionado${imageFiles.length > 1 ? 's' : ''}`
                            : `Hasta ${slots} imagen${slots !== 1 ? 'es' : ''} más (máx. ${MAX} en total)`
                          }
                        </p>
                      </>
                    )}
                  </>
                );
              })()}
            </div>
            {/* Sucursal */}
          {dealerships && dealerships.length > 1 && (
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-[#E5E2E3]/40 mb-2">
                Sucursal
              </label>
              <select
                value={selectedDealershipId}
                onChange={(e) => setSelectedDealershipId(e.target.value)}
                className="w-full bg-[#1C1C1E] border border-[#E5E2E3]/10 rounded-lg px-4 py-3 text-[#E5E2E3] text-sm focus:border-[#D32F2F]/50 focus:outline-none appearance-none"
              >
                {dealerships.map((d) => (
                  <option key={d.id} value={d.id}>{d.name} — {d.city}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#E5E2E3]/40">
                Disponible
              </span>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, isAvailable: !f.isAvailable }))}
                className={`relative inline-flex w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                  form.isAvailable ? 'bg-[#D32F2F]' : 'bg-[#E5E2E3]/10'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    form.isAvailable ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button
              type="button" onClick={onClose}
              className="flex-1 py-3 border border-[#E5E2E3]/10 text-[#E5E2E3]/50 rounded-lg text-sm font-semibold hover:border-[#E5E2E3]/20 hover:text-[#E5E2E3] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit" disabled={saving}
              className="flex-1 py-3 bg-[#D32F2F] text-white rounded-lg text-sm font-semibold hover:bg-[#B71C1C] transition-colors disabled:opacity-50"
            >
              {saving ? 'Guardando...' : isEdit ? 'Guardar Cambios' : 'Crear Vehículo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Fleet Tab ────────────────────────────────────────────────────────────────
const FleetTab = ({ vehicles, dealershipId, dealerships, onRefresh }) => {
  const dealershipMap = useMemo(
    () => Object.fromEntries((dealerships || []).map((d) => [d.id, d])),
    [dealerships]
  );
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [filterAvail, setFilterAvail] = useState('all');

  const filtered = vehicles.filter((v) => {
    const q = search.toLowerCase();
    const matchSearch = !q || `${v.brand} ${v.model}`.toLowerCase().includes(q);
    const matchAvail =
      filterAvail === 'all' ||
      (filterAvail === 'available' && v.isAvailable) ||
      (filterAvail === 'reserved' && !v.isAvailable);
    return matchSearch && matchAvail;
  });

  const openNew = () => { setEditingVehicle(null); setShowModal(true); };
  const openEdit = (v) => { setEditingVehicle(v); setShowModal(true); };
  const closeModal = () => setShowModal(false);

  const handleDelete = async (v) => {
    if (!window.confirm(`¿Eliminar ${v.brand} ${v.model}? Esta acción no se puede deshacer.`)) return;
    setDeleting(v.id);
    try {
      await deleteVehicle(v.brand, v.id);
      onRefresh();
    } finally {
      setDeleting(null);
    }
  };

  return (
    <>
      {showModal && (
        <VehicleModal
          vehicle={editingVehicle}
          dealershipId={dealershipId}
          dealerships={dealerships}
          onClose={closeModal}
          onSaved={() => { closeModal(); onRefresh(); }}
        />
      )}
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-headline font-extrabold text-[#E5E2E3] tracking-tighter uppercase">
              Mi Flota
            </h1>
            <p className="text-[#E5E2E3]/30 text-sm mt-1">{vehicles.length} unidades en total</p>
          </div>
          <button
            onClick={openNew}
            className="bg-[#D32F2F] text-white px-5 py-3 rounded-lg font-headline font-black text-[11px] uppercase tracking-[0.15em] hover:bg-[#B71C1C] transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined !text-base">add</span> Nueva Unidad
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#E5E2E3]/30 !text-lg">
              search
            </span>
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por marca o modelo..."
              className="w-full bg-[#1C1C1E] border border-[#E5E2E3]/10 rounded-lg pl-11 pr-4 py-3 text-[#E5E2E3] text-sm focus:border-[#D32F2F]/50 focus:outline-none"
            />
          </div>
          {['all', 'available', 'reserved'].map((f) => (
            <button
              key={f}
              onClick={() => setFilterAvail(f)}
              className={`px-4 py-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${
                filterAvail === f
                  ? 'bg-[#D32F2F]/20 text-[#FFB3AC] border border-[#D32F2F]/30'
                  : 'bg-[#1C1C1E] text-[#E5E2E3]/40 border border-[#E5E2E3]/10 hover:border-[#E5E2E3]/20 hover:text-[#E5E2E3]/60'
              }`}
            >
              {f === 'all' ? 'Todos' : f === 'available' ? 'Disponibles' : 'Reservados'}
            </button>
          ))}
        </div>

        {/* Vehicle list */}
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center py-16 bg-[#1C1C1E] border border-[#E5E2E3]/10 rounded-lg">
              <span className="material-symbols-outlined text-5xl text-[#E5E2E3]/10">search_off</span>
              <p className="text-[#E5E2E3]/30 mt-3 text-sm">No se encontraron vehículos</p>
            </div>
          ) : (
            filtered.map((v) => (
              <div
                key={v.id}
                className="bg-[#1C1C1E] border border-[#E5E2E3]/10 rounded-lg p-4 flex items-center gap-5 hover:border-[#E5E2E3]/20 transition-colors"
              >
                <div className="w-24 h-16 rounded-lg overflow-hidden bg-[#0E0E0F] flex-shrink-0">
                  {v.imageUrl ? (
                    <img src={v.imageUrl} alt={v.model} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="material-symbols-outlined text-[#E5E2E3]/10 !text-3xl">
                        directions_car
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-[#E5E2E3] font-headline font-bold tracking-tight">
                      {v.brand} {v.model}
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase flex-shrink-0 ${
                        v.isAvailable
                          ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                          : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                      }`}
                    >
                      {v.isAvailable ? 'Disponible' : 'Reservado'}
                    </span>
                  </div>
                  <div className="flex gap-4 mt-1 text-xs text-[#E5E2E3]/30 flex-wrap">
                    <span>{v.year}</span>
                    <span>{Number(v.mileage).toLocaleString()} km</span>
                    <span>{v.transmission}</span>
                    <span>{v.fuel}</span>
                    {v.bodyType && <span>{v.bodyType}</span>}
                    {dealerships && dealerships.length > 1 && dealershipMap[v.dealershipId] && (
                      <span className="flex items-center gap-1 text-[#D32F2F]/60">
                        <span className="material-symbols-outlined !text-[11px]">store</span>
                        {dealershipMap[v.dealershipId].name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className="flex items-center gap-1 text-[#E5E2E3]/25 text-[11px]">
                      <span className="material-symbols-outlined !text-[12px]">visibility</span>
                      {v.viewCount || 0} vistas
                    </span>
                    <span className="flex items-center gap-1 text-[#E5E2E3]/25 text-[11px]">
                      <span className="material-symbols-outlined !text-[12px]">forum</span>
                      {v.leadCount || 0} leads
                    </span>
                    <span className="flex items-center gap-1 text-[#E5E2E3]/25 text-[11px]">
                      <span className="material-symbols-outlined !text-[12px]">share</span>
                      {v.shareCount || 0}
                    </span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[#D32F2F] font-headline font-black text-lg">{fmt(v.price)}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => openEdit(v)}
                    className="p-2.5 bg-[#E5E2E3]/5 text-[#E5E2E3]/40 rounded-lg hover:bg-[#D32F2F]/20 hover:text-[#D32F2F] transition-colors"
                  >
                    <span className="material-symbols-outlined !text-lg">edit</span>
                  </button>
                  <button
                    onClick={() => handleDelete(v)}
                    disabled={deleting === v.id}
                    className="p-2.5 bg-[#E5E2E3]/5 text-[#E5E2E3]/40 rounded-lg hover:bg-red-500/20 hover:text-red-400 transition-colors disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined !text-lg">delete</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
};

// ─── Sucursales Tab ───────────────────────────────────────────────────────────
const SucursalesTab = ({ dealerships, onCreated }) => {
  const EMPTY = { name: '', address: '', city: '', country: '', phone: '', email: '', latitude: '', longitude: '' };
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    if (!form.name.trim() || !form.city.trim() || !form.country.trim()) {
      setError('Nombre, ciudad y país son obligatorios.');
      return;
    }
    setSaving(true);
    try {
      await createDealership({
        name: form.name.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        country: form.country.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        latitude: parseFloat(form.latitude) || 0,
        longitude: parseFloat(form.longitude) || 0,
      });
      setForm(EMPTY);
      setSuccess(true);
      onCreated();
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError('Error al crear la sucursal. Verificá los datos.');
    } finally {
      setSaving(false);
    }
  };

  const Field = ({ label, k, type = 'text', placeholder = '' }) => (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-widest text-[#E5E2E3]/40 mb-1">{label}</label>
      <input
        type={type}
        value={form[k]}
        onChange={set(k)}
        placeholder={placeholder}
        className="w-full bg-[#1C1C1E] border border-[#E5E2E3]/10 rounded-sm px-4 py-3 text-sm text-[#E5E2E3] placeholder-[#E5E2E3]/20 focus:outline-none focus:border-[#D32F2F]/50 transition-colors"
      />
    </div>
  );

  return (
    <div className="space-y-10 max-w-4xl">
      <div>
        <h1 className="text-3xl font-headline font-extrabold text-[#E5E2E3] tracking-tighter uppercase">Sucursales</h1>
        <p className="text-[#E5E2E3]/30 text-sm mt-1">{dealerships.length} sucursal{dealerships.length !== 1 ? 'es' : ''} registrada{dealerships.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Listado */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {dealerships.map((d) => (
          <div key={d.id} className="bg-[#1C1C1E] border border-[#E5E2E3]/10 rounded-sm p-5 flex gap-4 items-start">
            <div className="w-10 h-10 bg-[#D32F2F]/10 rounded-sm flex items-center justify-center flex-shrink-0">
              {d.logoUrl
                ? <img src={d.logoUrl} alt={d.name} className="w-9 h-9 object-cover rounded-sm" />
                : <span className="material-symbols-outlined text-[#D32F2F]">store</span>
              }
            </div>
            <div className="min-w-0">
              <div className="text-[#E5E2E3] font-bold text-sm truncate">{d.name}</div>
              <div className="text-[#E5E2E3]/40 text-xs mt-0.5">{d.address && `${d.address}, `}{d.city}, {d.country}</div>
              {d.phone && <div className="text-[#E5E2E3]/30 text-xs mt-0.5">{d.phone}</div>}
            </div>
          </div>
        ))}
      </div>

      {/* Formulario nueva sucursal */}
      <div className="bg-[#1C1C1E] border border-[#E5E2E3]/10 rounded-sm p-8">
        <h2 className="text-lg font-headline font-bold text-[#E5E2E3] tracking-tight mb-6">+ Nueva Sucursal</h2>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="Nombre *" k="name" placeholder="Ej: Sucursal Centro" />
            <Field label="Ciudad *" k="city" placeholder="Ej: Montevideo" />
            <Field label="País *" k="country" placeholder="Ej: Uruguay" />
            <Field label="Dirección" k="address" placeholder="Ej: Av. 18 de Julio 1234" />
            <Field label="Teléfono" k="phone" placeholder="Ej: +598 99 123 456" />
            <Field label="Email" k="email" type="email" placeholder="Ej: sucursal@automotora.com" />
            <Field label="Latitud" k="latitude" type="number" placeholder="Ej: -34.9011" />
            <Field label="Longitud" k="longitude" type="number" placeholder="Ej: -56.1645" />
          </div>
          {error && (
            <p className="text-red-400 text-sm flex items-center gap-2">
              <span className="material-symbols-outlined !text-base">error</span>{error}
            </p>
          )}
          {success && (
            <p className="text-green-400 text-sm flex items-center gap-2">
              <span className="material-symbols-outlined !text-base">check_circle</span>
              Sucursal creada correctamente
            </p>
          )}
          <button
            type="submit" disabled={saving}
            className="w-full py-3 bg-[#D32F2F] text-white rounded-sm font-headline font-black text-[11px] uppercase tracking-[0.2em] hover:bg-[#B71C1C] transition-colors disabled:opacity-50"
          >
            {saving ? 'Creando...' : 'Crear Sucursal'}
          </button>
        </form>
      </div>
    </div>
  );
};

// ─── Config Tab ───────────────────────────────────────────────────────────────
const ConfigTab = ({ dealership, onUpdated }) => {
  const [form, setForm] = useState({
    name: dealership.name, address: dealership.address, city: dealership.city,
    country: dealership.country, phone: dealership.phone, email: dealership.email,
    latitude: dealership.latitude ?? 0, longitude: dealership.longitude ?? 0,
  });
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(dealership.logoUrl || null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    setLogoFile(file);
    if (file) setLogoPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    setError('');
    try {
      await updateDealership(dealership.id, form);
      if (logoFile) await uploadDealershipLogo(dealership.id, logoFile);
      setSuccess(true);
      setLogoFile(null);
      onUpdated();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    'w-full bg-[#141415] border border-[#E5E2E3]/10 rounded-lg px-4 py-3 text-[#E5E2E3] text-sm focus:border-[#D32F2F]/50 focus:outline-none';
  const labelCls =
    'block text-[10px] font-bold uppercase tracking-[0.15em] text-[#E5E2E3]/40 mb-2';

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-3xl font-headline font-extrabold text-[#E5E2E3] tracking-tighter uppercase">
        Configuración
      </h1>

      {/* Logo card */}
      <div className="bg-[#1C1C1E] border border-[#E5E2E3]/10 rounded-lg p-6 flex items-center gap-6">
        <div className="w-20 h-20 rounded-xl bg-[#0E0E0F] border border-[#E5E2E3]/10 flex items-center justify-center overflow-hidden flex-shrink-0">
          {logoPreview ? (
            <img src={logoPreview} alt="Logo" className="w-full h-full object-cover" />
          ) : (
            <span className="material-symbols-outlined text-[#E5E2E3]/20 !text-3xl">garage</span>
          )}
        </div>
        <div>
          <p className="text-[#E5E2E3] font-semibold text-sm">{form.name}</p>
          <p className="text-[#E5E2E3]/30 text-xs mb-3">
            {form.city}, {form.country}
          </p>
          <label className="cursor-pointer text-xs font-semibold text-[#D32F2F] hover:text-[#FF5252] transition-colors">
            Cambiar logo
            <input
              type="file" accept="image/jpeg,image/png,image/webp"
              onChange={handleLogoChange} className="hidden"
            />
          </label>
          {logoFile && (
            <p className="text-[#E5E2E3]/30 text-xs mt-1">
              {logoFile.name} · Se guardará al confirmar
            </p>
          )}
        </div>
      </div>

      {/* Info form */}
      <form onSubmit={handleSubmit} className="bg-[#1C1C1E] border border-[#E5E2E3]/10 rounded-lg p-6 space-y-5">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#E5E2E3]/40">
          Información general
        </h3>
        <div>
          <label className={labelCls}>Nombre</label>
          <input value={form.name} onChange={set('name')} required className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Dirección</label>
          <input value={form.address} onChange={set('address')} required className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Ciudad</label>
            <input value={form.city} onChange={set('city')} required className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>País</label>
            <input value={form.country} onChange={set('country')} required className={inputCls} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Teléfono</label>
            <input value={form.phone} onChange={set('phone')} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input type="email" value={form.email} onChange={set('email')} className={inputCls} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Latitud</label>
            <input type="number" step="0.0001" value={form.latitude} onChange={set('latitude')} placeholder="48.8371" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Longitud</label>
            <input type="number" step="0.0001" value={form.longitude} onChange={set('longitude')} placeholder="9.1559" className={inputCls} />
          </div>
        </div>
        <p className="text-[#E5E2E3]/20 text-[10px]">Las coordenadas se usan para mostrar la automotora en el mapa. Podés obtenerlas desde Google Maps.</p>

        {error && <p className="text-red-400 text-sm">{error}</p>}
        {success && (
          <p className="text-green-400 text-sm flex items-center gap-2">
            <span className="material-symbols-outlined !text-base">check_circle</span>
            Cambios guardados correctamente
          </p>
        )}
        <button
          type="submit" disabled={saving}
          className="w-full py-3 bg-[#D32F2F] text-white rounded-lg font-bold text-sm uppercase tracking-widest hover:bg-[#B71C1C] transition-colors disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      </form>
    </div>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────
const AdminDashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dealerships, setDealerships] = useState([]);
  const [selectedId, setSelectedId] = useState(
    () => localStorage.getItem('adminDealershipId') || ''
  );
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);

  const currentDealership = dealerships.find((d) => d.id === selectedId) || null;

  const loadDealerships = useCallback(async () => {
    try {
      const data = await getDealerships();
      setDealerships(data);
    } catch {}
  }, []);

  const loadVehicles = useCallback(async () => {
    if (!selectedId) return;
    setLoading(true);
    try {
      const all = await getVehicles();
      setVehicles(all.filter((v) => v.dealershipId === selectedId));
    } catch {
      setVehicles([]);
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => { loadDealerships(); }, [loadDealerships]);
  useEffect(() => { if (selectedId) loadVehicles(); else setLoading(false); }, [selectedId, loadVehicles]);

  const handleSelectDealership = (id) => {
    localStorage.setItem('adminDealershipId', id);
    setSelectedId(id);
    setActiveTab('dashboard');
  };

  const handleLogout = () => {
    localStorage.removeItem('adminDealershipId');
    setSelectedId('');
    setVehicles([]);
    setActiveTab('dashboard');
  };

  // Loading screen
  if (loading && !selectedId) {
    return (
      <div className="min-h-screen bg-[#0E0E0F] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#D32F2F] border-t-transparent" />
      </div>
    );
  }

  // Dealership selector
  if (!selectedId || !currentDealership) {
    return (
      dealerships.length === 0 ? (
        <div className="min-h-screen bg-[#0E0E0F] flex items-center justify-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#D32F2F] border-t-transparent" />
        </div>
      ) : (
        <DealershipSelector dealerships={dealerships} onSelect={handleSelectDealership} />
      )
    );
  }

  return (
    <div className="bg-[#0E0E0F] font-body text-[#E5E2E3] antialiased flex min-h-screen">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        dealership={currentDealership}
        onChangeDealership={handleLogout}
        onLogout={() => navigate('/login')}
      />
      <main className="ml-64 flex-1 p-10 min-w-0">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#D32F2F] border-t-transparent" />
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <DashboardTab vehicles={vehicles} dealership={currentDealership} />
            )}
            {activeTab === 'fleet' && (
              <FleetTab vehicles={vehicles} dealershipId={selectedId} dealerships={dealerships} onRefresh={loadVehicles} />
            )}
            {activeTab === 'sucursales' && (
              <SucursalesTab dealerships={dealerships} onCreated={loadDealerships} />
            )}
            {activeTab === 'config' && (
              <ConfigTab dealership={currentDealership} onUpdated={loadDealerships} />
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default AdminDashboard;
