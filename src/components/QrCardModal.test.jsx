import React, { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { vi } from 'vitest';
import VehicleQrModal from './VehicleQrModal';
import DealershipQrModal from './DealershipQrModal';
import { renderQrCard } from './qrCardCanvas';

const jest = vi;
vi.mock('./qrCardCanvas', () => ({ renderQrCard: vi.fn() }));

// Synthetic data URLs: JSDOM load events are explicit, never real images or records.
const firstPng = { dataUrl: 'data:image/png;base64,cXItY2FyZC0x', width: 1200, height: 1600 };
const nextPng = { ...firstPng, dataUrl: 'data:image/png;base64,cXItY2FyZC0y' };
const vehicle = { brand: 'Marca Prueba', model: 'Modelo Uno', year: 2026, id: 'ab12cd34' };
const dealership = { id: 'sucursal-demo', name: 'Automotora de Prueba', address: 'Calle 123', city: 'Ciudad' };
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
};
const button = (text, scope = document) => Array.from(scope.querySelectorAll('button')).find((element) => element.textContent === text);
const click = async (element) => { await act(async () => { Simulate.click(element); }); };
const markLoaded = (scope = document) => {
  const image = scope.querySelector('.qr-card-image');
  expect(image).not.toBeNull();
  act(() => { Simulate.load(image); });
  return image;
};

