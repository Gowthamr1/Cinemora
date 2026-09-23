import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from '../../api/axios';
import ReviewSummary from './ReviewSummary';
import ReviewCard from './ReviewCard';
import ReviewFormModal from './ReviewFormModal';
import { FiEdit3, FiFilter, FiMessageSquare } from 'react-icons/fi';

const SORTS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'highest', label: 'Highest Rated' },
  { value: 'lowest', label: 'Lowest Rated' },
  { value: 'helpful', label: 'Most Helpful' },
];

const ReviewsTab = ({ movie, currentUser, onStatsChange }) => {
  const [stats, setStats] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [sort, setSort] = useState('newest');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [nextPage, setNextPage] = useState(null);

  const [reviewableBookings, setReviewableBookings] = useState([]);
  const [editingReview, setEditingReview] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const sentinelRef = useRef(null);

  const slug = movie.slug;
  const username = currentUser?.username;

  const loadStats = useCallback(async () => {
    try {
      const res = await axios.get(`/movies/${slug}/reviews/stats/`);
      setStats(res.data);
      onStatsChange?.(res.data);
    } catch {
      /* Fallback silently */
    }
  }, [slug, onStatsChange]);

  const loadReviewable = useCallback(async () => {
    if (!username) {
      setReviewableBookings([]);
      return;
    }
    try {
      const res = await axios.get(`/movies/${slug}/reviews/reviewable/`);
      setReviewableBookings(res.data.bookings || []);
    } catch {
      setReviewableBookings([]);
    }
  }, [slug, username]);

  const pageFrom = (nextUrl) => {
    if (!nextUrl) return null;
    const page = new URL(nextUrl, window.location.origin).searchParams.get('page');
    return page ? Number(page) : null;
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await axios.get(`/movies/${slug}/reviews/?sort=${sort}`);
        if (cancelled) return;
        if (Array.isArray(res.data)) {
          setReviews(res.data);
          setNextPage(null);
        } else {
          setReviews(res.data.results || []);
          setNextPage(pageFrom(res.data.next));
        }
      } catch {
        if (!cancelled) setError('Could not load reviews.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [slug, sort]);

  const loadMore = useCallback(async () => {
    if (nextPage === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await axios.get(
        `/movies/${slug}/reviews/?sort=${sort}&page=${nextPage}`);
      const page = Array.isArray(res.data) ? res.data : res.data.results || [];
      setReviews((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...page.filter((r) => !seen.has(r.id))];
      });
      setNextPage(Array.isArray(res.data) ? null : pageFrom(res.data.next));
    } catch {
      /* Ignore pagination failure */
    } finally {
      setLoadingMore(false);
    }
  }, [slug, sort, nextPage, loadingMore]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || nextPage === null) return undefined;
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) loadMore();
    }, { rootMargin: '200px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore, nextPage]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadReviewable(); }, [loadReviewable]);

  const handleChanged = (updated, deletedId) => {
    if (deletedId) {
      setReviews((prev) => prev.filter((r) => r.id !== deletedId));
      loadStats();
      loadReviewable();
      return;
    }

    setReviews((prev) => {
      const i = prev.findIndex((r) => r.id === updated.id);
      if (i === -1) return [updated, ...prev];
      const next = [...prev];
      next[i] = updated;
      return next;
    });
  };

  const handleSubmitted = (review) => {
    const isNew = !reviews.some((r) => r.id === review.id);
    handleChanged(review);
    loadStats();
    loadReviewable();
    if (isNew && sort !== 'newest') setSort('newest');
  };

  const canReview = reviewableBookings.length > 0;

  return (
    <div className="space-y-6">
      <ReviewSummary stats={stats} />

      <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
        <div className="flex items-center space-x-2">
          <label htmlFor="review-sort" className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1">
            <FiFilter className="w-3.5 h-3.5" />
            <span>Sort Reviews</span>
          </label>
          <select
            id="review-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="bg-slate-900 border border-slate-800 text-white rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-rose-500"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        {canReview && (
          <button
            onClick={() => { setEditingReview(null); setShowModal(true); }}
            className="px-5 py-2.5 bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-rose-600/20 flex items-center space-x-2 transition-all"
          >
            <FiEdit3 className="w-4 h-4" />
            <span>Write a Review</span>
            {reviewableBookings.length > 1 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-black/20 text-[10px]">
                {reviewableBookings.length} eligible
              </span>
            )}
          </button>
        )}
      </div>

      {loading && (
        <div className="py-8 text-center text-slate-400 text-xs font-semibold">
          Loading audience reviews...
        </div>
      )}

      {error && (
        <p className="text-rose-400 font-bold text-xs text-center">{error}</p>
      )}

      {!loading && !error && reviews.length > 0 && (
        <div className="space-y-4">
          {reviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              currentUser={currentUser}
              onChanged={handleChanged}
              onEdit={(r) => { setEditingReview(r); setShowModal(true); }}
            />
          ))}
        </div>
      )}

      {nextPage !== null && <div ref={sentinelRef} className="h-4" />}

      {loadingMore && (
        <p className="text-center text-slate-400 text-xs font-semibold py-4">Loading more reviews...</p>
      )}

      {!loading && !error && reviews.length === 0 && (
        <div className="glass-panel p-12 text-center rounded-3xl border border-slate-800 text-slate-400">
          <FiMessageSquare className="w-10 h-10 text-slate-600 mx-auto mb-2" />
          <p className="font-bold text-white text-base">No reviews yet.</p>
          <p className="text-xs text-slate-500 mt-1">Be the first verified attendee to share your experience!</p>
        </div>
      )}

      {showModal && (
        <ReviewFormModal
          movie={movie}
          bookings={reviewableBookings}
          editingReview={editingReview}
          onClose={() => { setShowModal(false); setEditingReview(null); }}
          onSubmitted={handleSubmitted}
        />
      )}
    </div>
  );
};

export default ReviewsTab;
