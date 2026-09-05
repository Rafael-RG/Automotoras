const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:7071/api').replace(/\/$/, '');
const REQUEST_TIMEOUT_MS = 30000;

export class ApiError extends Error {
  constructor(message, status = 0, code = 'REQUEST_FAILED') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

// La cookie HttpOnly pertenece al servidor. El CSRF nunca sale de la memoria de
// este módulo: ni almacenamiento persistente, ni estado React, ni eventos.
let session = null;
let csrfToken = '';
let mePromise = null;
let sessionGeneration = 0;

const removeStoredItem = (key) => {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // El bloqueo del almacenamiento no debe impedir iniciar o cerrar sesión.
  }
};

// Migración: eliminar la antigua clave sin leerla ni enviarla a la API.
removeStoredItem('adsAdminKey');

const emitSessionEvent = (name) => {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(name));
};

const clearSessionCache = () => {
  sessionGeneration += 1;
  session = null;
  csrfToken = '';
  mePromise = null;
  removeStoredItem('adminDealershipId');
};

const sessionChangedError = () => new ApiError(
  'La sesión cambió. Actualizá los datos antes de continuar.', 409, 'SESSION_CHANGED'
);

const handleResponse = async (res) => {
  const text = res.status === 204 ? '' : await res.text();
  let data = null;
  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      if (res.ok) {
        throw new ApiError('El servidor devolvió una respuesta no válida.', res.status, 'INVALID_RESPONSE');
      }
      // No mostrar HTML, trazas internas u otros cuerpos de error sin contrato.
    }
  }
  if (!res.ok) {
    throw new ApiError(
      typeof data?.error === 'string' ? data.error : `No se pudo completar la solicitud (HTTP ${res.status}).`,
      res.status,
      typeof data?.code === 'string' ? data.code : `HTTP_${res.status}`
    );
  }
  return data; // Tanto 200 vacío como 204 son respuestas válidas.
};

const buildRequestOptions = ({ method, privateRequest, auth, json, body, extraHeaders }) => {
  const readOnly = ['GET', 'HEAD', 'OPTIONS'].includes(method);
  const multipart = typeof FormData !== 'undefined' && body instanceof FormData;
  const headers = { ...extraHeaders };
  if (privateRequest || !readOnly) headers['X-Requested-With'] = 'RedAutos';
  if (!multipart && (auth || json !== undefined || !readOnly)) headers['Content-Type'] = 'application/json';
  if (!readOnly && csrfToken) headers['X-CSRF-Token'] = csrfToken;
  const options = { method, headers, credentials: privateRequest ? 'include' : 'omit' };
  if (privateRequest) options.cache = 'no-store';
  if (json !== undefined) options.body = JSON.stringify(json);
  else if (body) options.body = body;
  return options;
};

const assertCurrentSession = (generation, privateRequest) => {
  if (privateRequest && generation !== sessionGeneration) throw sessionChangedError();
};

const readSessionResponse = async (res, generation, privateRequest) => {
  assertCurrentSession(generation, privateRequest);
  if (privateRequest && res.status === 401) {
    clearSessionCache();
    emitSessionEvent('redautos:session-expired');
    return handleResponse(res);
  }
  const data = await handleResponse(res);
  assertCurrentSession(generation, privateRequest);
  return data;
};

const request = async (path, {
  method = 'GET', requiresSession = false, auth = false, json, body, headers: extraHeaders = {},
} = {}) => {
  const generation = sessionGeneration;
  if (requiresSession) await ensureSession();
  const privateRequest = requiresSession || auth;
  assertCurrentSession(generation, privateRequest);
  const options = buildRequestOptions({ method, privateRequest, auth, json, body, extraHeaders });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
    });
    // Una respuesta tardía de otra cuenta no puede borrar o repoblar la sesión.
    return await readSessionResponse(res, generation, privateRequest);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      controller.signal.aborted
        ? 'La solicitud tardó demasiado. Verificá tu conexión e intentá nuevamente.'
        : 'No se pudo conectar con el servidor. Verificá tu conexión e intentá nuevamente.',
      0,
      controller.signal.aborted ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR'
    );
  } finally {
    clearTimeout(timer);
  }
  // Nunca reintentar automáticamente: una escritura puede haberse completado.
};

