const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:7071/api';

const handleResponse = async (res) => {
  if (!res.ok) {
    const text = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
};

// ─── Vehículos ───────────────────────────────────────────────────────────────

export const getVehicles = (brand) => {
  const params = brand ? `?brand=${encodeURIComponent(brand)}` : '';
  return fetch(`${BASE_URL}/vehicles${params}`).then(handleResponse);
};

export const getVehicleById = (brand, id) =>
  fetch(`${BASE_URL}/vehicles/${encodeURIComponent(brand)}/${id}`).then(handleResponse);

export const createVehicle = (vehicle) =>
  fetch(`${BASE_URL}/vehicles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(vehicle),
  }).then(handleResponse);

export const updateVehicle = (brand, id, vehicle) =>
  fetch(`${BASE_URL}/vehicles/${encodeURIComponent(brand)}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(vehicle),
  }).then(handleResponse);

export const deleteVehicle = (brand, id) =>
  fetch(`${BASE_URL}/vehicles/${encodeURIComponent(brand)}/${id}`, {
    method: 'DELETE',
  }).then(handleResponse);

export const trackVehicleEvent = (brand, id, type) =>
  fetch(`${BASE_URL}/vehicles/${encodeURIComponent(brand)}/${id}/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type }),
  }).then(handleResponse).catch(() => {}); // fire-and-forget, no rompe la UI

export const uploadVehicleImage = (brand, id, file) => {
  const formData = new FormData();
  formData.append('file', file);
  return fetch(`${BASE_URL}/vehicles/${encodeURIComponent(brand)}/${id}/image`, {
    method: 'POST',
    body: formData,
  }).then(handleResponse);
};

export const uploadTempVehicleImage = (file) => {
  const formData = new FormData();
  formData.append('file', file);
  return fetch(`${BASE_URL}/vehicles/images/temp`, {
    method: 'POST',
    body: formData,
  }).then(handleResponse);
};

export const removeVehicleImage = (brand, id, url) =>
  fetch(`${BASE_URL}/vehicles/${encodeURIComponent(brand)}/${id}/image?url=${encodeURIComponent(url)}`, {
    method: 'DELETE',
  }).then(handleResponse);

// ─── Automotoras ─────────────────────────────────────────────────────────────

export const getDealerships = () =>
  fetch(`${BASE_URL}/dealerships`).then(handleResponse);

export const getDealershipById = (id) =>
  fetch(`${BASE_URL}/dealerships/${id}`).then(handleResponse);

export const createDealership = (dealership) =>
  fetch(`${BASE_URL}/dealerships`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dealership),
  }).then(handleResponse);

export const updateDealership = (id, dealership) =>
  fetch(`${BASE_URL}/dealerships/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dealership),
  }).then(handleResponse);

export const uploadDealershipLogo = (id, file) => {
  const formData = new FormData();
  formData.append('file', file);
  return fetch(`${BASE_URL}/dealerships/${id}/logo`, {
    method: 'POST',
    body: formData,
  }).then(handleResponse);
};

// ─── Suscripciones ───────────────────────────────────────────────────────────

export const createSubscriptionCheckout = (dealershipId, plan, backUrl) =>
  fetch(`${BASE_URL}/subscriptions/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dealershipId, plan, backUrl }),
  }).then(handleResponse);

export const simulateSubscription = (dealershipId, plan) =>
  fetch(`${BASE_URL}/subscriptions/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dealershipId, plan }),
  }).then(handleResponse);

export const verifySubscription = (dealershipId) =>
  fetch(`${BASE_URL}/subscriptions/verify/${dealershipId}`).then(handleResponse);

// ─── Seed (solo desarrollo) ──────────────────────────────────────────────────

export const seedData = () =>
  fetch(`${BASE_URL}/seed`, { method: 'POST' }).then(handleResponse);

export const clearData = () =>
  fetch(`${BASE_URL}/seed/clear`, { method: 'POST' }).then(handleResponse);

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const registerDealership = (data) =>
  fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then(handleResponse);

export const loginDealership = (email, password) =>
  fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then(handleResponse);

export const verifyEmail = (token) =>
  fetch(`${BASE_URL}/auth/verify-email?token=${encodeURIComponent(token)}`).then(handleResponse);

export const forgotPassword = (email) =>
  fetch(`${BASE_URL}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  }).then(handleResponse);

export const resetPassword = (token, newPassword) =>
  fetch(`${BASE_URL}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword }),
  }).then(handleResponse);
