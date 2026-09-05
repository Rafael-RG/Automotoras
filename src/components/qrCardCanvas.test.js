import { vi } from 'vitest';
import { FALLBACK_QR_FONTS, layoutQrCard, loadQrFonts, QR_CARD_WIDTH, QR_IMAGE_SIZE, wrapQrText } from './qrCardCanvas';

const jest = vi;

const monospace = (text) => Array.from(text).length * 10;
const measure = (text, font) => Array.from(text).length * Number(/(\d+)px/.exec(font)[1]) * 0.6;
const card = {
  badge: 'Automotora de Prueba',
  title: 'Marca Modelo',
  details: 'Año: 2026',
  reference: 'REF. #AB12CD34',
  caption: 'ESCANEÁ PARA VER ESTE VEHÍCULO',
  url: 'https://catalog.example/product/Marca/ab12cd34',
};

describe('QR text and canvas dimensions (no canvas or scanning dependency)', () => {
  test.each([undefined, null, '', ' \n\t ', {}])('handles empty text (%s)', (text) => {
    expect(wrapQrText(text, 50, monospace)).toEqual([]);
  });

  test('wraps words, collapses whitespace and allows exact fits', () => {
    expect(wrapQrText('  Red\n Autos   Uno ', 50, monospace)).toEqual(['Red', 'Autos', 'Uno']);
    expect(wrapQrText('ABCDE', 50, monospace)).toEqual(['ABCDE']);
    expect(wrapQrText(12345, 50, monospace)).toEqual(['12345']);
  });

  test('splits long tokens without clipping or splitting surrogate pairs', () => {
    expect(wrapQrText('ABCDEFGHIJKL', 50, monospace)).toEqual(['ABCDE', 'FGHIJ', 'KL']);
    expect(wrapQrText('🚗é🚙ñ', 20, monospace)).toEqual(['🚗é', '🚙ñ']);
  });

  test('rejects unusable dimensions instead of looping or drawing outside the card', () => {
    expect(() => wrapQrText('X', 0, monospace)).toThrow();
    expect(() => wrapQrText('X', 5, monospace)).toThrow();
  });

  test('grows only by the measured additional text lines and preserves the large QR', () => {
    const normal = layoutQrCard(card, measure);
    const long = layoutQrCard({ ...card, badge: 'Automotora de Prueba '.repeat(12), title: 'Modelo extendido '.repeat(14), details: 'Dirección larga sin recortar '.repeat(12), url: `${card.url}/${'X'.repeat(300)}` }, measure);
    expect(long.width).toBe(QR_CARD_WIDTH);
    expect(QR_CARD_WIDTH).toBeGreaterThanOrEqual(1200);
    expect(long.qr.size).toBe(QR_IMAGE_SIZE);
    expect(QR_IMAGE_SIZE).toBeGreaterThanOrEqual(600);
    expect(long.height).toBeGreaterThan(normal.height);
    const textHeight = (layout) => layout.texts.reduce((sum, block) => sum + block.height, 0);
    expect(long.height - normal.height).toBe(textHeight(long) - textHeight(normal));
    expect(long.badge.x).toBeGreaterThanOrEqual(0);
    expect(long.badge.x + long.badge.width).toBeLessThanOrEqual(long.width);
    expect(long.qr.y).toBeGreaterThan(long.badge.y + long.badge.height);
    expect(long.texts[1].y).toBeGreaterThan(long.qr.y + long.qr.size);
    long.texts.forEach((block, index) => {
      expect(block.y + block.height).toBeLessThanOrEqual(long.height - 50);
      block.lines.forEach((line) => expect(measure(line, block.font)).toBeLessThanOrEqual(block.maxWidth));
      if (index > 0) expect(block.y).toBeGreaterThanOrEqual(long.texts[index - 1].y + long.texts[index - 1].height);
    });
  });

  test('supports empty display fields and explicitly rejects excessive canvas height', () => {
    const empty = layoutQrCard({}, measure);
    expect(empty.height).toBeGreaterThan(empty.qr.size);
    expect(empty.texts.flatMap((block) => block.lines)).toContain('Publicación');
    expect(() => layoutQrCard({ ...card, details: 'A'.repeat(30000) }, measure)).toThrow(/demasiado extensos/);
  });
});

describe('QR font loading', () => {
  test('uses a fixed local fallback if the font API is unavailable or rejects', async () => {
    expect(await loadQrFonts(undefined)).toEqual(FALLBACK_QR_FONTS);
    expect(await loadQrFonts({ load: () => Promise.reject(new Error('offline')) })).toEqual(FALLBACK_QR_FONTS);
    expect(await loadQrFonts({ load: () => Promise.resolve([]), ready: Promise.resolve() })).toEqual(FALLBACK_QR_FONTS);
  });

  test('awaits all font weights and readiness before returning the rendering families', async () => {
    let finish;
    let completed = false;
    const fontSet = { load: jest.fn().mockResolvedValue([{}]), ready: new Promise((resolve) => { finish = resolve; }) };
    const pending = loadQrFonts(fontSet, 'Nombre con acentos áéí').then((fonts) => { completed = true; return fonts; });
    await Promise.resolve();
    expect(completed).toBe(false);
    expect(fontSet.load).toHaveBeenCalledTimes(3);
    expect(fontSet.load).toHaveBeenCalledWith('800 52px Manrope', 'Nombre con acentos áéí');
    finish();
    expect(await pending).toEqual({ heading: 'Manrope, Arial, sans-serif', body: 'Inter, Arial, sans-serif' });
  });

  test('times out to a stable fallback and handles a subsequent font rejection', async () => {
    jest.useFakeTimers();
    try {
      let fail;
      const loading = new Promise((resolve, reject) => { fail = reject; });
      const pending = loadQrFonts({ load: () => loading });
      jest.advanceTimersByTime(4000);
      expect(await pending).toEqual(FALLBACK_QR_FONTS);
      fail(new Error('late font failure'));
      await Promise.resolve();
    } finally {
      jest.useRealTimers();
    }
  });
});
