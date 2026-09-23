import React from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
import ReviewsTab from './ReviewsTab';
import axios from '../../api/axios';

// Factory mock: keeps Jest from loading the real axios module, which ships
// ESM that CRA's Jest config doesn't transform.
jest.mock('../../api/axios', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

const MOVIE = { id: 1, slug: 'deadpool', title: 'Deadpool' };
const ME = { id: 7, username: 'raj' };

const review = (over = {}) => ({
  id: 1,
  username: 'arjun',
  movie: 1,
  movie_slug: 'deadpool',
  booking: 100,
  rating: 5,
  title: 'Loved it',
  comment: 'Best in the series.',
  contains_spoiler: false,
  helpful_count: 3,
  is_verified: true,
  user_has_voted_helpful: false,
  created_at: '2026-07-01T10:00:00Z',
  ...over,
});

const STATS = {
  average_rating: '4.30',
  total_reviews: 100,
  rating_distribution: { 5: 68, 4: 20, 3: 6, 2: 3, 1: 3 },
};

/** Wire the three GETs the tab fires on mount. */
const mockLoad = ({ reviews = [], stats = STATS, bookings = [] } = {}) => {
  axios.get.mockImplementation((url) => {
    if (url.includes('/stats/')) return Promise.resolve({ data: stats });
    if (url.includes('/reviewable/')) {
      return Promise.resolve({ data: { can_review: bookings.length > 0, bookings } });
    }
    return Promise.resolve({ data: reviews });
  });
};

const show = async (props = {}) => {
  await act(async () => {
    render(<ReviewsTab movie={MOVIE} currentUser={ME} {...props} />);
  });
};

beforeEach(() => jest.clearAllMocks());

test('the distribution reads as percentages, not raw counts', async () => {
  mockLoad({ reviews: [review()] });
  await show();

  expect(screen.getByText('4.3')).toBeInTheDocument();
  expect(screen.getByText('100 reviews')).toBeInTheDocument();
  expect(screen.getByText('68%')).toBeInTheDocument();
  expect(screen.getByText('20%')).toBeInTheDocument();
});

test('a spoiler stays collapsed until the reader asks for it', async () => {
  mockLoad({ reviews: [review({ contains_spoiler: true, comment: 'He dies at the end.' })] });
  await show();

  expect(screen.queryByText('He dies at the end.')).not.toBeInTheDocument();
  expect(screen.getByText('⚠ Contains spoilers')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Show Review' }));
  expect(screen.getByText('He dies at the end.')).toBeInTheDocument();
});

test('"Write a Review" only appears for someone with an unreviewed booking', async () => {
  mockLoad({ reviews: [review()] });
  await show();
  expect(screen.queryByRole('button', { name: /Write a Review/ })).not.toBeInTheDocument();

  await act(async () => {
    mockLoad({
      reviews: [review()],
      bookings: [{ id: 100, showtime: '2026-07-01T19:00:00Z', seats: ['A1'] }],
    });
    render(<ReviewsTab movie={MOVIE} currentUser={ME} />);
  });
  expect(screen.getByRole('button', { name: /Write a Review/ })).toBeInTheDocument();
});

test('sorting refetches from the server rather than reordering the page copy', async () => {
  mockLoad({ reviews: [review()] });
  await show();

  await act(async () => {
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'helpful' } });
  });

  expect(axios.get).toHaveBeenCalledWith('/movies/deadpool/reviews/?sort=helpful');
});

test('a helpful vote takes its new count from the server', async () => {
  mockLoad({ reviews: [review({ helpful_count: 3 })] });
  await show();

  axios.post.mockResolvedValue({
    data: review({ helpful_count: 4, user_has_voted_helpful: true }),
  });

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Helpful \(3\)/ }));
  });

  expect(axios.post).toHaveBeenCalledWith('/movies/deadpool/reviews/1/helpful/');
  expect(screen.getByRole('button', { name: /Helpful \(4\)/ })).toBeInTheDocument();
});

test('voting is not offered on your own review', async () => {
  mockLoad({ reviews: [review({ username: 'raj' })] });
  await show();

  expect(screen.queryByRole('button', { name: /Helpful/ })).not.toBeInTheDocument();
  expect(screen.getByText('👍 3 found this helpful')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
});

test('a signed-out reader sees the reviews but is offered no actions', async () => {
  mockLoad({ reviews: [review()] });
  await show({ currentUser: null });

  expect(screen.getByText('Loved it')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Helpful/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Write a Review/ })).not.toBeInTheDocument();
  // No point asking the API which bookings an anonymous reader could review.
  expect(axios.get).not.toHaveBeenCalledWith(expect.stringContaining('/reviewable/'));
});

test('a movie with no reviews says so instead of showing an empty average', async () => {
  mockLoad({
    reviews: [],
    stats: { average_rating: '0', total_reviews: 0, rating_distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } },
  });
  await show();

  expect(screen.getByText('No reviews yet.')).toBeInTheDocument();
  expect(screen.queryByText('0.0')).not.toBeInTheDocument();
});

test('paginated reviews load the next page when the sentinel scrolls into view', async () => {
  // jsdom has no IntersectionObserver. Capture the callback so the test can
  // fire it, standing in for the sentinel entering the viewport.
  let trigger;
  window.IntersectionObserver = class {
    constructor(cb) { trigger = cb; }
    observe() {}
    disconnect() {}
  };

  const page1 = {
    results: [review({ id: 1, title: 'First' })],
    next: 'http://localhost/movies/deadpool/reviews/?page=2&sort=newest',
  };
  const page2 = { results: [review({ id: 2, title: 'Second' })], next: null };

  axios.get.mockImplementation((url) => {
    if (url.includes('/stats/')) return Promise.resolve({ data: STATS });
    if (url.includes('/reviewable/')) return Promise.resolve({ data: { can_review: false, bookings: [] } });
    if (url.includes('page=2')) return Promise.resolve({ data: page2 });
    return Promise.resolve({ data: page1 });
  });

  await show();
  expect(screen.getByText('First')).toBeInTheDocument();
  expect(screen.queryByText('Second')).not.toBeInTheDocument();

  // Sentinel enters viewport → observer callback fires → page 2 appends.
  await act(async () => { trigger([{ isIntersecting: true }]); });

  expect(axios.get).toHaveBeenCalledWith('/movies/deadpool/reviews/?sort=newest&page=2');
  expect(screen.getByText('First')).toBeInTheDocument();
  expect(screen.getByText('Second')).toBeInTheDocument();
});
