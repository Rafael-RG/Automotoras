import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import logoSrc from '../assets/Logo2.svg';
import ThemeToggleButton from '../components/ThemeToggleButton';
import { getSession, logoutDealership, getAds, createAd, updateAd, deleteAd, uploadAdImage } from '../services/api';

const inputClass =
  'w-full bg-white dark:bg-[#1C1C1E] border border-gray-200 dark:border-[#E5E2E3]/10 rounded-lg px-4 py-3 text-gray-900 dark:text-[#E5E2E3] text-sm focus:border-[#D32F2F]/50 focus:outline-none';
const labelClass = 'block text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500 dark:text-[#E5E2E3]/40 mb-2';

const EMPTY_FORM = { title: '', linkUrl: '', isActive: true, startDate: '', endDate: '' };

const toDateInput = (iso) => (iso ? iso.slice(0, 10) : '');

// ─── Session/role gate ───────────────────────────────────────────────────────
const AccessGate = ({ status, error, onRetry, onLogout }) => {
  const checking = status === 'checking' || status === 'logging-out';
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0E0E0F] flex items-center justify-center px-4">
      <div className="fixed top-4 right-4"><ThemeToggleButton /></div>
      <div className="max-w-md w-full text-center space-y-5">
        <div className="flex justify-center mb-8">
          <img src={logoSrc} alt="RedAutos" className="h-16 object-contain" />
        </div>
        <h1 className="text-gray-900 dark:text-[#E5E2E3] font-headline font-black text-xl text-center tracking-tighter mb-6">
          Panel de Publicidad
        </h1>
        {checking && (
          <output className="block text-gray-600 dark:text-[#E5E2E3]/60 text-sm">
            <span className="block mx-auto mb-4 w-8 h-8 border-4 border-gray-200 dark:border-[#E5E2E3]/20 border-t-[#D32F2F] rounded-full animate-spin" />
            {status === 'logging-out' ? 'Cerrando la sesión en el servidor…' : 'Verificando sesión y permisos…'}
          </output>
        )}
        {status === 'login' && (
          <>
            <p className="text-gray-600 dark:text-[#E5E2E3]/60 text-sm">Necesitás iniciar sesión para consultar este panel.</p>
            <Link to="/login" state={{ from: '/admin-ads' }} className="inline-block bg-primary text-white px-6 py-3 rounded-lg font-bold text-sm">Iniciar sesión</Link>
          </>
        )}
        {status === 'forbidden' && (
          <p role="alert" className="text-gray-700 dark:text-[#E5E2E3]/70 text-sm">
            Acceso denegado: esta cuenta no tiene el rol de administrador de plataforma.
            Solo las cuentas habilitadas por el servidor pueden administrar publicidad.
            Si no hay cuentas autorizadas configuradas, el panel permanece bloqueado.
          </p>
        )}
        {(status === 'error' || status === 'logout-error') && (
          <p role="alert" className="text-red-600 dark:text-red-400 text-sm">{error}</p>
        )}
        {status === 'error' && <button onClick={onRetry} className="bg-primary text-white px-6 py-3 rounded-lg font-bold text-sm">Reintentar</button>}
        {!checking && status !== 'login' && (
          <button onClick={onLogout} className="block mx-auto text-gray-600 dark:text-[#E5E2E3]/60 text-sm underline">
            {status === 'logout-error' ? 'Reintentar cierre de sesión' : 'Cerrar sesión'}
          </button>
        )}
        {!checking && status !== 'logout-error' && <Link to="/admin" className="block text-primary text-sm">Volver al panel de automotora</Link>}
      </div>
    </div>
  );
};

