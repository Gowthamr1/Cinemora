import React, { useState } from 'react';
import axios from '../../api/axios';
import StarRating from './StarRating';
import { FiX, FiAlertCircle } from 'react-icons/fi';

const ReviewFormModal = ({ movie, bookings, onClose, onSubmitted, editingReview }) => {
  const [booking, setBooking] = useState(editingReview?.booking || bookings[0]?.id || '');
  const [rating, setRating] = useState(editingReview?.rating || 0);
  const [title, setTitle] = useState(editingReview?.title || '');
  const [comment, setComment] = useState(editingReview?.comment || '');
  const [spoiler, setSpoiler] = useState(editingReview?.contains_spoiler || false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!rating) {
      setError('Please select a rating.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        movie: movie.id,
        booking: Number(booking),
        rating,
        title,
        comment,
        contains_spoiler: spoiler,
      };

      let res;
      if (editingReview) {
        res = await axios.patch(
          `/movies/${movie.slug}/reviews/${editingReview.id}/`,
          payload);
      } else {
        res = await axios.post(`/movies/${movie.slug}/reviews/`, payload);
      }

      onSubmitted?.(res.data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not submit the review.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4"
         onClick={onClose}>
      <form onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="glass-panel border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl text-slate-100 space-y-5">
        <header className="flex items-center justify-between pb-3 border-b border-slate-800">
          <h3 className="text-xl font-bold font-display text-white">
            {editingReview ? 'Edit Your Review' : 'Write a Movie Review'}
          </h3>
          <button type="button" onClick={onClose}
                  className="text-slate-400 hover:text-white text-2xl leading-none">
            <FiX className="w-6 h-6" />
          </button>
        </header>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-bold rounded-xl p-3 flex items-center space-x-2">
            <FiAlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {!editingReview && bookings.length > 1 && (
          <div>
            <label className="block text-xs font-bold uppercase text-slate-300 mb-1.5">
              Select Show Booking *
            </label>
            <select value={booking} onChange={(e) => setBooking(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 focus:border-rose-500 text-white rounded-xl p-3 text-xs outline-none font-semibold">
              {bookings.map((b) => (
                <option key={b.id} value={b.id}>
                  {new Date(b.showtime).toLocaleString()} — Seats {b.seats.join(', ')}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold uppercase text-slate-300 mb-2">
            Rating *
          </label>
          <StarRating value={rating} onChange={setRating} size="lg" />
        </div>

        <div>
          <label className="block text-xs font-bold uppercase text-slate-300 mb-1.5">
            Review Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Summarize your opinion..."
            className="w-full bg-slate-900 border border-slate-800 focus:border-rose-500 text-white rounded-xl p-3 text-xs outline-none placeholder-slate-600"
            maxLength={200}
          />
        </div>

        <div>
          <label className="block text-xs font-bold uppercase text-slate-300 mb-1.5">
            Your Review *
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Share your thoughts on storyline, performance, sound, and visual experience..."
            rows={4}
            required
            className="w-full bg-slate-900 border border-slate-800 focus:border-rose-500 text-white rounded-xl p-3 text-xs outline-none placeholder-slate-600 resize-none"
          />
        </div>

        <div>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={spoiler}
              onChange={(e) => setSpoiler(e.target.checked)}
              className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-rose-600 focus:ring-rose-500"
            />
            <span>Contains plot spoilers</span>
          </label>
          <p className="text-[11px] text-slate-500 mt-1 ml-6">
            Reviews with spoilers start collapsed with a warning box so others can avoid spoilers.
          </p>
        </div>

        <footer className="flex gap-3 pt-3 border-t border-slate-800">
          <button
            type="submit"
            disabled={submitting || !rating || !comment.trim()}
            className="flex-1 py-3 bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-rose-600/20 transition-all disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : editingReview ? 'Save Changes' : 'Post Review'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-3 bg-slate-900 border border-slate-800 text-slate-300 hover:text-white text-xs font-bold rounded-xl"
          >
            Cancel
          </button>
        </footer>
      </form>
    </div>
  );
};

export default ReviewFormModal;
