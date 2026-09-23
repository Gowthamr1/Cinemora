import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AdminPanel from './AdminPanel';
import axios from '../api/axios';

// Factory mock: keeps Jest from loading the real axios module, which ships
// ESM that CRA's Jest config doesn't transform.
jest.mock('../api/axios', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

// Virtual: react-router-dom v7 is ESM-only via package "exports", which
// jest-resolve in CRA can't follow. The mock replaces it outright.
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }), { virtual: true });

const MOVIES = [
  { id: 1, title: 'Interstellar', genre: 'Sci-Fi', language: 'English',
    duration_minutes: 169, poster_url: 'http://x/p.jpg', release_date: '2014-11-07' },
  { id: 2, title: 'Second Film', genre: '', language: '', duration_minutes: null, poster_url: null },
];
const THEATRES = [
  { id: 1, name: 'PVR Central', city: 'Mumbai', address: 'Main St', total_screens: 4 },
];
const SHOWTIMES = [
  { id: 1, movie: MOVIES[0], theatre: THEATRES[0], screen_number: 2, start_time: '2030-01-01T18:30:00Z',
    total_seats: 50, seats_available: 31, price: '12.50', booked_seats: [14, 50],
    seat_layout: { rows: 5, seats_per_row: 10, row_labels: ['A', 'B', 'C', 'D', 'E'] } },
  { id: 2, movie: MOVIES[1], theatre: null, start_time: '2020-01-01T18:30:00Z',
    total_seats: 0, seats_available: 0, price: null, booked_seats: [] },
];
const BOOKINGS = [
  { id: 1, user: 'alice', showtime_title: 'Interstellar', start_time: '2030-01-01T18:30:00Z',
    num_seats: 2, seats: [14, 50], seat_labels: ['B4', 'E10'], status: 'CONFIRMED',
    status_display: 'Confirmed' },
  { id: 2, user: 'bob', showtime_title: 'Second Film', start_time: null,
    num_seats: 3, seats: [], status: 'CANCELLED', status_display: 'Cancelled',
    refund: { status: 'REFUNDED', status_display: 'Refunded', amount: 15 } },
];
const PAYMENTS = [
  { id: 1, user: 'alice', booking_id: 1, amount: '25.00', status: 'SUCCESS', timestamp: '2026-08-02T10:00:00Z' },
  { id: 2, user: 'bob', booking_id: 2, amount: '30.00', status: 'FAILED', timestamp: null },
];

const mockAll = () => {
  axios.get.mockImplementation((url) => {
    if (url === '/movies/') return Promise.resolve({ data: MOVIES });
    if (url === '/theatres/') return Promise.resolve({ data: THEATRES });
    if (url === '/showtimes/') return Promise.resolve({ data: SHOWTIMES });
    if (url === '/bookings/') return Promise.resolve({ data: BOOKINGS });
    if (url === '/payments/') return Promise.resolve({ data: { results: PAYMENTS } });
    return Promise.resolve({ data: [] });
  });
};

beforeEach(() => jest.clearAllMocks());

const openHome = async () => {
  mockAll();
  const view = render(<AdminPanel />);
  await waitFor(() => expect(screen.getByText('Admin Panel')).toBeInTheDocument());
  return view;
};

test('home screen shows a card per area with live counts', async () => {
  await openHome();

  ['Movies', 'Theatres', 'Showtimes', 'Bookings', 'Payments', 'Analytics']
    .forEach((label) => expect(screen.getByText(label)).toBeInTheDocument());

  // Only successful payments count toward revenue; cancelled bookings don't
  // count toward seats sold.
  expect(screen.getByText(/2 seats sold · \$25\.00 collected/)).toBeInTheDocument();
});

test('each section opens and comes back to the card grid', async () => {
  await openHome();

  for (const label of ['Movies', 'Theatres', 'Showtimes', 'Bookings', 'Payments']) {
    fireEvent.click(screen.getByText(label));
    // Section headers render as an h2, distinguishing them from the nav card.
    await waitFor(() => expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(label));
    fireEvent.click(screen.getByText('← Back'));
    await waitFor(() => expect(screen.getByText('Admin Panel')).toBeInTheDocument());
  }
});

test('the movie modal opens prefilled when editing', async () => {
  await openHome();
  fireEvent.click(screen.getByText('Movies'));
  await waitFor(() => expect(screen.getByText('+ Add Movie')).toBeInTheDocument());

  fireEvent.click(screen.getAllByText('Edit')[0]);
  await waitFor(() => expect(screen.getByText('Edit Movie')).toBeInTheDocument());
  expect(screen.getByDisplayValue('Interstellar')).toBeInTheDocument();
  expect(screen.getByDisplayValue('169')).toBeInTheDocument();
  expect(screen.getByDisplayValue('2014-11-07')).toBeInTheDocument();
});

