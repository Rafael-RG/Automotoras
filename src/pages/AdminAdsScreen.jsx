import React, { useState, useEffect, useCallback } from 'react';
import logoSrc from '../assets/Logo2.svg';
import { getAds, createAd, updateAd, deleteAd, uploadAdImage } from '../services/api';

const inputClass =
  'w-full bg-white dark:bg-[#1C1C1E] border border-gray-200 dark:border-[#E5E2E3]/10 rounded-lg px-4 py-3 text-gray-900 dark:text-[#E5E2E3] text-sm focus:border-[#D32F2F]/50 focus:outline-none';
const labelClass = 'block text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500 dark:text-[#E5E2E3]/40 mb-2';

const EMPTY_FORM = { title: '', linkUrl: '', isActive: true, startDate: '', endDate: '' };

const toDateInput = (iso) => (iso ? iso.slice(0, 10) : '');

// ─── Key gate ───────────────────────────────────────────────────────────────
const KeyGate = ({ onValid }) => {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setChecking(true);
    setError('');
    try {
      await getAds(key);
      localStorage.setItem('adsAdminKey', key);
      onValid(key);
    } catch {
      setError('Clave incorrecta.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0E0E0F] flex items-center justify-center px-4">
      <div className="max-w-sm w-full">
        <div className="flex justify-center mb-8">
          <img src={logoSrc} alt="RedAutos" className="h-16 object-contain" />
        </div>
        <h1 className="text-gray-900 dark:text-[#E5E2E3] font-headline font-black text-xl text-center tracking-tighter mb-6">
          Panel de Publicidad
        </h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClass}>Clave de administrador</label>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              required
              autoFocus
              className={inputClass}
            />
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            type="submit"
            disabled={checking || !key}
            className="w-full bg-[#D32F2F] hover:bg-[#B71C1C] disabled:opacity-40 text-white py-3 rounded-lg font-bold text-sm uppercase tracking-wider transition-colors"
          >
            {checking ? 'Verificando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
};

// ─── Ad form modal ────────────────────────────────────────────────────────────
const AdFormModal = ({ ad, adminKey, onClose, onSaved }) => {
  const isEdit = !!ad;
  const [form, setForm] = useState(
    isEdit
      ? {
          title: ad.title,
          linkUrl: ad.linkUrl,
          isActive: ad.isActive,
          startDate: toDateInput(ad.startDate),
          endDate: toDateInput(ad.endDate),
        }
      : EMPTY_FORM
  );
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(ad?.imageUrl || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        title: form.title,
        linkUrl: form.linkUrl,
        isActive: form.isActive,
        startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
        endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
      };
      const saved = isEdit
        ? await updateAd(ad.id, payload, adminKey)
        : await createAd(payload, adminKey);

      if (imageFile) {
        await uploadAdImage(saved.id, imageFile, adminKey);
      }
      onSaved();
    } catch {
      setError('No se pudo guardar el banner.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="relative bg-white dark:bg-[#141415] border border-gray-200 dark:border-[#E5E2E3]/10 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {saving && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-black/60">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-gray-200 dark:border-[#E5E2E3]/20 border-t-[#D32F2F] rounded-full animate-spin" />
              <span className="text-gray-500 dark:text-[#E5E2E3]/60 text-sm">Guardando…</span>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-[#E5E2E3]/10">
          <h2 className="text-xl font-headline font-black text-gray-900 dark:text-[#E5E2E3] uppercase tracking-tight">
            {isEdit ? 'Editar Banner' : 'Nuevo Banner'}
          </h2>
          <button onClick={onClose} disabled={saving} className="text-gray-500 dark:text-[#E5E2E3]/40 hover:text-gray-900 hover:dark:text-[#E5E2E3] transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <fieldset disabled={saving} className="contents">
            <div>
              <label className={labelClass}>Título (uso interno)</label>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                required
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Link de destino</label>
              <input
                type="url"
                value={form.linkUrl}
                onChange={(e) => setForm((f) => ({ ...f, linkUrl: e.target.value }))}
                required
                placeholder="https://…"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Imagen del banner</label>
              {imagePreview && (
                <img src={imagePreview} alt="Vista previa" className="w-full h-28 object-cover rounded-lg mb-2 border border-gray-200 dark:border-[#E5E2E3]/10" />
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                required={!isEdit}
                className="text-sm text-gray-500 dark:text-[#E5E2E3]/50"
              />
              <p className="text-gray-500 dark:text-[#E5E2E3]/45 text-[10px] mt-1">JPEG, PNG o WebP. Máx. 5 MB.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Desde (opcional)</label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Hasta (opcional)</label>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                  className={inputClass}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                className="w-4 h-4 accent-[#D32F2F]"
              />
              <span className="text-sm text-gray-900 dark:text-[#E5E2E3]">Banner activo</span>
            </label>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-lg text-sm font-bold text-gray-500 dark:text-[#E5E2E3]/50 hover:text-gray-900 hover:dark:text-[#E5E2E3] transition-colors">
                Cancelar
              </button>
              <button type="submit" className="px-5 py-2.5 rounded-lg text-sm font-bold bg-[#D32F2F] hover:bg-[#B71C1C] text-white transition-colors">
                Guardar
              </button>
            </div>
          </fieldset>
        </form>
      </div>
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────
const AdminAdsScreen = () => {
  const [adminKey, setAdminKey] = useState(() => localStorage.getItem('adsAdminKey') || '');
  const [authorized, setAuthorized] = useState(false);
  const [checkingStored, setCheckingStored] = useState(!!localStorage.getItem('adsAdminKey'));
  const [ads, setAds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingAd, setEditingAd] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const loadAds = useCallback(async (key) => {
    setLoading(true);
    try {
      const data = await getAds(key);
      setAds(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!adminKey) {
      setCheckingStored(false);
      return;
    }
    getAds(adminKey)
      .then((data) => {
        setAds(data);
        setAuthorized(true);
      })
      .catch(() => {
        localStorage.removeItem('adsAdminKey');
        setAdminKey('');
      })
      .finally(() => setCheckingStored(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleValid = (key) => {
    setAdminKey(key);
    setAuthorized(true);
    loadAds(key);
  };

  const handleLogout = () => {
    localStorage.removeItem('adsAdminKey');
    setAdminKey('');
    setAuthorized(false);
    setAds([]);
  };

  const openNew = () => { setEditingAd(null); setShowModal(true); };
  const openEdit = (ad) => { setEditingAd(ad); setShowModal(true); };
  const closeModal = () => setShowModal(false);

  const handleDelete = async (id) => {
    await deleteAd(id, adminKey);
    setDeletingId(null);
    loadAds(adminKey);
  };

  if (checkingStored) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0E0E0F] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-gray-200 dark:border-[#E5E2E3]/20 border-t-[#D32F2F] rounded-full animate-spin" />
      </div>
    );
  }

  if (!authorized) {
    return <KeyGate onValid={handleValid} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0E0E0F]">
      <header className="border-b border-gray-200 dark:border-[#E5E2E3]/10 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <img src={logoSrc} alt="RedAutos" className="h-8 object-contain" />
          <h1 className="font-headline font-black text-lg text-gray-900 dark:text-[#E5E2E3] uppercase tracking-tight">
            Banners publicitarios
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={openNew}
            className="flex items-center gap-2 bg-[#D32F2F] hover:bg-[#B71C1C] text-white px-4 py-2.5 rounded-lg text-sm font-bold transition-colors"
          >
            <span className="material-symbols-outlined !text-lg">add</span>Nuevo banner
          </button>
          <button onClick={handleLogout} className="text-gray-500 dark:text-[#E5E2E3]/40 hover:text-gray-900 hover:dark:text-[#E5E2E3] text-sm transition-colors">
            Salir
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-gray-200 dark:border-[#E5E2E3]/20 border-t-[#D32F2F] rounded-full animate-spin" />
          </div>
        ) : ads.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-500 dark:text-[#E5E2E3]/40 text-sm">No hay banners creados todavía.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {ads.map((ad) => (
              <div key={ad.id} className="bg-white dark:bg-[#141415] border border-gray-200 dark:border-[#E5E2E3]/10 rounded-xl overflow-hidden">
                <div className="w-full h-32 bg-gray-100 dark:bg-[#1C1C1E]">
                  {ad.imageUrl ? (
                    <img src={ad.imageUrl} alt={ad.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="material-symbols-outlined text-gray-400 dark:text-[#E5E2E3]/20 !text-3xl">image</span>
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="font-bold text-gray-900 dark:text-[#E5E2E3] text-sm truncate">{ad.title}</h3>
                    <span className={`flex-shrink-0 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${ad.isActive ? 'bg-green-500/15 text-green-500' : 'bg-gray-400/15 text-gray-400'}`}>
                      {ad.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  <p className="text-gray-500 dark:text-[#E5E2E3]/40 text-xs truncate mb-3">{ad.linkUrl}</p>
                  {(ad.startDate || ad.endDate) && (
                    <p className="text-gray-500 dark:text-[#E5E2E3]/30 text-[10px] mb-3">
                      {ad.startDate ? new Date(ad.startDate).toLocaleDateString() : '—'} → {ad.endDate ? new Date(ad.endDate).toLocaleDateString() : '—'}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(ad)} className="flex-1 text-xs font-bold py-2 rounded-lg border border-gray-200 dark:border-[#E5E2E3]/10 text-gray-500 dark:text-[#E5E2E3]/50 hover:text-gray-900 hover:dark:text-[#E5E2E3] transition-colors">
                      Editar
                    </button>
                    <button onClick={() => setDeletingId(ad.id)} className="flex-1 text-xs font-bold py-2 rounded-lg border border-red-400/30 text-red-400 hover:bg-red-400/10 transition-colors">
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {showModal && (
        <AdFormModal
          ad={editingAd}
          adminKey={adminKey}
          onClose={closeModal}
          onSaved={() => { closeModal(); loadAds(adminKey); }}
        />
      )}

      {deletingId && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#141415] border border-gray-200 dark:border-[#E5E2E3]/10 rounded-xl w-full max-w-sm p-6">
            <p className="text-gray-900 dark:text-[#E5E2E3] font-bold mb-2">¿Eliminar este banner?</p>
            <p className="text-gray-500 dark:text-[#E5E2E3]/40 text-sm mb-6">Esta acción no se puede deshacer.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeletingId(null)} className="px-4 py-2 rounded-lg text-sm font-bold text-gray-500 dark:text-[#E5E2E3]/50">
                Cancelar
              </button>
              <button onClick={() => handleDelete(deletingId)} className="px-4 py-2 rounded-lg text-sm font-bold bg-red-500 hover:bg-red-600 text-white transition-colors">
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminAdsScreen;
