// Solo fixtures ficticios y fetch simulado. No se accede a ningún servicio real.
import { vi } from 'vitest';

const jest = vi;

const authInfo = (overrides = {}) => ({
  accountId: 'owner-a',
  dealershipId: 'branch-a',
  name: 'Cuenta ficticia',
  email: 'cuenta@example.invalid',
  plan: 'basic',
  subscriptionStatus: 'authorized',
  isPlatformAdmin: false,
  csrfToken: 'csrf-memory-a',
  expiresAt: '2999-01-01T00:00:00Z',
  ...overrides,
});

const response = (data, status = 200) => {
  let text = '';
  if (data !== undefined) text = typeof data === 'string' ? data : JSON.stringify(data);
  return { ok: status >= 200 && status < 300, status, text: jest.fn().mockResolvedValue(text) };
};

const unauthorized = () => response({ error: 'Tu sesión venció.', code: 'SESSION_EXPIRED' }, 401);
const originalFetch = global.fetch;
let api;
let onExpired;
let onChanged;

beforeEach(async () => {
  jest.resetModules();
  global.fetch = jest.fn();
  localStorage.clear();
  sessionStorage.clear();
  api = await import('./api.js');
  onExpired = jest.fn();
  onChanged = jest.fn();
  window.addEventListener('redautos:session-expired', onExpired);
  window.addEventListener('redautos:session-changed', onChanged);
});

afterEach(() => {
  window.removeEventListener('redautos:session-expired', onExpired);
  window.removeEventListener('redautos:session-changed', onChanged);
  jest.restoreAllMocks();
  jest.useRealTimers();
  global.fetch = originalFetch;
});

describe('Catálogo público', () => {
  test('omite credenciales y no consulta /auth/me', async () => {
    fetch.mockResolvedValue(response([]));
    await Promise.all([
      api.getVehicles('Marca Uno'), api.getVehicleById('Marca Uno', 'vehicle-a'),
      api.getDealerships(), api.getDealershipById('branch-a'), api.getActiveAds(),
    ]);

    expect(fetch).toHaveBeenCalledTimes(5);
    expect(fetch.mock.calls[0][0]).toMatch(/\/vehicles\?brand=Marca%20Uno$/);
    for (const [url, options] of fetch.mock.calls) {
      expect(url).not.toContain('/auth/');
      expect(options.credentials).toBe('omit');
      expect(options.headers['X-CSRF-Token']).toBeUndefined();
    }
  });
});

test('bootstrap compartido entre solicitudes privadas concurrentes', async () => {
  let resolveMe;
  fetch.mockImplementationOnce(() => new Promise((resolve) => { resolveMe = resolve; }));
  fetch.mockResolvedValue(response([]));

  const dealerships = api.getAdminDealerships();
  const vehicles = api.getDealershipVehicles('branch-a');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toMatch(/\/auth\/me$/);
  expect(fetch.mock.calls[0][1]).toMatchObject({
    credentials: 'include', cache: 'no-store', method: 'GET',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'RedAutos' },
  });

  resolveMe(response(authInfo()));
  await Promise.all([dealerships, vehicles]);
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(fetch.mock.calls[1][0]).toMatch(/\/account\/dealerships$/);
  expect(fetch.mock.calls[2][0]).toMatch(/\/dealership\/branch-a\/vehicles$/);
  expect(fetch.mock.calls[2][1].credentials).toBe('include');
});

test('login anónimo incluye encabezados de auth y las escrituras usan CSRF en memoria', async () => {
  fetch.mockResolvedValueOnce(unauthorized())
    .mockResolvedValueOnce(response(authInfo()))
    .mockResolvedValueOnce(response({ id: 'vehicle-a' }, 201));
  const result = await api.loginDealership('cuenta@example.invalid', 'placeholder-only');

  expect(result).toMatchObject({ accountId: 'owner-a', dealershipId: 'branch-a' });
  expect(result).not.toHaveProperty('csrfToken');
  expect(fetch.mock.calls[1][0]).toMatch(/\/auth\/login$/);
  expect(fetch.mock.calls[1][1]).toMatchObject({
    method: 'POST', credentials: 'include', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'RedAutos' },
    body: JSON.stringify({ email: 'cuenta@example.invalid', password: 'placeholder-only' }),
  });
  expect(onChanged).toHaveBeenCalledTimes(1);
  expect(onChanged.mock.calls[0][0].detail).toBeNull();

  await api.createVehicle({ dealershipId: 'branch-a', brand: 'Marca Uno', model: 'Modelo' });
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(fetch.mock.calls[2][1]).toMatchObject({
    method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': 'csrf-memory-a' },
  });
});