describe('shared QR dialog', () => {
  let root;
  let host;
  let opener;
  let onClose;
  let savedBodyStyle;
  let savedActEnvironment;
  const mount = async (ui) => { await act(async () => { root.render(ui); }); };
  const modal = (props = {}) => <VehicleQrModal vehicle={vehicle} dealership={dealership} onClose={onClose} {...props} />;

  beforeEach(() => {
    savedBodyStyle = document.body.style.cssText;
    savedActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubEnv('VITE_PUBLIC_URL', 'https://catalog.example');
    document.body.style.setProperty('overflow', 'scroll', 'important');
    opener = document.createElement('button');
    opener.textContent = 'Abrir QR';
    host = document.createElement('div');
    document.body.append(opener, host);
    opener.focus();
    root = createRoot(host);
    onClose = jest.fn();
    renderQrCard.mockReset().mockResolvedValue(firstPng);
    jest.spyOn(window, 'print').mockImplementation(() => {});
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    host.remove();
    opener.remove();
    document.body.style.cssText = savedBodyStyle;
    vi.unstubAllEnvs();
    globalThis.IS_REACT_ACT_ENVIRONMENT = savedActEnvironment;
    jest.restoreAllMocks();
  });

  test('portals to body, names the dialog and image, traps/restores focus and restores scroll', async () => {
    await mount(modal());
    const portal = document.querySelector('.qr-modal-portal');
    const dialog = portal.querySelector('dialog');
    const close = dialog.querySelector('[aria-label="Cerrar código QR"]');
    expect(portal.parentElement).toBe(document.body);
    expect(host.querySelector('dialog')).toBeNull();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')).textContent).toBe('Código QR del vehículo');
    expect(document.activeElement).toBe(close);
    expect(document.body.style.overflow).toBe('hidden');
    expect(button('Descargar tarjeta (PNG)').disabled).toBe(true);
    expect(button('Imprimir').disabled).toBe(true);
    const image = markLoaded();
    expect(image.alt).toContain('Automotora de Prueba');
    expect(image.alt).toContain('Marca Prueba Modelo Uno');
    expect(image.alt).toContain('Año: 2026');
    expect(image.alt).toContain('REF. #AB12CD34');
    act(() => { Simulate.keyDown(close, { key: 'Tab', shiftKey: true }); });
    expect(document.activeElement).toBe(button('Imprimir'));
    act(() => { Simulate.keyDown(button('Imprimir'), { key: 'Tab' }); });
    expect(document.activeElement).toBe(close);
    act(() => { opener.focus(); });
    expect(document.activeElement).toBe(close);
    act(() => { Simulate.keyDown(close, { key: 'Escape' }); });
    expect(onClose).toHaveBeenCalledTimes(1);
    await mount(null);
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe('scroll');
    expect(document.body.style.getPropertyPriority('overflow')).toBe('important');
  });

  test('downloads the exact preview PNG with its filename and prints it without regenerating', async () => {
    let download;
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function captureDownload() {
      download = { href: this.href, filename: this.download };
    });
    await mount(modal());
    const image = markLoaded();
    await click(button('Descargar tarjeta (PNG)'));
    expect(download).toEqual({ href: image.src, filename: 'qr-marca-prueba-ab12cd34.png' });
    expect(document.querySelector('a[download]')).toBeNull();
    await click(button('Imprimir'));
    expect(window.print).toHaveBeenCalledTimes(1);
    expect(document.body.classList.contains('qr-printing')).toBe(true);
    expect(document.querySelector('.qr-modal-print-active .qr-card-image').src).toBe(image.src);
    expect(renderQrCard).toHaveBeenCalledTimes(1);
    // Returning from print() alone must not clear an asynchronous print dialog.
    await act(async () => { await Promise.resolve(); });
    expect(document.body.classList.contains('qr-printing')).toBe(true);
    act(() => { window.dispatchEvent(new Event('afterprint')); });
    expect(document.body.classList.contains('qr-printing')).toBe(false);
    expect(button('Imprimir').disabled).toBe(false);
  });

  test('scopes Ctrl+P only to an open, loaded modal and cleans listeners and classes on close', async () => {
    await mount(modal());
    act(() => { window.dispatchEvent(new Event('beforeprint')); });
    expect(document.body.classList.contains('qr-printing')).toBe(false);
    markLoaded();
    act(() => { window.dispatchEvent(new Event('beforeprint')); });
    expect(document.querySelectorAll('.qr-modal-print-active')).toHaveLength(1);
    await mount(null);
    expect(document.body.classList.contains('qr-printing')).toBe(false);
    act(() => { window.dispatchEvent(new Event('beforeprint')); });
    expect(document.body.classList.contains('qr-printing')).toBe(false);
    expect(document.querySelector('.qr-modal-portal')).toBeNull();
  });

  test('keeps the current print image frozen even if parent data changes before afterprint', async () => {
    await mount(modal());
    markLoaded();
    await click(button('Imprimir'));
    renderQrCard.mockResolvedValueOnce(nextPng);
    await mount(modal({ vehicle: { ...vehicle, id: 'next-id', model: 'Modelo Dos' } }));
    expect(document.querySelector('.qr-card-image').src).toBe(firstPng.dataUrl);
    expect(document.querySelector('.qr-card-image').alt).toContain('Modelo Uno');
    act(() => { window.dispatchEvent(new Event('afterprint')); });
    expect(document.querySelector('.qr-card-image').src).toBe(nextPng.dataUrl);
    expect(document.querySelector('.qr-card-image').alt).toContain('Modelo Dos');
    expect(document.body.classList.contains('qr-printing')).toBe(false);
  });

  test('surfaces generation and image failures with retry rather than unhandled rejections', async () => {
    renderQrCard.mockRejectedValueOnce(new Error('PNG export failed'));
    await mount(modal());
    expect(document.querySelector('[role="alert"]').textContent).toContain('No se pudo generar');
    expect(button('Imprimir').disabled).toBe(true);
    await click(button('Reintentar generación'));
    act(() => { Simulate.error(document.querySelector('.qr-card-image')); });
    expect(document.querySelector('[role="alert"]').textContent).toContain('No se pudo mostrar');
    await click(button('Reintentar generación'));
    markLoaded();
    expect(button('Imprimir').disabled).toBe(false);
    expect(renderQrCard).toHaveBeenCalledTimes(3);
  });

  test('exposes download busy/error state and allows retrying the same PNG', async () => {
    const pending = deferred();
    await mount(modal());
    const image = markLoaded();
    const decode = jest.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(undefined);
    Object.defineProperty(image, 'decode', { value: decode });
    const anchorClick = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    act(() => { Simulate.click(button('Descargar tarjeta (PNG)')); });
    expect(button('Descargando…').disabled).toBe(true);
    expect(button('Imprimir').disabled).toBe(true);
    await act(async () => { pending.reject(new Error('decode failed')); });
    expect(document.querySelector('[role="alert"]').textContent).toContain('No se pudo descargar');
    await click(button('Descargar tarjeta (PNG)'));
    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(renderQrCard).toHaveBeenCalledTimes(1);
    expect(button('Descargar tarjeta (PNG)').disabled).toBe(false);
  });

  test('cleans the print scope when print throws and permits retry', async () => {
    window.print.mockImplementationOnce(() => { throw new Error('unavailable'); });
    await mount(modal());
    markLoaded();
    await click(button('Imprimir'));
    expect(document.body.classList.contains('qr-printing')).toBe(false);
    expect(document.querySelector('[role="alert"]').textContent).toContain('No se pudo abrir');
    expect(button('Imprimir').disabled).toBe(false);
  });

  test('ignores stale results when changing vehicles and settlements after unmount', async () => {
    const old = deferred();
    renderQrCard.mockReturnValueOnce(old.promise).mockResolvedValueOnce(nextPng);
    await mount(modal());
    await mount(modal({ vehicle: { ...vehicle, id: 'next-id' } }));
    markLoaded();
    await act(async () => { old.resolve(firstPng); });
    expect(document.querySelector('.qr-card-image').src).toBe(nextPng.dataUrl);
    expect(document.querySelector('.qr-card-image').alt).toContain('/next-id');
    const afterClose = deferred();
    renderQrCard.mockReturnValueOnce(afterClose.promise);
    await mount(modal({ vehicle: { ...vehicle, id: 'closed-id' } }));
    await mount(null);
    await act(async () => { afterClose.reject(new Error('late failure')); });
    expect(document.querySelector('.qr-modal-portal')).toBeNull();
    expect(document.body.classList.contains('qr-printing')).toBe(false);
  });

  test('keeps IDs unique, prints only the top QR portal and restores nested scroll locks in StrictMode', async () => {
    const tree = (showVehicle) => (
      <StrictMode>
        {showVehicle && <VehicleQrModal key="vehicle" vehicle={vehicle} dealership={dealership} onClose={onClose} />}
        <DealershipQrModal key="dealership" dealership={dealership} onClose={onClose} />
      </StrictMode>
    );
    await mount(tree(true));
    const portals = Array.from(document.querySelectorAll('.qr-modal-portal'));
    const labels = portals.map((portal) => portal.querySelector('dialog').getAttribute('aria-labelledby'));
    expect(new Set(labels).size).toBe(2);
    portals.forEach(markLoaded);
    act(() => { window.dispatchEvent(new Event('beforeprint')); });
    expect(portals[0].classList.contains('qr-modal-print-active')).toBe(false);
    expect(portals[1].classList.contains('qr-modal-print-active')).toBe(true);
    expect(portals[1].querySelector('.qr-card-image').alt).toContain('Calle 123, Ciudad');
    await mount(tree(false));
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body.classList.contains('qr-printing')).toBe(true);
    await mount(null);
    expect(document.body.style.overflow).toBe('scroll');
    expect(document.body.classList.contains('qr-printing')).toBe(false);
  });
});
