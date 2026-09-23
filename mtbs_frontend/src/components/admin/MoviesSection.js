import React, { useState } from 'react';
import axios from '../../api/axios';
import { Modal, Field, input, Btn, EmptyState, SectionHeader } from './ui';
import { FiFilm, FiEdit2, FiRotateCcw, FiTrash2, FiPlus, FiSearch } from 'react-icons/fi';

const EMPTY_MOVIE = {
  title: '', description: '', poster_url: '', trailer_url: '',
  genre: '', language: '', director: '', cast: '',
  duration_minutes: '', release_date: '',
};

const MoviesSection = ({ movies, onBack, refresh }) => {
  const [form, setForm] = useState(EMPTY_MOVIE);
  const [editingKey, setEditingKey] = useState(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const openNew = () => { setForm(EMPTY_MOVIE); setEditingKey(null); setOpen(true); };

  const openEdit = (m) => {
    setEditingKey(m.slug || m.id);
    setForm({
      title: m.title || '', description: m.description || '',
      poster_url: m.poster_url || '', trailer_url: m.trailer_url || '',
      genre: m.genre || '', language: m.language || '',
      director: m.director || '', cast: m.cast || '',
      duration_minutes: m.duration_minutes || '', release_date: m.release_date || '',
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) return alert('Title is required.');
    setSaving(true);
    const payload = {
      ...form,
      duration_minutes: form.duration_minutes === '' ? null : Number(form.duration_minutes),
      release_date: form.release_date === '' ? null : form.release_date,
    };
    try {
      if (editingKey) await axios.put(`/movies/${editingKey}/`, payload);
      else await axios.post('/movies/', payload);
      setOpen(false);
      refresh();
    } catch (err) {
      alert('Failed to save movie: ' + JSON.stringify(err.response?.data || err.message));
    } finally {
      setSaving(false);
    }
  };

  const retire = async (m) => {
    if (!window.confirm(
      `Retire "${m.title}"? It disappears from the catalogue, but its `
      + 'showtimes and bookings are kept. You can restore it later.')) return;
    try {
      await axios.delete(`/movies/${m.slug || m.id}/`);
      refresh();
    } catch {
      alert('Could not retire movie.');
    }
  };

  const restore = async (m) => {
    try {
      await axios.post(`/movies/${m.slug || m.id}/restore/`);
      refresh();
    } catch {
      alert('Could not restore movie.');
    }
  };

  const shown = movies.filter((m) =>
    m.title.toLowerCase().includes(search.toLowerCase()));

  const activeCount = movies.filter((m) => m.is_active !== false).length;
  const retiredCount = movies.length - activeCount;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Movies Management"
        subtitle={`${activeCount} in active catalogue${retiredCount ? ` · ${retiredCount} retired` : ''}`}
        onBack={onBack}
        action={
          <button
            onClick={openNew}
            className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 shadow-lg shadow-rose-600/20 flex items-center space-x-2"
          >
            <FiPlus className="w-4 h-4" />
            <span>Add New Movie</span>
          </button>
        }
      />

      {movies.length > 0 && (
        <div className="relative max-w-md">
          <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            placeholder="Search movies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 focus:border-rose-500 text-white pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none placeholder-slate-500"
          />
        </div>
      )}

      {movies.length === 0 ? (
        <EmptyState icon="🎬" title="No movies in catalogue"
          hint="Add your first movie to start scheduling showtimes."
          action={<Btn variant="success" onClick={openNew}>+ Add Movie</Btn>} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {shown.map((m) => (
            <div key={m.id} className={`glass-card rounded-2xl border border-slate-800 overflow-hidden shadow-lg flex ${m.is_active === false ? 'opacity-50' : ''}`}>
              {m.poster_url ? (
                <img
                  src={m.poster_url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="w-24 h-full object-cover shrink-0 border-r border-slate-800"
                />
              ) : (
                <div className="w-24 bg-slate-900 flex items-center justify-center text-slate-600 shrink-0 border-r border-slate-800">
                  <FiFilm className="w-8 h-8" />
                </div>
              )}
              <div className="p-4 flex-1 min-w-0 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-1">
                    <h4 className="font-bold text-white text-base truncate">{m.title}</h4>
                    {m.is_active === false && (
                      <span className="text-[9px] font-bold uppercase tracking-wider bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded shrink-0 border border-slate-700">
                        Retired
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-rose-400 truncate mt-0.5">{m.genre || 'No genre'}</p>
                  <p className="text-[11px] text-slate-400 truncate mt-1">
                    {[m.language, m.duration_minutes && `${m.duration_minutes}m`].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>

                <div className="flex gap-2 pt-3 border-t border-slate-800/80 mt-2">
                  <button
                    onClick={() => openEdit(m)}
                    className="px-3 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-white rounded-lg flex items-center space-x-1"
                  >
                    <FiEdit2 className="w-3 h-3 text-amber-400" />
                    <span>Edit</span>
                  </button>

                  {m.is_active === false ? (
                    <button
                      onClick={() => restore(m)}
                      className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold rounded-lg flex items-center space-x-1"
                    >
                      <FiRotateCcw className="w-3 h-3" />
                      <span>Restore</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => retire(m)}
                      className="px-3 py-1 bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-600 hover:text-white text-xs font-bold rounded-lg flex items-center space-x-1"
                    >
                      <FiTrash2 className="w-3 h-3" />
                      <span>Retire</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <Modal wide title={editingKey ? 'Edit Movie Details' : 'Add New Movie to Catalogue'} onClose={() => setOpen(false)}
          footer={<>
            <Btn variant="ghost" onClick={() => setOpen(false)}>Cancel</Btn>
            <Btn variant="success" onClick={save} disabled={saving}>
              {saving ? 'Saving...' : editingKey ? 'Save Changes' : 'Add Movie'}
            </Btn>
          </>}>
          <div className="space-y-4">
            <Field label="Movie Title *">
              <input className={input} value={form.title} onChange={set('title')} placeholder="e.g. Interstellar" />
            </Field>
            <Field label="Synopsis / Description">
              <textarea rows={3} className={input} value={form.description} onChange={set('description')} placeholder="Movie synopsis..." />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Poster Image URL" hint="Direct image link URL">
                <input className={input} value={form.poster_url} onChange={set('poster_url')} placeholder="https://..." />
              </Field>
              <Field label="Trailer Embed URL" hint="YouTube video link">
                <input className={input} value={form.trailer_url} onChange={set('trailer_url')} placeholder="https://youtube.com/..." />
              </Field>
              <Field label="Genre" hint="Action, Sci-Fi, Thriller">
                <input className={input} value={form.genre} onChange={set('genre')} placeholder="Action, Sci-Fi" />
              </Field>
              <Field label="Language" hint="English, Hindi, Spanish">
                <input className={input} value={form.language} onChange={set('language')} placeholder="English" />
              </Field>
              <Field label="Director Name">
                <input className={input} value={form.director} onChange={set('director')} placeholder="Christopher Nolan" />
              </Field>
              <Field label="Cast Members" hint="Comma-separated names">
                <input className={input} value={form.cast} onChange={set('cast')} placeholder="Actor A, Actor B" />
              </Field>
              <Field label="Duration (Minutes)">
                <input type="number" min={1} className={input} value={form.duration_minutes}
                  onChange={set('duration_minutes')} placeholder="169" />
              </Field>
              <Field label="Release Date">
                <input type="date" className={input} value={form.release_date} onChange={set('release_date')} />
              </Field>
            </div>

            {form.poster_url && (
              <div className="pt-2">
                <p className="text-xs text-slate-400 mb-1 font-semibold">Poster Preview</p>
                <img src={form.poster_url} alt="preview" className="w-24 h-36 object-cover rounded-xl border border-slate-800 shadow-md"
                  onError={(e) => { e.target.style.display = 'none'; }} />
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};

export default MoviesSection;
