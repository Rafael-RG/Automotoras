import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import logoRedAutos from '../assets/Logo1.svg';

/**
 * Modal para generar el código QR de un vehículo (Admin Dashboard).
 * El QR apunta a la ficha pública del auto (/product/:brand/:id) y se genera
 * 100% en el frontend (sin llamadas al backend, sin persistencia).
 * La tarjeta imprimible (#qr-print-card) siempre usa fondo blanco / QR negro,
 * independiente del tema claro/oscuro del panel, para garantizar buen escaneo
 * y una impresión prolija. La descarga (PNG) redibuja la misma tarjeta en un
 * <canvas> en alta resolución, para que el archivo descargado se vea igual
 * que la tarjeta impresa.
 */

const CARD_W = 720;
const CARD_H = 960;

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = src;
});

const roundRectPath = (ctx, x, y, w, h, r) => {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

const fitFontSize = (ctx, text, maxWidth, weight, family, startSize, minSize) => {
  let size = startSize;
  while (size > minSize) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
};

const VehicleQrModal = ({ vehicle, dealership, onClose }) => {
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const url = `${window.location.origin}/product/${encodeURIComponent(vehicle.brand)}/${vehicle.id}`;

  useEffect(() => {
    let mounted = true;
    QRCode.toDataURL(url, {
      width: 480,
      margin: 1,
      color: { dark: '#000000', light: '#FFFFFF' },
    }).then((dataUrl) => {
      if (mounted) setQrDataUrl(dataUrl);
    });
    return () => { mounted = false; };
  }, [url]);

  const buildCardCanvas = async () => {
    await document.fonts.ready;
    const [logoImg, qrImg] = await Promise.all([loadImage(logoRedAutos), loadImage(qrDataUrl)]);

    const canvas = document.createElement('canvas');
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    const ctx = canvas.getContext('2d');

    // Fondo + borde redondeado
    roundRectPath(ctx, 1, 1, CARD_W - 2, CARD_H - 2, 32);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Barra superior con degradé rojo, recortada a las esquinas redondeadas
    ctx.save();
    roundRectPath(ctx, 1, 1, CARD_W - 2, CARD_H - 2, 32);
    ctx.clip();
    const grad = ctx.createLinearGradient(0, 0, CARD_W, 0);
    grad.addColorStop(0, '#B7102A');
    grad.addColorStop(1, '#DB313F');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CARD_W, 14);
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    let y = 70;

    // Logo RedAutos
    const logoH = 46;
    const logoW = (logoImg.naturalWidth / logoImg.naturalHeight) * logoH;
    ctx.drawImage(logoImg, (CARD_W - logoW) / 2, y, logoW, logoH);
    y += logoH + 34;

    // Badge con nombre de la automotora
    if (dealership?.name) {
      const label = dealership.name.toUpperCase();
      ctx.font = '700 20px Manrope, sans-serif';
      const textW = ctx.measureText(label).width;
      const badgeW = Math.min(textW + 48, CARD_W - 96);
      const badgeH = 42;
      const badgeX = (CARD_W - badgeW) / 2;
      roundRectPath(ctx, badgeX, y, badgeW, badgeH, badgeH / 2);
      ctx.fillStyle = '#f3f4f6';
      ctx.fill();
      ctx.fillStyle = '#52525b';
      ctx.font = `700 ${fitFontSize(ctx, label, badgeW - 32, 700, 'Manrope, sans-serif', 20, 13)}px Manrope, sans-serif`;
      ctx.fillText(label, CARD_W / 2, y + badgeH / 2 + 7);
      y += badgeH + 40;
    }

    // Caja del QR
    const qrBox = 440;
    const qrBoxX = (CARD_W - qrBox) / 2;
    roundRectPath(ctx, qrBoxX, y, qrBox, qrBox, 24);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#f3f4f6';
    ctx.stroke();
    const qrPad = 28;
    ctx.drawImage(qrImg, qrBoxX + qrPad, y + qrPad, qrBox - qrPad * 2, qrBox - qrPad * 2);
    y += qrBox + 48;

    // Título del vehículo
    const title = `${vehicle.brand} ${vehicle.model}`;
    ctx.fillStyle = '#141414';
    const titleSize = fitFontSize(ctx, title, CARD_W - 96, 800, 'Manrope, sans-serif', 36, 22);
    ctx.font = `800 ${titleSize}px Manrope, sans-serif`;
    ctx.fillText(title, CARD_W / 2, y);
    y += 38;

    ctx.font = '600 22px Inter, sans-serif';
    ctx.fillStyle = '#71717a';
    ctx.fillText(`${vehicle.year}`, CARD_W / 2, y);
    y += 32;

    ctx.font = '700 18px "Courier New", monospace';
    ctx.fillStyle = '#D32F2F';
    ctx.fillText(`#${vehicle.id.slice(0, 8).toUpperCase()}`, CARD_W / 2, y);
    y += 44;

    // Separador
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(CARD_W * 0.18, y);
    ctx.lineTo(CARD_W * 0.82, y);
    ctx.stroke();
    y += 36;

    // Pie de tarjeta
    ctx.font = '700 15px Manrope, sans-serif';
    ctx.fillStyle = '#a1a1aa';
    ctx.fillText('ESCANEÁ PARA VER ESTE VEHÍCULO', CARD_W / 2, y);
    y += 24;
    ctx.font = '600 15px Inter, sans-serif';
    ctx.fillStyle = '#d4d4d8';
    ctx.fillText('redautos.com.uy', CARD_W / 2, y);

    return canvas;
  };

  const handleDownload = async () => {
    if (!qrDataUrl || downloading) return;
    setDownloading(true);
    try {
      const canvas = await buildCardCanvas();
      const pngUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = `qr-${vehicle.brand}-${vehicle.id}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white dark:bg-[#141415] border border-gray-200 dark:border-[#E5E2E3]/10 rounded-xl w-full max-w-sm">
        <div className="no-print flex items-center justify-between p-6 border-b border-gray-200 dark:border-[#E5E2E3]/10">
          <h2 className="text-xl font-headline font-black text-gray-900 dark:text-[#E5E2E3] uppercase tracking-tight">
            Código QR
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 dark:text-[#E5E2E3]/40 hover:text-gray-900 hover:dark:text-[#E5E2E3] transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Tarjeta imprimible — siempre blanca, independiente del tema */}
          <div
            id="qr-print-card"
            className="qr-print-only relative bg-white border border-gray-200 rounded-2xl overflow-hidden flex flex-col items-center gap-4 pt-8 pb-7 px-6"
          >
            <div className="absolute top-0 left-0 right-0 h-[5px] bg-gradient-to-r from-[#B7102A] to-[#DB313F]" />

            <img src={logoRedAutos} alt="RedAutos" className="h-8 object-contain" />

            {dealership?.name && (
              <span className="px-4 py-1.5 rounded-full bg-gray-100 text-[11px] font-bold uppercase tracking-wide text-gray-600">
                {dealership.name}
              </span>
            )}

            <div className="w-52 h-52 flex items-center justify-center bg-white border-2 border-gray-100 rounded-xl">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt={`QR ${vehicle.brand} ${vehicle.model}`} className="w-[85%] h-[85%]" />
              ) : (
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
              )}
            </div>

            <div className="text-center">
              <p className="font-headline font-extrabold text-[#141414] text-lg leading-tight">
                {vehicle.brand} {vehicle.model}
              </p>
              <p className="text-sm font-semibold text-[#71717a]">{vehicle.year}</p>
              <p className="font-mono text-[11px] font-bold text-[#D32F2F] mt-1">
                #{vehicle.id.slice(0, 8).toUpperCase()}
              </p>
            </div>

            <div className="w-full flex flex-col items-center gap-1 pt-3 border-t border-gray-100">
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#a1a1aa] text-center">
                Escaneá para ver este vehículo
              </p>
              <p className="text-[11px] font-semibold text-[#d4d4d8]">redautos.com.uy</p>
            </div>
          </div>

          <div className="no-print flex gap-3">
            <button
              type="button"
              onClick={handleDownload}
              disabled={!qrDataUrl || downloading}
              className="flex-1 py-3 border border-gray-200 dark:border-[#E5E2E3]/10 text-gray-500 dark:text-[#E5E2E3]/50 rounded-lg text-sm font-semibold hover:border-gray-200 hover:dark:border-[#E5E2E3]/20 hover:text-gray-900 hover:dark:text-[#E5E2E3] transition-colors disabled:opacity-50"
            >
              {downloading ? 'Generando…' : 'Descargar tarjeta (PNG)'}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={!qrDataUrl}
              className="flex-1 py-3 bg-[#D32F2F] text-white rounded-lg text-sm font-semibold hover:bg-[#B71C1C] transition-colors disabled:opacity-50"
            >
              Imprimir
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VehicleQrModal;
