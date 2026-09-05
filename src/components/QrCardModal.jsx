import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { renderQrCard } from './qrCardCanvas';
import { resolveQrCard } from './qrCardData';

const FOCUS_STYLE = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#141415]';
const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
let scrollLocks = 0;
let savedOverflow = [];

// Reference counting also restores correctly when two QR portals close out of order.
const lockScroll = () => {
  const style = document.body.style;
  if (scrollLocks === 0) {
    savedOverflow = ['overflow', 'overflow-x', 'overflow-y'].map((name) => [name, style.getPropertyValue(name), style.getPropertyPriority(name)]);
    style.setProperty('overflow', 'hidden');
  }
  scrollLocks += 1;
  return () => {
    scrollLocks -= 1;
    if (scrollLocks === 0) {
      savedOverflow.forEach(([name, value, priority]) => {
        if (value) style.setProperty(name, value, priority);
        else style.removeProperty(name);
      });
    }
  };
};

const isTopPortal = (portal) => {
  const portals = document.querySelectorAll('.qr-modal-portal');
  return portals.length > 0 && portals[portals.length - 1] === portal;
};

const startPrintScope = (portal) => {
  if (!portal || !isTopPortal(portal) || document.querySelector('.qr-modal-print-active')) return false;
  portal.classList.add('qr-modal-print-active');
  document.body.classList.add('qr-printing');
  return true;
};

const clearPrintScope = (portal) => {
  portal?.classList.remove('qr-modal-print-active');
  if (!document.querySelector('.qr-modal-print-active')) document.body.classList.remove('qr-printing');
};

