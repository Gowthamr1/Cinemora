import React, { useState } from 'react';
import axios from '../../api/axios';
import StarRating from './StarRating';
import { FiThumbsUp, FiCheckCircle, FiEdit2, FiTrash2, FiAlertTriangle, FiUser } from 'react-icons/fi';

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString(undefined,
    { day: 'numeric', month: 'short', year: 'numeric' });

const ReviewCard = ({ review, currentUser, onChanged, onEdit }) => {
  const [revealed, setRevealed] = useState(false);
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState('');

  const isMine = currentUser?.username === review.username;
  const voted = review.user_has_voted_helpful;

  const vote = async () => {
    setVoting(true);
    setError('');
    try {
      const action = voted ? 'unhelpful' : 'helpful';
      const res = await axios.post(
        `/movies/${review.movie_slug || review.movie}/reviews/${review.id}/${action}/`);
      onChanged?.(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not register your vote.');
    } finally {
      setVoting(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Delete your review? This cannot be undone.')) return;
    try {
      await axios.delete(
        `/movies/${review.movie_slug || review.movie}/reviews/${review.id}/`);
      onChanged?.(null, review.id);
    } catch {
      setError('Could not delete the review.');
    }
  };

  const hidden = review.contains_spoiler && !revealed;

  return (
    <article className="glass-card p-5 rounded-2xl border border-slate-800 shadow-lg text-slate-100">
      <header className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-white text-sm flex items-center space-x-1.5">
              <FiUser className="w-3.5 h-3.5 text-rose-500" />
              <span>{review.username}</span>
            </span>
            {review.is_verified && (
              <span className="text-[10px] font-extrabold uppercase bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center space-x-1">
                <FiCheckCircle className="w-3 h-3 text-emerald-400" />
                <span>Verified Attendee</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2.5 mt-1.5">
            <StarRating value={review.rating} size="sm" />
            <span className="text-xs font-semibold text-slate-400">{formatDate(review.created_at)}</span>
          </div>
        </div>

        {isMine && (
          <div className="flex gap-2 shrink-0">
            <button onClick={() => onEdit?.(review)}
                    className="text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center space-x-1">
              <FiEdit2 className="w-3 h-3" />
              <span>Edit</span>
            </button>
            <button onClick={remove}
                    className="text-xs font-bold text-rose-400 hover:text-rose-300 flex items-center space-x-1">
              <FiTrash2 className="w-3 h-3" />
              <span>Delete</span>
            </button>
          </div>
        )}
      </header>

      {hidden ? (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-center my-3">
          <p className="text-xs font-bold text-amber-300 flex items-center justify-center space-x-1 mb-2">
            <FiAlertTriangle className="w-4 h-4 text-amber-400" />
            <span>Contains Plot Spoilers</span>
          </p>
          <button onClick={() => setRevealed(true)}
                  className="text-xs font-extrabold bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-1.5 rounded-lg shadow-md transition-all">
            Reveal Review Content
          </button>
        </div>
      ) : (
        <div className="space-y-1 my-2">
          {review.title && <h4 className="font-bold text-white text-base font-display">{review.title}</h4>}
          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed whitespace-pre-line">{review.comment}</p>
        </div>
      )}

      <footer className="mt-4 pt-3 border-t border-slate-800/80 flex items-center gap-3">
        {!isMine && currentUser && (
          <button
            onClick={vote}
            disabled={voting}
            className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all flex items-center space-x-1.5 disabled:opacity-50 ${
              voted
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <FiThumbsUp className={`w-3.5 h-3.5 ${voted ? 'text-rose-400' : ''}`} />
            <span>Helpful ({review.helpful_count})</span>
          </button>
        )}
        {(isMine || !currentUser) && review.helpful_count > 0 && (
          <span className="text-xs text-slate-400 font-semibold flex items-center space-x-1">
            <FiThumbsUp className="w-3.5 h-3.5 text-rose-500" />
            <span>{review.helpful_count} found this helpful</span>
          </span>
        )}
        {error && <span className="text-xs text-rose-400 font-semibold">{error}</span>}
      </footer>
    </article>
  );
};

export default ReviewCard;