test('adding a movie sends null for blank number and date fields', async () => {
  axios.post.mockResolvedValue({ data: {} });
  await openHome();
  fireEvent.click(screen.getByText('Movies'));
  await waitFor(() => expect(screen.getByText('+ Add Movie')).toBeInTheDocument());

  fireEvent.click(screen.getByText('+ Add Movie'));
  fireEvent.change(screen.getByPlaceholderText('e.g. Interstellar'), { target: { value: 'New One' } });
  fireEvent.click(screen.getByText('Add Movie'));

  await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/movies/',
    expect.objectContaining({ title: 'New One', duration_minutes: null, release_date: null })));
});

test('showtimes list renders seat progress, screen and layout', async () => {
  await openHome();
  fireEvent.click(screen.getByText('Showtimes'));
  await waitFor(() => expect(screen.getByText('+ Add Showtime')).toBeInTheDocument());

  // 50 total, 31 available -> 19 sold, and price formats from a string.
  expect(screen.getByText('19 / 50 seats sold')).toBeInTheDocument();
  expect(screen.getByText('💵 $12.50 / seat')).toBeInTheDocument();
  expect(screen.getByText(/Screen 2/)).toBeInTheDocument();
  expect(screen.getByText('🪑 5 rows × 10 (A1–E10)')).toBeInTheDocument();
  // A showtime with no theatre must not crash the card.
  expect(screen.getByText('No theatre set')).toBeInTheDocument();
  expect(screen.getByText('Past')).toBeInTheDocument();
});

test('creating a showtime sends the layout, not a raw seat count', async () => {
  axios.post.mockResolvedValue({ data: {} });
  await openHome();
  fireEvent.click(screen.getByText('Showtimes'));
  await waitFor(() => expect(screen.getByText('+ Add Showtime')).toBeInTheDocument());

  fireEvent.click(screen.getByText('+ Add Showtime'));
  fireEvent.change(screen.getByRole('combobox', { name: /Movie/ }), { target: { value: '1' } });
  fireEvent.change(screen.getByLabelText(/Start time/), { target: { value: '2030-05-01T19:30' } });
  fireEvent.change(screen.getByLabelText(/Rows/), { target: { value: '12' } });
  fireEvent.change(screen.getByLabelText(/Seats per row/), { target: { value: '20' } });

  // The builder shows the generated size before anything is saved.
  expect(screen.getByText(/= 240 seats, A1 to L20/)).toBeInTheDocument();

  // Scoped to the button: "Add Showtime" is also the modal's title.
  fireEvent.click(screen.getByRole('button', { name: 'Add Showtime' }));

  // total_seats is derived server-side from rows x seats_per_row.
  await waitFor(() => expect(axios.post).toHaveBeenCalledWith('/showtimes/',
    expect.objectContaining({ movie_id: '1', rows: 12, seats_per_row: 20, screen_number: 1, theatre_id: null })));
  expect(axios.post.mock.calls[0][1]).not.toHaveProperty('total_seats');
});

test('a schedule clash from the server is shown in the form', async () => {
  const clash = 'Screen 1 is already showing "Interstellar" from 01 Jan 06:30 PM to 09:34 PM.';
  axios.post.mockRejectedValue({ response: { data: { start_time: [clash] } } });
  await openHome();
  fireEvent.click(screen.getByText('Showtimes'));
  await waitFor(() => expect(screen.getByText('+ Add Showtime')).toBeInTheDocument());

  fireEvent.click(screen.getByText('+ Add Showtime'));
  fireEvent.change(screen.getByRole('combobox', { name: /Movie/ }), { target: { value: '1' } });
  fireEvent.change(screen.getByLabelText(/Start time/), { target: { value: '2030-01-01T19:00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add Showtime' }));

  // The modal stays open with the reason, rather than dropping an alert().
  await waitFor(() => expect(screen.getByText(clash)).toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Add Showtime' })).toBeInTheDocument();
});

test('bookings table shows seat labels and refund state', async () => {
  await openHome();
  fireEvent.click(screen.getByText('Bookings'));
  await waitFor(() => expect(screen.getByText('alice')).toBeInTheDocument());

  // Labels win over raw seat numbers when the show has a layout.
  expect(screen.getByText('B4, E10')).toBeInTheDocument();
  // Falls back to the count when the seat list is empty (legacy bookings).
  expect(screen.getByText('3')).toBeInTheDocument();
  expect(screen.getByText('Refunded · $15.00')).toBeInTheDocument();
});

test('payments section totals only successful payments', async () => {
  await openHome();
  fireEvent.click(screen.getByText('Payments'));
  await waitFor(() => expect(screen.getByText(/\$25\.00 collected/)).toBeInTheDocument());
  expect(screen.getByText('FAILED')).toBeInTheDocument();
});

test('a permission error surfaces instead of an empty panel', async () => {
  axios.get.mockRejectedValue({ response: { status: 403 } });
  render(<AdminPanel />);
  await waitFor(() => expect(screen.getByText('Admin access required.')).toBeInTheDocument());
});