const QrCardModal = ({ card, onClose }) => {
  const id = useId();
  const portalRef = useRef(null);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const imageRef = useRef(null);
  const readyCardRef = useRef(null);
  const downloadGuard = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [generation, setGeneration] = useState(null);
  const [loadedUrl, setLoadedUrl] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [printSnapshot, setPrintSnapshot] = useState(null);
  const resolvedCard = useMemo(
    () => resolveQrCard(card, import.meta.env.VITE_PUBLIC_URL, window.location.origin),
    [card],
  );
  // A previous request may finish later; it must never become the new vehicle's QR.
  const current = generation?.card === resolvedCard && generation?.attempt === attempt;
  const image = current ? generation.image : null;
  const error = resolvedCard.error || (current ? generation.error : '');
  const generating = !error && (!image || loadedUrl !== image.dataUrl);
  const ready = Boolean(image && !error && loadedUrl === image.dataUrl);
  readyCardRef.current = ready ? { ...image, alt: resolvedCard.alt, filename: resolvedCard.filename } : null;
  // Keep the exact already-loaded image even if parent data changes during async print.
  const shownImage = printSnapshot || (image && { ...image, alt: resolvedCard.alt });

  useEffect(() => {
    setActionError('');
    if (resolvedCard.error) return undefined;
    let cancelled = false;
    const generate = async () => {
      try {
        const result = await renderQrCard(resolvedCard);
        if (!cancelled) setGeneration({ card: resolvedCard, attempt, image: result, error: '' });
      } catch {
        if (!cancelled) {
          setGeneration({ card: resolvedCard, attempt, image: null, error: 'No se pudo generar la tarjeta. Revisá los datos y volvé a intentarlo.' });
        }
      }
    };
    void generate();
    return () => { cancelled = true; };
  }, [resolvedCard, attempt]);

  const beginPrint = useCallback(() => {
    if (!readyCardRef.current || !startPrintScope(portalRef.current)) return false;
    setPrintSnapshot(readyCardRef.current);
    return true;
  }, []);

  const endPrint = useCallback(() => {
    clearPrintScope(portalRef.current);
    setPrintSnapshot(null);
  }, []);

  useEffect(() => {
    const portal = portalRef.current;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const unlockScroll = lockScroll();
    closeRef.current?.focus({ preventScroll: true });
    const containFocus = (event) => {
      if (isTopPortal(portal) && !dialog.contains(event.target)) closeRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener('focusin', containFocus);
    window.addEventListener('beforeprint', beginPrint);
    window.addEventListener('afterprint', endPrint);
    return () => {
      document.removeEventListener('focusin', containFocus);
      window.removeEventListener('beforeprint', beginPrint);
      window.removeEventListener('afterprint', endPrint);
      clearPrintScope(portal);
      unlockScroll();
      if (previousFocus?.isConnected && typeof previousFocus.focus === 'function') previousFocus.focus({ preventScroll: true });
    };
  }, [beginPrint, endPrint]);

  const handleKeyDown = (event) => {
    if (!isTopPortal(portalRef.current)) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === 'Tab') {
      const elements = Array.from(dialogRef.current.querySelectorAll(FOCUSABLE)).filter((element) => element.tabIndex >= 0);
      const first = elements[0] || dialogRef.current;
      const last = elements.at(-1) || dialogRef.current;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === dialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || active === dialogRef.current)) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  const handleDownload = async () => {
    if (!ready || printSnapshot || downloadGuard.current) return;
    const portal = portalRef.current;
    const snapshot = readyCardRef.current;
    downloadGuard.current = true;
    setDownloading(true);
    setActionError('');
    let link;
    try {
      if (typeof imageRef.current?.decode === 'function') await imageRef.current.decode();
      if (!portal?.isConnected) return;
      link = document.createElement('a');
      link.href = snapshot.dataUrl;
      link.download = snapshot.filename;
      document.body.appendChild(link);
      link.click();
    } catch {
      if (portal?.isConnected) setActionError('No se pudo descargar el PNG. Volvé a intentar la descarga.');
    } finally {
      link?.remove();
      downloadGuard.current = false;
      if (portal?.isConnected) setDownloading(false);
    }
  };

  const handlePrint = () => {
    if (!ready || downloading || !beginPrint()) return;
    setActionError('');
    try {
      window.print();
      // Do not clear here: some browsers return before the print dialog closes.
    } catch {
      endPrint();
      setActionError('No se pudo abrir la impresión. Volvé a intentarlo.');
    }
  };

  const retry = () => {
    setActionError('');
    setLoadedUrl('');
    setAttempt((value) => value + 1);
  };

  return createPortal(
    <div ref={portalRef} className="qr-modal-portal fixed inset-0 z-[10000] flex items-center justify-center overflow-y-auto overscroll-contain bg-black/70 p-4">
      <dialog
        open
        ref={dialogRef}
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="qr-modal-dialog relative m-0 w-full max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto overscroll-contain rounded-2xl border border-gray-200 bg-white p-0 shadow-2xl dark:border-[#E5E2E3]/10 dark:bg-[#141415]"
        style={{ maxHeight: 'calc(100dvh - 2rem)' }}
      >
        <header className="qr-modal-controls flex items-center justify-between gap-3 border-b border-gray-200 p-4 dark:border-[#E5E2E3]/10">
          <h2 id={`${id}-title`} className="font-headline text-lg font-extrabold text-gray-900 dark:text-[#E5E2E3]">{resolvedCard.dialogTitle}</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Cerrar código QR" className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-2xl text-gray-600 hover:bg-gray-100 dark:text-[#E5E2E3] dark:hover:bg-white/10 ${FOCUS_STYLE}`}>
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="qr-modal-content space-y-4 p-4 sm:p-6">
          <p id={`${id}-description`} className="qr-modal-controls text-sm text-gray-600 dark:text-gray-300">
            Vista previa, descarga e impresión comparten la misma tarjeta. Verificá el destino antes de imprimir.
          </p>
          {resolvedCard.warning && <output className="qr-modal-controls block rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">{resolvedCard.warning}</output>}
          <figure className="qr-card-frame" aria-busy={generating && !printSnapshot}>
            {shownImage && (
              <img
                ref={imageRef}
                className="qr-card-image block h-auto w-full"
                src={shownImage.dataUrl}
                width={shownImage.width}
                height={shownImage.height}
                alt={shownImage.alt}
                onLoad={() => setLoadedUrl(shownImage.dataUrl)}
                onError={() => setGeneration((previous) => previous?.card === resolvedCard && previous?.attempt === attempt
                  && previous?.image?.dataUrl === shownImage.dataUrl
                  ? { ...previous, image: null, error: 'No se pudo mostrar la tarjeta PNG. Volvé a generarla.' }
                  : previous)}
              />
            )}
            {generating && !printSnapshot && <output className="qr-modal-controls block py-8 text-center text-sm text-gray-600 dark:text-gray-300">Generando tarjeta…</output>}
          </figure>
          {error && !printSnapshot && (
            <div className="qr-modal-controls space-y-3">
              <p role="alert" className="text-sm text-red-800 dark:text-red-200">{error}</p>
              {!resolvedCard.error && <button type="button" onClick={retry} className={`min-h-[44px] rounded-lg border border-red-200 px-4 text-sm font-semibold text-red-800 dark:text-red-200 ${FOCUS_STYLE}`}>Reintentar generación</button>}
            </div>
          )}
          {resolvedCard.url && (
            <p className="qr-modal-controls text-xs text-gray-600 dark:text-gray-300">
              Destino público del QR:<br />
              <a href={resolvedCard.url} target="_blank" rel="noopener noreferrer" className={`break-all text-red-800 underline dark:text-red-200 ${FOCUS_STYLE}`}>{resolvedCard.url}</a>
            </p>
          )}
          {actionError && <p role="alert" className="qr-modal-controls text-sm text-red-800 dark:text-red-200">{actionError}</p>}
          <div className="qr-modal-controls flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={handleDownload} disabled={!ready || downloading || Boolean(printSnapshot)} aria-busy={generating || downloading} className={`min-h-[44px] flex-1 rounded-lg border border-gray-300 px-3 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-white/5 ${FOCUS_STYLE}`}>
              {downloading ? 'Descargando…' : 'Descargar tarjeta (PNG)'}
            </button>
            <button type="button" onClick={handlePrint} disabled={!ready || downloading || Boolean(printSnapshot)} className={`min-h-[44px] flex-1 rounded-lg bg-[#D32F2F] px-3 py-3 text-sm font-semibold text-white hover:bg-[#B71C1C] disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_STYLE}`}>
              {printSnapshot ? 'Imprimiendo…' : 'Imprimir'}
            </button>
          </div>
        </div>
      </dialog>
    </div>,
    document.body,
  );
};

export default QrCardModal;