// ─── Ad form modal ────────────────────────────────────────────────────────────
const AdFormModal = ({ ad, onClose, onSaved }) => {
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
  const [saveNotice, setSaveNotice] = useState('');
  const savingRef = useRef(false);
  const recordSavedRef = useRef(false);

  useEffect(() => {
    if (!imageFile) return;
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (savingRef.current || recordSavedRef.current || saveNotice) return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    let recordAttempted = false;
    try {
      const payload = {
        title: form.title,
        linkUrl: form.linkUrl,
        isActive: form.isActive,
        startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
        endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
      };
      recordAttempted = true;
      const saved = isEdit
        ? await updateAd(ad.id, payload)
        : await createAd(payload);
      recordSavedRef.current = true;

      if (imageFile) {
        const id = ad?.id || saved?.id;
        if (!id) throw new Error('El servidor no devolvió el identificador para subir la imagen.');
        await uploadAdImage(id, imageFile);
      }
      onSaved();
    } catch (err) {
      if (recordSavedRef.current) {
        setSaveNotice(`El banner se guardó, pero la imagen no pudo confirmarse. Cerrá y actualizá para editarlo sin crear otro. ${err.message}`);
      } else if (!isEdit && recordAttempted && (!err.status || err.status >= 500 || err.code === 'INVALID_RESPONSE' || err.code === 'SESSION_CHANGED')) {
        setSaveNotice('No se pudo confirmar la creación. El banner podría haberse guardado: cerrá y actualizá antes de volver a crearlo.');
      } else {
        setError(err.message || 'No se pudo guardar el banner.');
      }
    } finally {
      savingRef.current = false;
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
          <button onClick={saveNotice ? onSaved : onClose} disabled={saving} aria-label="Cerrar banner" className="text-gray-500 dark:text-[#E5E2E3]/40 hover:text-gray-900 hover:dark:text-[#E5E2E3] transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {saveNotice && (
            <div role="alert" className="p-4 border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300 rounded-lg text-sm space-y-3">
              <p>{saveNotice}</p>
              <button type="button" onClick={onSaved} className="font-bold underline">Cerrar y actualizar banners</button>
            </div>
          )}
          <fieldset disabled={saving || !!saveNotice} className="contents">
            <div>
              <label htmlFor="ad-title" className={labelClass}>Título (uso interno)</label>
              <input
                id="ad-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                required
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="ad-link" className={labelClass}>Link de destino</label>
              <input
                id="ad-link"
                type="url"
                value={form.linkUrl}
                onChange={(e) => setForm((f) => ({ ...f, linkUrl: e.target.value }))}
                required
                placeholder="https://…"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="ad-image" className={labelClass}>Imagen del banner</label>
              {imagePreview && (
                <img src={imagePreview} alt="Vista previa" className="w-full h-28 object-cover rounded-lg mb-2 border border-gray-200 dark:border-[#E5E2E3]/10" />
              )}
              <input
                id="ad-image"
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
                <label htmlFor="ad-start" className={labelClass}>Desde (opcional)</label>
                <input
                  id="ad-start"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="ad-end" className={labelClass}>Hasta (opcional)</label>
                <input
                  id="ad-end"
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
            {error && <p role="alert" className="text-red-600 dark:text-red-400 text-xs">{error}</p>}
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
  const navigate = useNavigate();
  const [access, setAccess] = useState('checking');
  const [error, setError] = useState('');
  const [ads, setAds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingAd, setEditingAd] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const requestRef = useRef(0);
  const logoutPendingRef = useRef(false);
  const deletingRef = useRef(false);

  const loadAds = useCallback(async () => {
    if (logoutPendingRef.current) return;
    const requestId = ++requestRef.current;
    setAccess('checking');
    setLoading(true);
    setError('');
    setAds([]);
    setShowModal(false);
    setEditingAd(null);
    setDeletingId(null);
    setDeleteError('');
    try {
      const session = await getSession();
      if (requestId !== requestRef.current) return;
      if (!session.isPlatformAdmin) {
        setAccess('forbidden');
        return;
      }
      const data = await getAds();
      if (requestId !== requestRef.current) return;
      if (!Array.isArray(data)) throw new Error('El servidor no devolvió una lista de banners válida.');
      setAds(data);
      setAccess('authorized');
    } catch (err) {
      if (requestId !== requestRef.current) return;
      if (err.status === 401) setAccess('login');
      else if (err.status === 403) setAccess('forbidden');
      else {
        setError(err.message || 'No se pudieron cargar los banners.');
        setAccess('error');
      }
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const expired = () => {
      if (logoutPendingRef.current) return;
      requestRef.current += 1;
      setAccess('login');
      setAds([]);
      setShowModal(false);
      setEditingAd(null);
      setDeletingId(null);
      setLoading(false);
    };
    window.addEventListener('redautos:session-expired', expired);
    window.addEventListener('redautos:session-changed', loadAds);
    loadAds();
    return () => {
      requestRef.current += 1;
      window.removeEventListener('redautos:session-expired', expired);
      window.removeEventListener('redautos:session-changed', loadAds);
    };
  }, [loadAds]);

  const handleLogout = async () => {
    if (logoutPendingRef.current) return;
    logoutPendingRef.current = true;
    requestRef.current += 1;
    setAccess('logging-out');
    setAds([]);
    setShowModal(false);
    setEditingAd(null);
    setDeletingId(null);
    try {
      await logoutDealership();
      navigate('/login', { replace: true, state: { from: '/admin-ads' } });
    } catch (err) {
      setAccess('logout-error');
      setError(`Se borraron los datos locales, pero el cierre en el servidor no se confirmó. ${err.message}`);
    } finally {
      logoutPendingRef.current = false;
    }
  };

  const openNew = () => { setEditingAd(null); setShowModal(true); };
  const openEdit = (ad) => { setEditingAd(ad); setShowModal(true); };
  const closeModal = () => setShowModal(false);

  const handleDelete = async (id) => {
    if (deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    setDeleteError('');
    const requestId = requestRef.current;
    try {
      await deleteAd(id);
      if (requestId !== requestRef.current) return;
      setDeletingId(null);
      await loadAds();
    } catch (err) {
      if (requestId !== requestRef.current) return;
      if (err.status === 403) {
        setAds([]);
        setAccess('forbidden');
        setDeletingId(null);
      } else {
        setDeleteError(err.message || 'No se pudo eliminar el banner.');
      }
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  };

  if (access !== 'authorized') {
    return <AccessGate status={access} error={error} onRetry={loadAds} onLogout={handleLogout} />;
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
          <ThemeToggleButton />
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
        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-gray-200 dark:border-[#E5E2E3]/20 border-t-[#D32F2F] rounded-full animate-spin" />
          </div>
        )}
        {!loading && ads.length === 0 && (
          <div className="text-center py-16">
            <p className="text-gray-500 dark:text-[#E5E2E3]/40 text-sm">No hay banners creados todavía.</p>
          </div>
        )}
        {!loading && ads.length > 0 && (
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
                    <button onClick={() => { setDeletingId(ad.id); setDeleteError(''); }} className="flex-1 text-xs font-bold py-2 rounded-lg border border-red-400/30 text-red-400 hover:bg-red-400/10 transition-colors">
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
          onClose={closeModal}
          onSaved={() => { closeModal(); loadAds(); }}
        />
      )}

      {deletingId && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#141415] border border-gray-200 dark:border-[#E5E2E3]/10 rounded-xl w-full max-w-sm p-6">
            <p className="text-gray-900 dark:text-[#E5E2E3] font-bold mb-2">¿Eliminar este banner?</p>
            <p className="text-gray-500 dark:text-[#E5E2E3]/40 text-sm mb-6">Esta acción no se puede deshacer.</p>
            {deleteError && <p role="alert" className="text-red-600 dark:text-red-400 text-sm mb-4">{deleteError}</p>}
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeletingId(null)} disabled={deleting} className="px-4 py-2 rounded-lg text-sm font-bold text-gray-500 dark:text-[#E5E2E3]/50 disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={() => handleDelete(deletingId)} disabled={deleting} className="px-4 py-2 rounded-lg text-sm font-bold bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-50">
                {deleting ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminAdsScreen;
