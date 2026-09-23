import React, { useMemo, useState } from 'react';
import axios from '../../api/axios';
import { Modal, Field, input, Btn, EmptyState, SectionHeader } from './ui';
import { FiClock, FiPlus, FiEdit2, FiTrash2, FiDollarSign, FiGrid, FiFilm, FiMapPin } from 'react-icons/fi';

const EMPTY = {
  movie: '', theatre: '', screen_number: 1, start_time: '',
  rows: 5, seats_per_row: 10, price: 10,
};

const MAX_ROWS = 26;
const ROW_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const readError = (data) => {
  if (!data) return 'Could not save showtime.';
  if (typeof data === 'string') return data;
  return Object.values(data).flat().join(' ');
};

const ShowtimesSection = ({ showtimes, movies, theatres, onBack, refresh }) => {
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [movieFilter, setMovieFilter] = useState('');

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const openNew = () => { setForm(EMPTY); setEditingId(null); setFormError(''); setOpen(true); };

  const openEdit = (s) => {
    setEditingId(s.id);
    setFormError('');
    setForm({
      movie: s.movie?.id || '',
      theatre: s.theatre?.id || '',
      screen_number: s.screen_number || 1,
      start_time: toLocalInput(s.start_time),
      rows: s.seat_layout?.rows ?? s.rows ?? 5,
      seats_per_row: s.seat_layout?.seats_per_row ?? s.seats_per_row ?? 10,
      price: s.price ?? 10,
    });
    setOpen(true);
  };

  const rows = Math.max(0, Math.min(MAX_ROWS, Number(form.rows) || 0));
  const perRow = Math.max(0, Number(form.seats_per_row) || 0);
  const generatedSeats = rows * perRow;

  const save = async () => {
    if (!form.movie || !form.start_time) {
      setFormError('Movie and start time are required.');
      return;
    }
    if (generatedSeats < 1) {
      setFormError('The layout needs at least one row and one seat per row.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        theatre_id: form.theatre || null,
        screen_number: Number(form.screen_number) || 1,
        start_time: form.start_time,
        rows,
        seats_per_row: perRow,
        price: form.price,
      };
      if (editingId) {
        await axios.patch(`/showtimes/${editingId}/`, payload);
      } else {
        await axios.post('/showtimes/', { ...payload, movie_id: form.movie });
      }
      setOpen(false);
      refresh();
    } catch (err) {
      setFormError(readError(err.response?.data) || err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s) => {
    if (!window.confirm('Delete this showtime? Its bookings go with it.')) return;
    try {
      await axios.delete(`/showtimes/${s.id}/`);
      refresh();
    } catch {
      alert('Could not delete showtime.');
    }
  };

  const shown = useMemo(
    () => (movieFilter ? showtimes.filter((s) => String(s.movie?.id) === movieFilter) : showtimes),
    [showtimes, movieFilter]
  );

  const now = Date.now();

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Showtimes & Screening Schedule" subtitle={`${showtimes.length} total scheduled showings`} onBack={onBack}
        action={
          <button
            onClick={openNew}
            className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 shadow-lg shadow-rose-600/20 flex items-center space-x-2"
          >
            <FiPlus className="w-4 h-4" />
            <span>Add New Showtime</span>
          </button>
        }
      />

      {showtimes.length > 0 && (
        <select
          className="bg-slate-900 border border-slate-800 text-white px-4 py-2.5 rounded-xl text-xs font-bold outline-none"
          value={movieFilter}
          onChange={(e) => setMovieFilter(e.target.value)}
        >
          <option value="">All catalogue movies</option>
          {movies.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
        </select>
      )}

      {showtimes.length === 0 ? (
        <EmptyState icon="🕒" title="No showtimes scheduled"
          hint="Users can't book anything until a movie has a showtime."
          action={<Btn variant="success" onClick={openNew}>+ Add Showtime</Btn>} />
      ) : shown.length === 0 ? (
        <EmptyState icon="🔍" title="No showtimes found for selected filter" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {shown.map((s) => {
            const total = s.total_seats || 0;
            const sold = Math.max(0, total - (s.seats_available ?? total));
            const pct = total ? Math.round((sold / total) * 100) : 0;
            const past = new Date(s.start_time).getTime() < now;
            const layout = s.seat_layout;
            return (
              <div key={s.id} className={`glass-card p-5 rounded-2xl border border-slate-800 shadow-lg flex flex-col justify-between space-y-4 ${past ? 'opacity-50' : ''}`}>
                <div>
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <h4 className="font-bold text-white text-base truncate">{s.movie?.title || 'Unknown movie'}</h4>
                    {past && (
                      <span className="text-[9px] font-extrabold uppercase bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700 shrink-0">
                        Past
                      </span>
                    )}
                  </div>

                  <p className="text-xs font-semibold text-rose-400 flex items-center space-x-1">
                    <FiMapPin className="w-3 h-3" />
                    <span>{s.theatre ? `${s.theatre.name} — ${s.theatre.city}` : 'No theatre set'}{s.screen_number ? ` · Screen ${s.screen_number}` : ''}</span>
                  </p>

                  <div className="space-y-1 mt-3 text-xs text-slate-300">
                    <p className="flex items-center space-x-1.5 font-medium">
                      <FiClock className="w-3.5 h-3.5 text-amber-400" />
                      <span>{new Date(s.start_time).toLocaleString()}</span>
                    </p>
                    <p className="flex items-center space-x-1.5 font-bold text-emerald-400">
                      <FiDollarSign className="w-3.5 h-3.5" />
                      <span>${Number(s.price ?? 0).toFixed(2)} per seat</span>
                    </p>
                    {layout?.rows > 0 && (
                      <p className="flex items-center space-x-1.5 text-slate-400">
                        <FiGrid className="w-3.5 h-3.5" />
                        <span>{layout.rows} rows × {layout.seats_per_row} ({total} seats)</span>
                      </p>
                    )}
                  </div>

                  <div className="mt-4">
                    <div className="flex justify-between text-[11px] font-bold text-slate-400 mb-1">
                      <span>{sold} / {total} seats booked</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-2 bg-slate-900 border border-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-rose-600 to-amber-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-3 border-t border-slate-800/80">
                  <button
                    onClick={() => openEdit(s)}
                    className="px-3 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-white rounded-lg flex items-center space-x-1"
                  >
                    <FiEdit2 className="w-3 h-3 text-amber-400" />
                    <span>Edit</span>
                  </button>
                  <button
                    onClick={() => remove(s)}
                    className="px-3 py-1 bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-600 hover:text-white text-xs font-bold rounded-lg flex items-center space-x-1"
                  >
                    <FiTrash2 className="w-3 h-3" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {open && (
        <Modal title={editingId ? 'Edit Showtime Schedule' : 'Schedule New Showtime'} onClose={() => setOpen(false)}
          footer={<>
            <Btn variant="ghost" onClick={() => setOpen(false)}>Cancel</Btn>
            <Btn variant="success" onClick={save} disabled={saving}>
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Showtime'}
            </Btn>
          </>}>
          <div className="space-y-4">
            {formError && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs font-bold text-rose-300">
                {formError}
              </div>
            )}

            <Field label="Movie *" hint={editingId ? "Movie cannot be changed after creation." : undefined}>
              <select className={input} value={form.movie} onChange={set('movie')} disabled={!!editingId}>
                <option value="">-- Select Catalogue Movie --</option>
                {movies.filter((m) => m.is_active !== false).map((m) =>
                  <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Theatre Venue">
                <select className={input} value={form.theatre} onChange={set('theatre')}>
                  <option value="">-- No theatre --</option>
                  {theatres.map((t) => <option key={t.id} value={t.id}>{t.name} — {t.city}</option>)}
                </select>
              </Field>
              <Field label="Screen Number">
                <input type="number" min={1} className={input}
                  value={form.screen_number} onChange={set('screen_number')} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Start Time *">
                <input type="datetime-local" className={input} value={form.start_time} onChange={set('start_time')} />
              </Field>
              <Field label="Seat Price ($)">
                <input type="number" min={0} step="0.01" className={input} value={form.price} onChange={set('price')} />
              </Field>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
              <p className="text-xs font-bold text-amber-400 uppercase tracking-wider">Interactive Seat Layout</p>
              <div className="grid grid-cols-2 gap-4">
                <Field label={`Rows (Max ${MAX_ROWS})`}>
                  <input type="number" min={1} max={MAX_ROWS} className={input}
                    value={form.rows} onChange={set('rows')} />
                </Field>
                <Field label="Seats per Row">
                  <input type="number" min={1} className={input}
                    value={form.seats_per_row} onChange={set('seats_per_row')} />
                </Field>
              </div>

              {generatedSeats > 0 ? (
                <>
                  <p className="text-xs font-bold text-slate-300 mt-2">
                    Total: {generatedSeats} seats (A1 to {ROW_LETTERS[rows - 1]}{perRow})
                  </p>
                  <SeatPreview rows={rows} perRow={perRow} />
                </>
              ) : (
                <p className="text-xs text-rose-400 mt-2 font-semibold">Enter at least 1 row and 1 seat per row.</p>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

const SeatPreview = ({ rows, perRow }) => (
  <div className="mt-3 overflow-x-auto p-3 bg-slate-950 rounded-xl border border-slate-800">
    <div className="mx-auto mb-1 h-1 w-2/3 rounded-full bg-rose-500/40" />
    <p className="text-center text-[9px] font-extrabold tracking-widest text-slate-500 mb-3">SCREEN THIS WAY</p>
    {Array.from({ length: Math.min(rows, 8) }).map((_, r) => (
      <div key={r} className="flex items-center gap-1 mb-1 justify-center">
        <span className="w-4 text-[9px] font-bold text-slate-500">{ROW_LETTERS[r]}</span>
        {Array.from({ length: Math.min(perRow, 20) }).map((_, c) => (
          <span key={c} className="h-2.5 w-2.5 rounded-sm bg-rose-500/30 border border-rose-500/50" />
        ))}
        {perRow > 20 && <span className="text-[9px] text-slate-500">+{perRow - 20}</span>}
      </div>
    ))}
    {rows > 8 && <p className="text-[9px] text-slate-500 text-center mt-1">+{rows - 8} more rows</p>}
  </div>
);

export default ShowtimesSection;
