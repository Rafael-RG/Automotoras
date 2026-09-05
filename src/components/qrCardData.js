// QR destinations deliberately retain the existing root-level public routes.
// Never substitute a hard-coded production hostname for the configured origin.
export const qrText = (value, fallback = '') => {
  const text = typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))
    ? String(value).replace(/\s+/g, ' ').trim()
    : '';
  return text || fallback;
};

const routeValue = (value) => (
  typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))
    ? String(value).trim()
    : ''
);

const publicPath = (prefix, values) => {
  const segments = values.map(routeValue);
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return '';
  try {
    return `/${prefix}/${segments.map(encodeURIComponent).join('/')}`;
  } catch {
    return ''; // Malformed Unicode must not crash the dialog or produce a different URL.
  }
};

const filenamePart = (value, fallback) => qrText(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80) || fallback;

export const vehicleQrCard = ({ brand, model, year, id } = {}, dealershipName) => ({
  dialogTitle: 'Código QR del vehículo',
  path: publicPath('product', [brand, id]),
  badge: qrText(dealershipName, 'Automotora no informada'),
  title: `${qrText(brand, 'Marca no informada')} ${qrText(model, 'Modelo no informado')}`,
  details: `Año: ${qrText(year, 'no informado')}`,
  reference: routeValue(id) ? `REF. #${qrText(id).slice(0, 8).toUpperCase()}` : 'Referencia no informada',
  caption: 'ESCANEÁ PARA VER ESTE VEHÍCULO',
  filename: `qr-${filenamePart(brand, 'vehiculo')}-${filenamePart(id, 'sin-referencia')}.png`,
});

export const dealershipQrCard = ({ name, address, city, country, id } = {}) => ({
  dialogTitle: 'Código QR de la sucursal',
  path: publicPath('dealerships', [id]),
  badge: 'SUCURSAL',
  title: qrText(name, 'Sucursal sin nombre'),
  details: [address, city, country].map((part) => qrText(part)).filter(Boolean).join(', ') || 'Dirección no informada',
  reference: '',
  caption: 'ESCANEÁ PARA VER ESTA SUCURSAL',
  filename: `qr-sucursal-${filenamePart(id, 'sin-referencia')}.png`,
});

const httpOrigin = (value) => {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value.trim())) return '';
  try {
    const url = new URL(value.trim());
    // Credentials do not belong in public QR links, even on an HTTP(S) URL.
    return url.hostname && !url.username && !url.password ? url.origin : '';
  } catch {
    return '';
  }
};

export const resolveQrCard = (card, configuredUrl, currentOrigin) => {
  const configuredOrigin = httpOrigin(configuredUrl);
  const origin = configuredOrigin || httpOrigin(currentOrigin);
  const warning = qrText(configuredUrl) && !configuredOrigin
    ? 'VITE_PUBLIC_URL no es una URL pública HTTP(S) válida. Se usa el origen actual; verificá el destino antes de imprimir.'
    : '';

  if (!origin || !card.path) {
    return {
      ...card,
      url: '',
      warning,
      error: !card.path
        ? 'No se puede crear el enlace público: faltan identificadores válidos (marca e ID del vehículo, o ID de la sucursal).'
        : 'No se pudo determinar un origen HTTP(S) válido para el enlace público.',
    };
  }

  const url = new URL(card.path, origin).href;
  const alt = ['RedAutos', card.badge, card.title, card.details, card.reference, card.caption, `Enlace público: ${url}`]
    .filter(Boolean)
    .join('. ');
  return { ...card, url, alt, warning, error: '' };
};
