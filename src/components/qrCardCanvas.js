import QRCode from 'qrcode';
import logoRedAutos from '../assets/Logo1.svg';
import { qrText } from './qrCardData';

export const QR_CARD_WIDTH = 1200;
export const QR_IMAGE_SIZE = 864;
const CONTENT_WIDTH = QR_CARD_WIDTH - 192;
const MAX_CARD_HEIGHT = 8192;
export const FALLBACK_QR_FONTS = { heading: 'Arial, sans-serif', body: 'Arial, sans-serif' };

const splitQrWord = (word, maxWidth, measure) => {
  const parts = [];
  let part = '';
  for (const character of Array.from(word)) {
    if (measure(character) > maxWidth) throw new Error('Un carácter excede el ancho de la tarjeta.');
    if (part && measure(part + character) > maxWidth) {
      parts.push(part);
      part = '';
    }
    part += character;
  }
  if (part) parts.push(part);
  return parts;
};

// Split long tokens as well as ordinary words; never shrink or silently truncate text.
export const wrapQrText = (value, maxWidth, measure) => {
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) throw new Error('El ancho del texto debe ser positivo.');
  const text = qrText(value);
  if (!text) return [];
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    const parts = splitQrWord(word, maxWidth, measure);
    line = parts.pop() || '';
    lines.push(...parts);
  }
  if (line) lines.push(line);
  return lines;
};

// All vertical positions and the canvas height come from these measured blocks.
export const layoutQrCard = (card, measure, fonts = FALLBACK_QR_FONTS) => {
  const texts = [];
  const logo = { y: 56, width: 400, height: 86 };
  let y = logo.y + logo.height + 32;
  const addText = (text, font, lineHeight, color, maxWidth = CONTENT_WIDTH) => {
    const lines = wrapQrText(text, maxWidth, (line) => measure(line, font));
    const block = { lines, font, lineHeight, color, maxWidth, y, height: lines.length * lineHeight };
    texts.push(block);
    y += block.height;
    return block;
  };

  y += 18;
  const badgeText = addText(qrText(card.badge, 'REDAUTOS'), `700 28px ${fonts.heading}`, 38, '#52525b', CONTENT_WIDTH - 64);
  const badgeWidth = Math.max(180, badgeText.lines.reduce((width, line) => Math.max(width, measure(line, badgeText.font)), 0) + 64);
  const badge = { x: (QR_CARD_WIDTH - badgeWidth) / 2, y: badgeText.y - 18, width: badgeWidth, height: badgeText.height + 36 };
  y += 18 + 36;

  const qr = { x: (QR_CARD_WIDTH - QR_IMAGE_SIZE) / 2, y: y + 16, size: QR_IMAGE_SIZE };
  y += QR_IMAGE_SIZE + 32 + 42;
  addText(qrText(card.title, 'Publicación'), `800 52px ${fonts.heading}`, 68, '#141414');
  y += 16;
  addText(card.details, `600 32px ${fonts.body}`, 44, '#52525b');
  if (qrText(card.reference)) {
    y += 14;
    addText(card.reference, '700 26px "Courier New", monospace', 36, '#B7102A');
  }
  y += 32;
  const separatorY = y;
  y += 30;
  addText(qrText(card.caption, 'ESCANEÁ PARA VER LA PUBLICACIÓN'), `700 26px ${fonts.heading}`, 36, '#52525b');
  y += 12;
  addText(qrText(card.url, 'Enlace no disponible'), `600 24px ${fonts.body}`, 34, '#52525b');
  const height = Math.ceil(y + 50);
  // Fail visibly instead of exceeding mobile canvas limits or clipping long data.
  if (height > MAX_CARD_HEIGHT) throw new Error('Los datos son demasiado extensos para una tarjeta QR.');
  return { width: QR_CARD_WIDTH, height, logo, badge, qr, texts, separatorY };
};