test.each([
  ['registerDealership', '/auth/register', [{ name: 'Ficticia', email: 'cuenta@example.invalid' }]],
  ['forgotPassword', '/auth/forgot-password', ['cuenta@example.invalid']],
  ['resetPassword', '/auth/reset-password', ['reset-placeholder', 'new-placeholder']],
  ['resendVerification', '/auth/resend-verification', ['cuenta@example.invalid']],
])('%s recupera la sesión tras recargar y manda CSRF y encabezados JSON', async (name, path, args) => {
  fetch.mockResolvedValueOnce(response(authInfo())).mockResolvedValueOnce(response(undefined, 204));
  await api[name](...args);

  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[0][0]).toMatch(/\/auth\/me$/);
  expect(fetch.mock.calls[1][0]).toEqual(expect.stringContaining(path));
  expect(fetch.mock.calls[1][1]).toMatchObject({
    method: 'POST', credentials: 'include',
    headers: { 'X-Requested-With': 'RedAutos', 'Content-Type': 'application/json', 'X-CSRF-Token': 'csrf-memory-a' },
  });
});

test('auth pública puede continuar cuando /me devuelve 401', async () => {
  fetch.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(response({ message: 'Respuesta genérica.' }));
  await api.resendVerification('cuenta@example.invalid');
  expect(fetch.mock.calls[1][0]).toMatch(/\/auth\/resend-verification$/);
  expect(fetch.mock.calls[1][1].headers['X-CSRF-Token']).toBeUndefined();
  expect(fetch.mock.calls[1][1].credentials).toBe('include');
});

test('verify-email incluye encabezados de auth sin enviar CSRF en GET', async () => {
  fetch.mockResolvedValue(response(undefined, 204));
  await api.verifyEmail('placeholder + token');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toMatch(/\/auth\/verify-email\?token=placeholder%20%2B%20token$/);
  expect(fetch.mock.calls[0][1]).toMatchObject({
    method: 'GET', credentials: 'include',
    headers: { 'X-Requested-With': 'RedAutos', 'Content-Type': 'application/json' },
  });
});

test.each([200, 204])('acepta una respuesta %s vacía sin intentar JSON', async (status) => {
  const empty = response(undefined, status);
  fetch.mockResolvedValueOnce(response(authInfo())).mockResolvedValueOnce(empty);
  await expect(api.updateDealership('branch-a', { name: 'Sucursal' })).resolves.toBeNull();
  if (status === 204) expect(empty.text).not.toHaveBeenCalled();
});

test('acepta 200 solo con espacios', async () => {
  fetch.mockResolvedValueOnce(response(authInfo())).mockResolvedValueOnce(response('   '));
  await expect(api.deleteVehicle('Marca Uno', 'vehicle-a')).resolves.toBeNull();
});

test('ApiError expone mensaje español, status y code sin reintentar', async () => {
  fetch.mockResolvedValueOnce(response(authInfo()))
    .mockResolvedValueOnce(response({ error: 'La marca no puede modificarse.', code: 'BRAND_IMMUTABLE' }, 409));
  const err = await api.updateVehicle('Marca Uno', 'vehicle-a', { brand: 'Otra' }).catch((error) => error);
  expect(err).toBeInstanceOf(api.ApiError);
  expect(err).toMatchObject({ status: 409, code: 'BRAND_IMMUTABLE', message: 'La marca no puede modificarse.' });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(onExpired).not.toHaveBeenCalled();
});

test('un error sin JSON no muestra el cuerpo HTML del servidor', async () => {
  fetch.mockResolvedValue(response('<html>detalle interno</html>', 502));
  const err = await api.getDealerships().catch((error) => error);
  expect(err).toBeInstanceOf(api.ApiError);
  expect(err.status).toBe(502);
  expect(err.message).not.toContain('detalle interno');
});

