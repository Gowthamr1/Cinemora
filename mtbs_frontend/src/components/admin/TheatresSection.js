import React, { useState } from 'react';
import axios from '../../api/axios';
import { Modal, Field, input, Btn, EmptyState, SectionHeader } from './ui';
import { FiMapPin, FiPlus, FiEdit2, FiTrash2 } from 'react-icons/fi';

const EMPTY = { name: '', city: '', address: '', total_screens: 1 };

const TheatresSection = ({ theatres, onBack, refresh }) => {
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const openNew = () => { setForm(EMPTY); setEditingId(null); setOpen(true); };

  const openEdit = (t) => {
    setEditingId(t.id);
    setForm({
      name: t.name || '', city: t.city || '',
      address: t.address || '', total_screens: t.total_screens || 1,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.city.trim()) return alert('Name and city are required.');
    setSaving(true);
    const payload = { ...form, total_screens: parseInt(form.total_screens, 10) || 1 };
    try {
      if (editingId) await axios.put(`/theatres/${editingId}/`, payload);
      else await axios.post('/theatres/', payload);
      setOpen(false);
      refresh();
    } catch (err) {
      alert('Could not save theatre: ' + JSON.stringify(err.response?.data || err.message));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t) => {
    if (!window.confirm(`Delete "${t.name}"? Its showtimes go with it.`)) return;
    try {
      await axios.delete(`/theatres/${t.id}/`);
      refresh();
    } catch {
      alert('Could not delete theatre.');
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Theatres & Venues" subtitle={`${theatres.length} registered venue${theatres.length === 1 ? '' : 's'}`}
        onBack={onBack}
        action={
          <button
            onClick={openNew}
            className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 shadow-lg shadow-rose-600/20 flex items-center space-x-2"
          >
            <FiPlus className="w-4 h-4" />
            <span>Add New Theatre</span>
          </button>
        }
      />

      {theatres.length === 0 ? (
        <EmptyState icon="🏢" title="No theatres registered"
          hint="Showtimes work better when they're tied to a venue."
          action={<Btn variant="success" onClick={openNew}>+ Add Theatre</Btn>} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {theatres.map((t) => (
            <div key={t.id} className="glass-card p-5 rounded-2xl border border-slate-800 shadow-lg flex flex-col justify-between space-y-4">
              <div>
                <div className="flex justify-between items-start">
                  <div className="min-w-0">
                    <h4 className="font-bold text-white text-base truncate">{t.name}</h4>
                    <p className="text-xs font-semibold text-rose-400 flex items-center space-x-1 mt-0.5">
                      <FiMapPin className="w-3 h-3" />
                      <span>{t.city}</span>
                    </p>
                  </div>
                  <span className="text-[10px] font-extrabold uppercase bg-slate-900 border border-slate-800 text-amber-400 px-2 py-1 rounded-lg shrink-0">
                    {t.total_screens} Screen{t.total_screens === 1 ? '' : 's'}
                  </span>
                </div>
                {t.address && <p className="text-xs text-slate-400 mt-2 line-clamp-2">{t.address}</p>}
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-800/80">
                <button
                  onClick={() => openEdit(t)}
                  className="px-3 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-white rounded-lg flex items-center space-x-1"
                >
                  <FiEdit2 className="w-3 h-3 text-amber-400" />
                  <span>Edit</span>
                </button>
                <button
                  onClick={() => remove(t)}
                  className="px-3 py-1 bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-600 hover:text-white text-xs font-bold rounded-lg flex items-center space-x-1"
                >
                  <FiTrash2 className="w-3 h-3" />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <Modal title={editingId ? 'Edit Theatre Venue' : 'Add New Theatre Venue'} onClose={() => setOpen(false)}
          footer={<>
            <Btn variant="ghost" onClick={() => setOpen(false)}>Cancel</Btn>
            <Btn variant="success" onClick={save} disabled={saving}>
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Theatre'}
            </Btn>
          </>}>
          <div className="space-y-4">
            <Field label="Theatre Name *">
              <input className={input} value={form.name} onChange={set('name')} placeholder="e.g. IMAX Central" />
            </Field>
            <Field label="City Location *">
              <input className={input} value={form.city} onChange={set('city')} placeholder="e.g. New York" />
            </Field>
            <Field label="Street Address">
              <textarea rows={2} className={input} value={form.address} onChange={set('address')} placeholder="123 Cinema Blvd..." />
            </Field>
            <Field label="Total Screens Count">
              <input type="number" min={1} className={input}
                value={form.total_screens} onChange={set('total_screens')} />
            </Field>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default TheatresSection;