const rememberSession = (data) => {
  if (!data || typeof data.accountId !== 'string' || !data.accountId
      || typeof data.csrfToken !== 'string' || !data.csrfToken) {
    throw new ApiError('No se pudo validar la sesión del servidor.', 200, 'INVALID_SESSION');
  }
  const { csrfToken: nextToken, ...info } = data;
  csrfToken = nextToken;
  session = Object.freeze({ ...info, isPlatformAdmin: info.isPlatformAdmin === true });
  return session;
};

export const ensureSession = ({ forceRefresh = false } = {}) => {
  if (mePromise) return mePromise;
  const unexpired = session && (!session.expiresAt || Date.parse(session.expiresAt) > Date.now());
  if (!forceRefresh && unexpired) return Promise.resolve(session);

  const generation = sessionGeneration;
  const previousAccountId = session?.accountId;
  const pending = request('/auth/me', { auth: true })
    .then((data) => {
      if (generation !== sessionGeneration) throw sessionChangedError();
      const changedAccount = previousAccountId && previousAccountId !== data?.accountId;
      if (changedAccount) clearSessionCache();
      const current = rememberSession(data);
      if (changedAccount) emitSessionEvent('redautos:session-changed');
      return current;
    })
    .catch((err) => {
      if (generation === sessionGeneration) {
        session = null;
        csrfToken = '';
      }
      throw err;
    })
    .finally(() => {
      if (mePromise === pending) mePromise = null;
    });
  mePromise = pending;
  return pending;
};

// Las pantallas privadas revalidan al entrar; los CRUD comparten ensureSession.
export const getSession = () => ensureSession({ forceRefresh: true });

// ─── Vehículos ───────────────────────────────────────────────────────────────
const vehiclePath = (brand, id) => `/vehicles/${encodeURIComponent(brand)}/${encodeURIComponent(id)}`;

export const getVehicles = (brand) => {
  const params = brand ? `?brand=${encodeURIComponent(brand)}` : '';
  return request(`/vehicles${params}`);
};

export const getVehicleById = (brand, id) => request(vehiclePath(brand, id));

export const createVehicle = (vehicle) =>
  request('/vehicles', { method: 'POST', requiresSession: true, json: vehicle });

export const updateVehicle = (brand, id, vehicle) =>
  request(vehiclePath(brand, id), { method: 'PUT', requiresSession: true, json: vehicle });

export const deleteVehicle = (brand, id) =>
  request(vehiclePath(brand, id), { method: 'DELETE', requiresSession: true });

export const getDealershipVehicles = (dealershipId) =>
  request(`/dealership/${encodeURIComponent(dealershipId)}/vehicles`, { requiresSession: true });

export const trackVehicleEvent = (brand, id, type) =>
  request(`${vehiclePath(brand, id)}/event`, { method: 'POST', json: { type } }).catch(() => null);

const uploadImage = (path, file, dealershipId) => {
  const body = new FormData();
  body.append('file', file);
  if (dealershipId) body.append('dealershipId', dealershipId);
  return request(path, { method: 'POST', requiresSession: true, body });
};

export const uploadVehicleImage = (brand, id, file) => uploadImage(`${vehiclePath(brand, id)}/image`, file);

export const uploadTempVehicleImage = (file, dealershipId) => {
  if (!dealershipId) {
    return Promise.reject(new ApiError('Seleccioná una sucursal para subir imágenes.', 400, 'DEALERSHIP_REQUIRED'));
  }
  // The backend streams this endpoint and intentionally requires tenant identity
  // before file bytes, so keep the multipart field order explicit here.
  const body = new FormData();
  body.append('dealershipId', dealershipId);
  body.append('file', file);
  return request('/vehicles/images/temp', { method: 'POST', requiresSession: true, body });
};

export const removeVehicleImage = (brand, id, url) =>
  request(`${vehiclePath(brand, id)}/image?url=${encodeURIComponent(url)}`, { method: 'DELETE', requiresSession: true });

// ─── Automotoras ─────────────────────────────────────────────────────────────
export const getDealerships = () => request('/dealerships');
export const getDealershipById = (id) => request(`/dealerships/${encodeURIComponent(id)}`);
// "admin" is reserved by Azure Functions runtime, so this account-scoped route
// intentionally avoids it while still returning only the session owner's data.
export const getAdminDealerships = () => request('/account/dealerships', { requiresSession: true });

export const createDealership = (dealership) =>
  request('/dealerships', { method: 'POST', requiresSession: true, json: dealership });

export const updateDealership = (id, dealership) =>
  request(`/dealerships/${encodeURIComponent(id)}`, { method: 'PUT', requiresSession: true, json: dealership });