test('401 borra preferencias y caché, emite expiración y no repite la escritura', async () => {
  fetch.mockResolvedValueOnce(response(authInfo())).mockResolvedValueOnce(unauthorized());
  await api.ensureSession();
  localStorage.setItem('adminDealershipId', 'branch-a');

  await expect(api.deleteVehicle('Marca Uno', 'vehicle-a')).rejects.toMatchObject({ status: 401, code: 'SESSION_EXPIRED' });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(onExpired).toHaveBeenCalledTimes(1);
  expect(onExpired.mock.calls[0][0].detail).toBeNull();
  expect(localStorage.getItem('adminDealershipId')).toBeNull();

  fetch.mockResolvedValueOnce(response(authInfo({ accountId: 'owner-b', csrfToken: 'csrf-memory-b' })))
    .mockResolvedValueOnce(response({ id: 'new-vehicle' }, 201));
  await api.createVehicle({ dealershipId: 'branch-b' });
  expect(fetch.mock.calls[2][0]).toMatch(/\/auth\/me$/);
  expect(fetch.mock.calls[3][1].headers['X-CSRF-Token']).toBe('csrf-memory-b');
  expect(fetch).toHaveBeenCalledTimes(4);
});

test('401 durante bootstrap impide enviar la escritura protegida', async () => {
  fetch.mockResolvedValueOnce(unauthorized());
  await expect(api.deleteAd('ad-a')).rejects.toMatchObject({ status: 401 });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(onExpired).toHaveBeenCalledTimes(1);
});

test('un fallo de red libera mePromise para un reintento explícito', async () => {
  fetch.mockRejectedValueOnce(new TypeError('Offline'))
    .mockResolvedValueOnce(response(authInfo())).mockResolvedValueOnce(response([]));
  await expect(api.getAdminDealerships()).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  await expect(api.getAdminDealerships()).resolves.toEqual([]);
  expect(fetch).toHaveBeenCalledTimes(3);
});

test('una escritura fallida por red no se reenvía automáticamente', async () => {
  fetch.mockResolvedValueOnce(response(authInfo())).mockRejectedValueOnce(new TypeError('Offline'));
  await expect(api.createVehicle({ dealershipId: 'branch-a' })).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[1][0]).toMatch(/\/vehicles$/);
});

test('un 403 de publicidad no convierte al usuario en administrador ni vence la sesión', async () => {
  fetch.mockResolvedValueOnce(response(authInfo()))
    .mockResolvedValueOnce(response({ error: 'Acceso denegado.', code: 'FORBIDDEN' }, 403));
  await expect(api.getAds()).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  await expect(api.ensureSession()).resolves.toMatchObject({ isPlatformAdmin: false });
  expect(onExpired).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledTimes(2);
});

test('la sesión incompleta no se conserva y no permite una escritura', async () => {
  fetch.mockResolvedValueOnce(response({ accountId: 'owner-a' }));
  await expect(api.createDealership({ name: 'Sucursal ficticia' })).rejects.toMatchObject({ code: 'INVALID_SESSION' });
  expect(fetch).toHaveBeenCalledTimes(1);
  fetch.mockResolvedValueOnce(response(authInfo()));
  await expect(api.ensureSession()).resolves.toMatchObject({ accountId: 'owner-a' });
  expect(fetch).toHaveBeenCalledTimes(2);
});

test('login nuevo elimina preferencia anterior y conserva el código de email no verificado', async () => {
  fetch.mockResolvedValueOnce(response(authInfo()));
  await api.ensureSession();
  localStorage.setItem('adminDealershipId', 'branch-a');
  fetch.mockResolvedValueOnce(response({ error: 'Verificá tu email para continuar.', code: 'EMAIL_NOT_VERIFIED' }, 403));
  await expect(api.loginDealership('otra@example.invalid', 'placeholder-only')).rejects.toMatchObject({ code: 'EMAIL_NOT_VERIFIED', status: 403 });
  expect(localStorage.getItem('adminDealershipId')).toBeNull();
  expect(fetch.mock.calls[1][1].headers['X-CSRF-Token']).toBe('csrf-memory-a');
  fetch.mockResolvedValueOnce(unauthorized());
  await expect(api.ensureSession()).rejects.toMatchObject({ status: 401 });
});

