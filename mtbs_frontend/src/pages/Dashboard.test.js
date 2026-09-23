import React from 'react';
import { act, render, screen, within, fireEvent, cleanup } from '@testing-library/react';
import Dashboard from './Dashboard';
import axios from '../api/axios';

// Factory mock: keeps Jest from loading the real axios module, which ships
// ESM that CRA's Jest config doesn't transform.
jest.mock('../api/axios', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));

// Virtual: react-router-dom v7 is ESM-only via package "exports", which
// jest-resolve in CRA can't follow. The mock replaces it outright — Link
// renders as a plain anchor so the View Ticket target is still assertable.
jest.mock('react-router-dom', () => ({
  Link: ({ to, children, ...rest }) => <a href={to} {...rest}>{children}</a>,
}), { virtual: true });

// The user object must be referentially stable: Dashboard's fetch effect
// depends on it, and a fresh literal each render would loop forever. The real
// context holds it in state, so this mirrors that.
jest.mock('../contexts/AuthContext', () => {
  const user = { id: 1, username: 'raj', role: 'USER' };
  return { useAuth: () => ({ user }) };
});

// The fetch resolves on a microtask, so flush it inside act() — otherwise
// React logs an "update not wrapped in act" warning for every assertion.
const show = async () => { await act(async () => { render(<Dashboard />); }); };

afterEach(cleanup);
beforeEach(() => jest.clearAllMocks());

const hoursFromNow = (h) => new Date(Date.now() + h * 3600 * 1000).toISOString();

const BOOKINGS = [
  { id: 1, showtime: 10, showtime_title: 'Oldest Film', start_time: hoursFromNow(-72),
    num_seats: 2, seats: [1, 2], seat_labels: ['A1', 'A2'], status: 'COMPLETED',
    status_display: 'Completed', payment_status: 'SUCCESS', amount: 24, amount_paid: 24,
    refund: { status: 'NONE', status_display: 'No refund', amount: 0 }, can_cancel: false },
  { id: 2, showtime: 11, showtime_title: 'Far Future Film', start_time: hoursFromNow(200),
    num_seats: 1, seats: [5], seat_labels: ['A5'], status: 'CONFIRMED',
    status_display: 'Confirmed', payment_status: 'SUCCESS', amount: 12, amount_paid: 12,
    theatre_name: 'PVR Central', screen_number: 2,
    refund: { status: 'NONE', status_display: 'No refund', amount: 0 }, can_cancel: true },
  { id: 3, showtime: 12, showtime_title: 'Soonest Film', start_time: hoursFromNow(5),
    num_seats: 3, seats: [7, 8, 9], seat_labels: ['A7', 'A8', 'A9'], status: 'CONFIRMED',
    status_display: 'Confirmed', payment_status: 'SUCCESS', amount: 30, amount_paid: 30,
    refund: { status: 'NONE', status_display: 'No refund', amount: 0 }, can_cancel: true },
  { id: 4, showtime: 13, showtime_title: 'Dropped Film', start_time: hoursFromNow(-10),
    num_seats: 1, seats: [3], seat_labels: ['A3'], status: 'CANCELLED',
    status_display: 'Cancelled', payment_status: 'SUCCESS', amount: 10, amount_paid: 0,
    refund: { status: 'REFUNDED', status_display: 'Refunded', amount: 10 }, can_cancel: false },
];

const titles = () =>
  screen.getAllByRole('heading', { level: 3 })
    .map((h) => h.textContent)
    .filter((t) => t.endsWith('Film'));

test('booking history is ordered latest first', async () => {
  axios.get.mockResolvedValue({ data: BOOKINGS });
  await show();

  // Far Future (+200h), Soonest (+5h), Dropped (-10h), Oldest (-72h).
  // "Next up" repeats the soonest upcoming show, so drop that leading entry.
  expect(titles().slice(1)).toEqual([
    'Far Future Film', 'Soonest Film', 'Dropped Film', 'Oldest Film',
  ]);
});