export const uploadDealershipLogo = (id, file) => uploadImage(`/dealerships/${encodeURIComponent(id)}/logo`, file);

// ─── Suscripciones ───────────────────────────────────────────────────────────
export const createSubscriptionCheckout = (dealershipId, plan, backUrl) =>
  request('/subscriptions/checkout', { method: 'POST', requiresSession: true, json: { dealershipId, plan, backUrl } });

export const simulateSubscription = (dealershipId, plan) =>
  request('/subscriptions/simulate', { method: 'POST', requiresSession: true, json: { dealershipId, plan } });

export const verifySubscription = (dealershipId) =>
  request(`/subscriptions/verify/${encodeURIComponent(dealershipId)}`, { method: 'POST', requiresSession: true });

export const getSubscriptionInfo = (dealershipId) =>
  request(`/subscriptions/info/${encodeURIComponent(dealershipId)}`, { requiresSession: true });

export const trackDealershipProfileVisit = (id) =>
  request(`/dealerships/${encodeURIComponent(id)}/visit`, { method: 'POST' }).catch(() => null);

// ─── Seed (solo desarrollo; el servidor también debe restringirlo) ───────────
export const seedData = () => request('/seed', { method: 'POST', requiresSession: true });
export const clearData = () => request('/seed/clear', { method: 'POST', requiresSession: true });

// ─── Auth ────────────────────────────────────────────────────────────────────
const prepareAuthWrite = async () => {
  // Puede existir una cookie tras recargar /login o /reset-password. Recuperar
  // su CSRF antes de escribir; un 401 significa que se puede continuar anónimo.
  try { await ensureSession(); }
  catch (err) { if (err.status !== 401) throw err; }
};

const authWrite = async (path, json) => {
  await prepareAuthWrite();
  return request(path, { method: 'POST', auth: true, json });
};

export const registerDealership = (data) =>
  authWrite('/auth/register', data);

export const loginDealership = async (email, password) => {
  await prepareAuthWrite();
  const previousToken = csrfToken;
  clearSessionCache();
  const generation = sessionGeneration;
  const data = await request('/auth/login', {
    method: 'POST', auth: true, json: { email, password },
    headers: previousToken ? { 'X-CSRF-Token': previousToken } : {},
  });
  assertCurrentSession(generation, true);
  // También descartar cualquier /me que se iniciara durante el login.
  clearSessionCache();
  const current = rememberSession(data);
  emitSessionEvent('redautos:session-changed');
  return current;
};

export const logoutDealership = async () => {
  removeStoredItem('adminDealershipId');
  let generation = sessionGeneration;
  try {
    await ensureSession();
    generation = sessionGeneration;
    return await request('/auth/logout', { method: 'POST', auth: true, requiresSession: true });
  } catch (err) {
    if (err.status === 401) return null; // Una sesión ya vencida no necesita revocación.
    throw err; // La UI debe ofrecer reintentar si la revocación no fue confirmada.
  } finally {
    if (generation === sessionGeneration) clearSessionCache();
  }
};

export const verifyEmail = (token) =>
  request(`/auth/verify-email?token=${encodeURIComponent(token)}`, { auth: true });

export const forgotPassword = (email) =>
  authWrite('/auth/forgot-password', { email });

export const resetPassword = (token, newPassword) =>
  authWrite('/auth/reset-password', { token, newPassword });

export const resendVerification = (email) =>
  authWrite('/auth/resend-verification', { email });

// ─── Ads ─────────────────────────────────────────────────────────────────────
export const getActiveAds = () => request('/ads/active').catch(() => []);

// El servidor exige isPlatformAdmin. Los antiguos argumentos extra se ignoran;
// nunca se acepta ni transmite una clave de administrador desde el navegador.
export const getAds = () => request('/ads', { requiresSession: true });
export const getAdById = (id) => request(`/ads/${encodeURIComponent(id)}`, { requiresSession: true });
export const createAd = (data) => request('/ads', { method: 'POST', requiresSession: true, json: data });
export const updateAd = (id, data) =>
  request(`/ads/${encodeURIComponent(id)}`, { method: 'PUT', requiresSession: true, json: data });
export const deleteAd = (id) => request(`/ads/${encodeURIComponent(id)}`, { method: 'DELETE', requiresSession: true });
export const uploadAdImage = (id, file) => uploadImage(`/ads/${encodeURIComponent(id)}/image`, file);
