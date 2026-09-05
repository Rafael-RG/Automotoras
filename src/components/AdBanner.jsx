import React, { useEffect, useState } from 'react';
import { getActiveAds } from '../services/api';
import { safeExternalUrl } from '../services/safeExternalUrl';

/**
 * Franja de banner publicitario pago. Se auto-oculta (no renderiza nada) si no hay
 * banners activos, para no dejar un hueco vacío en el layout. Si hay más de uno,
 * rota automáticamente cada 6s. Usa las variables CSS de tema (--bg-card, --border,
 * --fg, --fg-muted) definidas en src/index.css, igual que el resto de las pantallas
 * públicas (Inventory, DealershipFinder, etc.), por lo que respeta el tema claro/oscuro.
 */
const AdBanner = ({ className = '' }) => {
  const [ads, setAds] = useState([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let mounted = true;
    getActiveAds().then((data) => {
      if (mounted) setAds(Array.isArray(data) ? data : []);
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (ads.length < 2) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % ads.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [ads.length]);

  if (ads.length === 0) return null;

  const ad = ads[index % ads.length];
  if (!ad) return null;
  const linkUrl = safeExternalUrl(ad.linkUrl);

  return (
    <div
      className={`relative w-full rounded-2xl overflow-hidden ${className}`}
      style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}
    >
      {linkUrl ? (
      <a href={linkUrl} target="_blank" rel="noopener noreferrer sponsored" className="block w-full">
        <img
          src={ad.imageUrl}
          alt={ad.title || 'Publicidad'}
          className="w-full h-20 sm:h-28 object-cover"
        />
      </a>
      ) : (
        <div className="block w-full">
          <img
            src={ad.imageUrl}
            alt={ad.title || 'Publicidad'}
            className="w-full h-20 sm:h-28 object-cover"
          />
        </div>
      )}
      <span
        className="absolute top-1.5 left-1.5 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded"
        style={{ background: 'var(--bg)', color: 'var(--fg-muted)' }}
      >
        Publicidad
      </span>
      {ads.length > 1 && (
        <div className="absolute bottom-1.5 right-1.5 flex gap-1">
          {ads.map((_, i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full transition-all"
              style={{ background: i === index ? 'var(--fg)' : 'var(--border)' }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default AdBanner;