test('the dashboard summarises the account, not just the list', async () => {
  axios.get.mockResolvedValue({ data: BOOKINGS });
  await show();

  // Two future CONFIRMED bookings.
  expect(within(screen.getByText('Upcoming shows').closest('div'))
    .getByText('2')).toBeInTheDocument();
  // Seats across live bookings: 2 (completed) + 1 + 3; the cancelled one is out.
  expect(within(screen.getByText('Seats booked').closest('div'))
    .getByText('6')).toBeInTheDocument();
  // Spend is net of the refund on the cancelled booking: 24 + 12 + 30.
  expect(screen.getByText('$66.00')).toBeInTheDocument();
  expect(screen.getByText('$10.00 refunded back')).toBeInTheDocument();

  // The soonest upcoming show is called out on its own.
  expect(screen.getByText('Next up')).toBeInTheDocument();
  expect(screen.getAllByText('Soonest Film').length).toBe(2);
});

test('history can be narrowed to a single slice', async () => {
  axios.get.mockResolvedValue({ data: BOOKINGS });
  await show();

  fireEvent.click(screen.getByRole('button', { name: /Cancelled/ }));
  expect(titles().slice(1)).toEqual(['Dropped Film']);

  fireEvent.click(screen.getByRole('button', { name: /Upcoming/ }));
  expect(titles().slice(1)).toEqual(['Far Future Film', 'Soonest Film']);
});

test('an account with no bookings says so', async () => {
  axios.get.mockResolvedValue({ data: [] });
  await show();
  expect(screen.getByText('No bookings found')).toBeInTheDocument();
  expect(screen.getByText('Nothing booked ahead')).toBeInTheDocument();
  expect(screen.queryByText('Next up')).not.toBeInTheDocument();
});

// A played booking the backend marks reviewable, plus one already reviewed.
const REVIEW_BOOKINGS = [
  { id: 20, showtime: 30, showtime_title: 'Rateable Film', start_time: hoursFromNow(-48),
    num_seats: 2, seats: [1, 2], seat_labels: ['A1', 'A2'], status: 'COMPLETED',
    status_display: 'Completed', payment_status: 'SUCCESS', amount: 24, amount_paid: 24,
    refund: { status: 'NONE', status_display: 'No refund', amount: 0 }, can_cancel: false,
    movie: 5, movie_slug: 'rateable-film', can_review: true, review: null },
  { id: 21, showtime: 31, showtime_title: 'Reviewed Film', start_time: hoursFromNow(-96),
    num_seats: 1, seats: [4], seat_labels: ['A4'], status: 'COMPLETED',
    status_display: 'Completed', payment_status: 'SUCCESS', amount: 12, amount_paid: 12,
    refund: { status: 'NONE', status_display: 'No refund', amount: 0 }, can_cancel: false,
    movie: 6, movie_slug: 'reviewed-film', can_review: false,
    review: { id: 99, rating: 4, title: 'Solid', comment: 'Enjoyed it.', contains_spoiler: false } },
];

test('a played booking offers to rate the movie; a reviewed one offers to edit', async () => {
  axios.get.mockResolvedValue({ data: REVIEW_BOOKINGS });
  await show();

  expect(screen.getByRole('button', { name: /Rate this movie/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Edit review/ })).toBeInTheDocument();
});

test('rating a movie opens the review form and posts to the movie', async () => {
  axios.get.mockResolvedValue({ data: REVIEW_BOOKINGS });
  axios.post.mockResolvedValue({ data: { id: 1 } });
  await show();

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Rate this movie/ }));
  });

  // Modal opened with the rating picker.
  expect(screen.getByRole('button', { name: '5 stars' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '5 stars' }));
  fireEvent.change(screen.getByPlaceholderText(/What did you think/),
    { target: { value: 'Fantastic.' } });

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Submit Review' }));
  });

  expect(axios.post).toHaveBeenCalledWith(
    '/movies/rateable-film/reviews/',
    expect.objectContaining({ movie: 5, booking: 20, rating: 5 }));
});

test('editing a review opens the form pre-filled', async () => {
  axios.get.mockResolvedValue({ data: REVIEW_BOOKINGS });
  axios.patch.mockResolvedValue({ data: { id: 99 } });
  await show();

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Edit review/ }));
  });

  // Form opened with Save Changes button (not Submit Review).
  expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  });

  expect(axios.patch).toHaveBeenCalledWith(
    '/movies/reviewed-film/reviews/99/',
    expect.objectContaining({ rating: 4, booking: 21 }));
});