export const loadQrFonts = async (fontSet, sample = 'RedAutos') => {
  if (!fontSet || typeof fontSet.load !== 'function') return FALLBACK_QR_FONTS;
  let timer;
  try {
    const loadedFonts = (async () => {
      const [heading, label, body] = await Promise.all([
        '800 52px Manrope',
        '700 28px Manrope',
        '600 32px Inter',
      ].map((font) => Promise.resolve().then(() => fontSet.load(font, sample))));
      await fontSet.ready;
      return {
        heading: heading?.length && label?.length ? 'Manrope, Arial, sans-serif' : FALLBACK_QR_FONTS.heading,
        body: body?.length ? 'Inter, Arial, sans-serif' : FALLBACK_QR_FONTS.body,
      };
    })();
    return await Promise.race([
      loadedFonts,
      new Promise((resolve) => { timer = setTimeout(() => resolve(FALLBACK_QR_FONTS), 4000); }),
    ]);
  } catch {
    return FALLBACK_QR_FONTS;
  } finally {
    clearTimeout(timer);
  }
};

const loadCardImage = (src, label) => new Promise((resolve, reject) => {
  const image = new Image();
  const finish = (error) => {
    clearTimeout(timer);
    image.onload = null;
    image.onerror = null;
    if (error) reject(new Error(`No se pudo cargar ${label}.`));
    else resolve(image);
  };
  const timer = setTimeout(() => finish(true), 15000);
  image.onload = () => finish(!image.naturalWidth || !image.naturalHeight);
  image.onerror = () => finish(true);
  try {
    image.crossOrigin = 'anonymous';
    image.src = src;
  } catch {
    finish(true);
  }
});

const roundedRect = (ctx, x, y, width, height, radius) => {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
};

// This is the only card renderer. Preview, PNG download and print reuse its PNG.
export const renderQrCard = async (card) => {
  if (!card.url) throw new Error('El enlace público no está disponible.');
  const [fonts, logo, qrDataUrl] = await Promise.all([
    loadQrFonts(document.fonts, [card.badge, card.title, card.details, card.caption, card.url].join(' ')),
    loadCardImage(logoRedAutos, 'el logotipo de RedAutos'),
    Promise.resolve().then(() => QRCode.toDataURL(card.url, {
      width: QR_IMAGE_SIZE,
      margin: 4,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#FFFFFF' },
    })),
  ]);
  const qrImage = await loadCardImage(qrDataUrl, 'el código QR');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('El navegador no permite crear la tarjeta.');
  const layout = layoutQrCard(card, (text, font) => {
    ctx.font = font;
    return ctx.measureText(text).width;
  }, fonts);
  canvas.width = layout.width;
  canvas.height = layout.height;

  // Opaque white corners as well as the card itself: no gray/transparent print fill.
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  roundedRect(ctx, 2, 2, canvas.width - 4, canvas.height - 4, 36);
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.save();
  ctx.clip();
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
  gradient.addColorStop(0, '#B7102A');
  gradient.addColorStop(1, '#DB313F');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, 18);
  ctx.restore();

  const logoScale = Math.min(layout.logo.width / logo.naturalWidth, layout.logo.height / logo.naturalHeight);
  const logoWidth = logo.naturalWidth * logoScale;
  const logoHeight = logo.naturalHeight * logoScale;
  ctx.drawImage(logo, (canvas.width - logoWidth) / 2, layout.logo.y + (layout.logo.height - logoHeight) / 2, logoWidth, logoHeight);
  roundedRect(ctx, layout.badge.x, layout.badge.y, layout.badge.width, layout.badge.height, 28);
  ctx.fillStyle = '#f3f4f6';
  ctx.fill();

  const { x, y, size } = layout.qr;
  roundedRect(ctx, x - 16, y - 16, size + 32, size + 32, 28);
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 2;
  ctx.stroke();
  // No resampling: preserve black modules and the four-module white quiet zone.
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qrImage, x, y, size, size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const block of layout.texts) {
    ctx.font = block.font;
    ctx.fillStyle = block.color;
    block.lines.forEach((line, index) => ctx.fillText(line, canvas.width / 2, block.y + index * block.lineHeight));
  }
  ctx.beginPath();
  ctx.moveTo(192, layout.separatorY);
  ctx.lineTo(canvas.width - 192, layout.separatorY);
  ctx.strokeStyle = '#e5e7eb';
  ctx.stroke();

  const dataUrl = canvas.toDataURL('image/png');
  if (!dataUrl.startsWith('data:image/png;base64,')) throw new Error('No se pudo exportar la tarjeta como PNG.');
  return { dataUrl, width: canvas.width, height: canvas.height };
};