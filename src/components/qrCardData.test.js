import { dealershipQrCard, qrText, resolveQrCard, vehicleQrCard } from './qrCardData';

const origin = 'http://localhost:3000';
const vehicle = { brand: 'Marca/Prueba & Cía', model: 'Modelo Uno', year: 2026, id: 'id /?#' };

describe('QR public destinations and display data', () => {
  test('uses the configured HTTP(S) origin with the existing root routes and encoded segments', () => {
    const card = resolveQrCard(vehicleQrCard(vehicle, 'Automotora de Prueba'), 'https://catalog.example/admin?x=1#hash', origin);
    expect(card.url).toBe('https://catalog.example/product/Marca%2FPrueba%20%26%20C%C3%ADa/id%20%2F%3F%23');
    expect(card.error).toBe('');
    expect(card.warning).toBe('');
    expect(card.badge).toBe('Automotora de Prueba');
    expect(card.alt).toContain('RedAutos');
    expect(card.alt).toContain('Año: 2026');
    expect(card.alt).toContain(card.url);
  });

  test.each([undefined, null, '', '  '])('uses the actual current origin when configuration is empty (%s)', (configured) => {
    const card = resolveQrCard(dealershipQrCard({ id: 'sucursal 1' }), configured, origin);
    expect(card.url).toBe(`${origin}/dealerships/sucursal%201`);
    expect(card.warning).toBe('');
  });

  test.each(['/relative', '//catalog.example', 'not a URL', 'javascript:alert(1)', 'ftp://catalog.example', 'https://user:password@catalog.example'])('falls back visibly for invalid configuration (%s)', (configured) => {
    const card = resolveQrCard(dealershipQrCard({ id: 'demo' }), configured, origin);
    expect(card.url).toBe(`${origin}/dealerships/demo`);
    expect(card.warning).toContain('VITE_PUBLIC_URL');
    expect(card.warning).toContain('origen actual');
  });

  test('accepts an HTTP public URL and port rather than hardcoding production', () => {
    const card = resolveQrCard(dealershipQrCard({ id: 'demo' }), 'http://catalog.example:8080/', origin);
    expect(card.url).toBe('http://catalog.example:8080/dealerships/demo');
  });

  test('fails closed without an HTTP(S) origin or the existing route identifiers', () => {
    expect(resolveQrCard(dealershipQrCard({ id: 'demo' }), '', 'null').error).toMatch(/origen/);
    for (const invalidCard of [vehicleQrCard(), vehicleQrCard({ id: 'demo' }), dealershipQrCard(), vehicleQrCard({ brand: '..', id: 'demo' }), vehicleQrCard({ brand: '\uD800', id: 'demo' })]) {
      const card = resolveQrCard(invalidCard, '', origin);
      expect(card.url).toBe('');
      expect(card.error).toMatch(/identificadores/);
    }
  });

  test('provides readable fallbacks and accepts numeric identifiers without slice errors', () => {
    const card = vehicleQrCard({ brand: 'Prueba', id: 123456789 });
    expect(card.badge).toBe('Automotora no informada');
    expect(card.title).toBe('Prueba Modelo no informado');
    expect(card.details).toBe('Año: no informado');
    expect(card.reference).toBe('REF. #12345678');
    expect(card.path).toBe('/product/Prueba/123456789');
    expect(dealershipQrCard({ id: 0 }).path).toBe('/dealerships/0');
    expect(dealershipQrCard().details).toBe('Dirección no informada');
  });

  test('uses dealership name and address, not a dealership logo or object stringification', () => {
    const card = dealershipQrCard({ id: 'demo', name: ' Sucursal\nPrueba ', address: 'Calle 123', city: 'Ciudad', country: null, logoUrl: 'https://unused.example/logo.png' });
    expect(card.title).toBe('Sucursal Prueba');
    expect(card.details).toBe('Calle 123, Ciudad');
    expect(JSON.stringify(card)).not.toContain('logo.png');
    expect(qrText({ name: 'invalid' }, 'Sin datos')).toBe('Sin datos');
    expect(qrText(0)).toBe('0');
    expect(qrText(Number.NaN)).toBe('');
  });

  test('creates filesystem-safe PNG filenames for both cards', () => {
    expect(vehicleQrCard({ brand: 'Citroën / DS', id: 'ab12-cd34' }).filename).toBe('qr-citroen-ds-ab12-cd34.png');
    expect(dealershipQrCard({ id: 'ab12-cd34' }).filename).toBe('qr-sucursal-ab12-cd34.png');
    expect(vehicleQrCard(vehicle).filename).toMatch(/^qr-[a-z0-9-]+\.png$/);
  });
});