test('una escritura espera el /me pendiente y usa el token renovado', async () => {
  fetch.mockResolvedValueOnce(response(authInfo()));
  await api.ensureSession();
  let resolveMe;
  fetch.mockImplementationOnce(() => new Promise((resolve) => { resolveMe = resolve; }))
    .mockResolvedValueOnce(response(undefined, 204));

  const refresh = api.getSession();
  const write = api.updateVehicle('Marca Uno', 'vehicle-a', { price: 1000 });
  expect(fetch).toHaveBeenCalledTimes(2);
  resolveMe(response(authInfo({ csrfToken: 'csrf-renewed' })));
  await Promise.all([refresh, write]);
  expect(fetch.mock.calls[2][1].headers['X-CSRF-Token']).toBe('csrf-renewed');
});

test.each([200, 401])('una respuesta tardía %s de otra cuenta no modifica la sesión nueva', async (status) => {
  fetch.mockResolvedValueOnce(response(authInfo()));
  await api.ensureSession();
  let resolveOld;
  fetch.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
    .mockResolvedValueOnce(response(authInfo({ accountId: 'owner-b', csrfToken: 'csrf-memory-b' })));
  const oldRead = api.getDealershipVehicles('branch-a').catch((err) => err);
  await Promise.resolve(); // Dejar que el GET protegido llegue al fetch simulado.
  await api.loginDealership('otra@example.invalid', 'placeholder-only');
  resolveOld(status === 401 ? unauthorized() : response([{ id: 'old-vehicle' }]));
  await expect(oldRead).resolves.toMatchObject({ code: 'SESSION_CHANGED' });
  expect(onExpired).not.toHaveBeenCalled();
  await expect(api.ensureSession()).resolves.toMatchObject({ accountId: 'owner-b' });
  expect(fetch).toHaveBeenCalledTimes(3);
});

test('cambiar de cuenta mediante /me elimina la preferencia y bloquea una escritura ya pendiente', async () => {
  fetch.mockResolvedValueOnce(response(authInfo()));
  await api.ensureSession();
  localStorage.setItem('adminDealershipId', 'branch-a');
  let resolveMe;
  fetch.mockImplementationOnce(() => new Promise((resolve) => { resolveMe = resolve; }));
  const refreshed = api.getSession();
  const write = api.deleteVehicle('Marca Uno', 'vehicle-a').catch((err) => err);
  resolveMe(response(authInfo({ accountId: 'owner-b', dealershipId: 'branch-b', csrfToken: 'csrf-memory-b' })));
  await expect(refreshed).resolves.toMatchObject({ accountId: 'owner-b' });
  await expect(write).resolves.toMatchObject({ code: 'SESSION_CHANGED' });
  expect(localStorage.getItem('adminDealershipId')).toBeNull();
  expect(onChanged).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledTimes(2);
});

test('logout llama al servidor con CSRF y obliga a recuperar sesión después', async () => {
  fetch.mockResolvedValueOnce(response(authInfo())).mockResolvedValueOnce(response(undefined, 204));
  await api.ensureSession();
  localStorage.setItem('adminDealershipId', 'branch-a');
  await api.logoutDealership();
  expect(fetch.mock.calls[1][0]).toMatch(/\/auth\/logout$/);
  expect(fetch.mock.calls[1][1]).toMatchObject({
    method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': 'csrf-memory-a', 'X-Requested-With': 'RedAutos' },
  });
  expect(localStorage.getItem('adminDealershipId')).toBeNull();
  fetch.mockResolvedValueOnce(unauthorized());
  await expect(api.ensureSession()).rejects.toMatchObject({ status: 401 });
  expect(fetch.mock.calls[2][0]).toMatch(/\/auth\/me$/);
});

test('logout con fallo borra cachés pero informa que no se confirmó la revocación', async () => {
  fetch.mockResolvedValueOnce(response(authInfo())).mockRejectedValueOnce(new TypeError('Offline'));
  await api.ensureSession();
  localStorage.setItem('adminDealershipId', 'branch-a');
  await expect(api.logoutDealership()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  expect(localStorage.getItem('adminDealershipId')).toBeNull();
  fetch.mockResolvedValueOnce(response(authInfo())).mockResolvedValueOnce(response(undefined, 204));
  await api.logoutDealership();
  expect(fetch.mock.calls[2][0]).toMatch(/\/auth\/me$/);
  expect(fetch.mock.calls[3][0]).toMatch(/\/auth\/logout$/);
});

test('limpia la antigua clave al importar sin leerla ni persistir secretos nuevos', async () => {
  jest.resetModules();
  localStorage.setItem('adsAdminKey', 'legacy-placeholder');
  const readStorage = jest.spyOn(Storage.prototype, 'getItem');
  const writeStorage = jest.spyOn(Storage.prototype, 'setItem');
  const removeStorage = jest.spyOn(Storage.prototype, 'removeItem');
  api = await import('./api.js');
  expect(removeStorage).toHaveBeenCalledWith('adsAdminKey');
  expect(readStorage).not.toHaveBeenCalled();
  fetch.mockResolvedValueOnce(response(authInfo())).mockResolvedValueOnce(response(authInfo({ csrfToken: 'new-csrf' })));
  const session = await api.ensureSession();
  const loggedIn = await api.loginDealership('cuenta@example.invalid', 'placeholder-only');
  expect(session).not.toHaveProperty('csrfToken');
  expect(loggedIn).not.toHaveProperty('csrfToken');
  expect(writeStorage).not.toHaveBeenCalled();
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
});

test('subida temporal incluye dealershipId y deja el boundary multipart al navegador', async () => {
  const file = new File(['fake-image'], 'vehicle.png', { type: 'image/png' });
  fetch.mockResolvedValueOnce(response(authInfo())).mockResolvedValueOnce(response({ url: 'https://example.invalid/image.png' }));
  await api.uploadTempVehicleImage(file, 'branch-a');
  const [url, options] = fetch.mock.calls[1];
  expect(url).toMatch(/\/vehicles\/images\/temp$/);
  expect(Array.from(options.body.keys())).toEqual(['dealershipId', 'file']);
  expect(options.body.get('file')).toBe(file);
  expect(options.body.get('dealershipId')).toBe('branch-a');
  expect(options.credentials).toBe('include');
  expect(options.headers['X-CSRF-Token']).toBe('csrf-memory-a');
  expect(options.headers['Content-Type']).toBeUndefined();
});

test('no sube temporales sin sucursal', async () => {
  await expect(api.uploadTempVehicleImage(new File([], 'empty.png'))).rejects.toMatchObject({ code: 'DEALERSHIP_REQUIRED' });
  expect(fetch).not.toHaveBeenCalled();
});

test('verifySubscription usa POST autenticado, no GET', async () => {
  fetch.mockResolvedValueOnce(response(authInfo())).mockResolvedValueOnce(response({ status: 'pending' }));
  await expect(api.verifySubscription('branch-a')).resolves.toEqual({ status: 'pending' });
  expect(fetch.mock.calls[1][0]).toMatch(/\/subscriptions\/verify\/branch-a$/);
  expect(fetch.mock.calls[1][1]).toMatchObject({
    method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': 'csrf-memory-a' },
  });
});

test('publicidad ignora argumentos de clave obsoletos y usa la sesión', async () => {
  fetch.mockResolvedValueOnce(response(authInfo({ isPlatformAdmin: true })))
    .mockResolvedValueOnce(response([])).mockResolvedValueOnce(response(undefined, 204));
  await api.getAds('ignored-placeholder');
  await api.deleteAd('ad-a', 'ignored-placeholder');
  for (const [, options] of fetch.mock.calls) {
    expect(options.credentials).toBe('include');
    expect(options.headers['X-Admin-Key']).toBeUndefined();
    expect(options.headers.Cookie).toBeUndefined();
    expect(options.headers.Authorization).toBeUndefined();
  }
  expect(fetch.mock.calls[2][1].headers['X-CSRF-Token']).toBe('csrf-memory-a');
});

test('una lectura pública con sesión conocida sigue omitiendo credenciales', async () => {
  fetch.mockResolvedValueOnce(response(authInfo())).mockResolvedValueOnce(response([]));
  await api.ensureSession();
  await api.getVehicles();
  expect(fetch.mock.calls[1][1].credentials).toBe('omit');
  expect(fetch.mock.calls[1][1].headers['X-CSRF-Token']).toBeUndefined();
});

test('timeout aborta la solicitud y permite volver a intentar sin bucles', async () => {
  jest.useFakeTimers();
  fetch.mockImplementationOnce((url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('Aborted')));
  }));
  const result = api.ensureSession().catch((err) => err);
  jest.advanceTimersByTime(30000);
  await expect(result).resolves.toMatchObject({ status: 0, code: 'REQUEST_TIMEOUT' });
  expect(fetch).toHaveBeenCalledTimes(1);
  fetch.mockResolvedValueOnce(response(authInfo()));
  await expect(api.ensureSession()).resolves.toMatchObject({ accountId: 'owner-a' });
});
