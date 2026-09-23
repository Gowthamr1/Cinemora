import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import Analytics from './Analytics';
import axios from '../api/axios';

// Factory mock: keeps Jest from loading the real axios module, which ships
// ESM that CRA's Jest config doesn't transform.
jest.mock('../api/axios', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

const payload = {
  range_days: 30,
  summary: {
    total_revenue: 940.0, total_bookings: 20, active_bookings: 18, seats_sold: 93,
    occupancy_pct: 31.6, total_capacity: 250, seats_occupied: 79,
    avg_ticket_price: 10.0, avg_seats_per_booking: 5.17, cancellation_rate_pct: 10.0,
    total_movies: 3, total_theatres: 2, total_users: 2, upcoming_shows: 2,
  },
  revenue_series: [
    { date: '2026-08-01', revenue: 0, bookings: 0, seats: 0 },
    { date: '2026-08-02', revenue: 120.5, bookings: 2, seats: 5 },
    { date: '2026-08-03', revenue: 130, bookings: 3, seats: 13 },
  ],
  booking_stats: {
    by_status: { PENDING: 4, CONFIRMED: 14, CANCELLED: 2 },
    by_payment: { SUCCESS: 16 },
  },
  popular_movies: [
    { id: 1, title: 'Interstellar', genre: 'Sci-Fi', language: 'English',
      poster_url: 'http://x/p.jpg', bookings: 16, seats_sold: 87, revenue: 870 },
    { id: 2, title: 'Second Film', genre: 'Drama', language: '',
      poster_url: null, bookings: 2, seats_sold: 6, revenue: 10 },
  ],
  top_theatres: [
    { id: 1, name: 'PVR Central', city: 'Mumbai', bookings: 4, seats_sold: 40,
      revenue: 400, capacity: 50, occupancy_pct: 80 },
    { id: 2, name: 'Empty Hall', city: 'Yalanka', bookings: 0, seats_sold: 0,
      revenue: 0, capacity: 0, occupancy_pct: 0 },
  ],
};

const enhancedPayload = {
  range_weeks: 8,
  revenue_heatmap: [
    { weekday: 5, hour: 20, revenue: 300, seats: 30 },
    { weekday: 6, hour: 14, revenue: 120, seats: 12 },
  ],
  cancellation_trend: [
    { week: '2026-07-06', total: 10, cancelled: 1, expired: 0, cancellation_rate_pct: 10.0, released_rate_pct: 10.0 },
    { week: '2026-07-13', total: 8, cancelled: 2, expired: 1, cancellation_rate_pct: 25.0, released_rate_pct: 37.5 },
  ],
  review_sentiment: [
    { week: '2026-07-06', average_rating: 4.5, count: 4 },
    { week: '2026-07-13', average_rating: null, count: 0 },
  ],
  occupancy_forecast: {
    method: 'trailing_4_week_average',
    forecast_occupancy_pct: 62.5,
    weeks_observed: 4,
    upcoming_capacity: 200,
    projected_seats_filled: 125,
    history: [
      { week_start: '2026-07-09', capacity: 100, seats_filled: 50, occupancy_pct: 50.0 },
      { week_start: '2026-07-16', capacity: 100, seats_filled: 75, occupancy_pct: 75.0 },
    ],
  },
};

// The page fetches the dashboard and the enhanced endpoint together; route the
// mock by URL so each call gets its own shape.
const mockBoth = (dash = payload, enh = enhancedPayload) =>
  axios.get.mockImplementation((url) =>
    Promise.resolve({ data: url.includes('/enhanced/') ? enh : dash }));

test('renders every analytics section without crashing', async () => {
  mockBoth();
  const { container } = render(<Analytics />);

  await waitFor(() => expect(screen.getByText('Dashboard Analytics')).toBeInTheDocument());

  // The four requested charts are all present.
  expect(screen.getByText('Revenue Over Time')).toBeInTheDocument();
  expect(screen.getByText('Bookings Per Day')).toBeInTheDocument();
  expect(screen.getByText('Booking Statistics')).toBeInTheDocument();
  expect(screen.getByText('Popular Movies')).toBeInTheDocument();
  expect(screen.getByText('Occupancy By Theatre')).toBeInTheDocument();
  expect(screen.getByText('31.6%')).toBeInTheDocument();          // occupancy tile
  expect(screen.getAllByText(/PVR Central/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Interstellar/).length).toBeGreaterThan(0);

  // The enhanced sections render too.
  expect(screen.getByText('Revenue Heatmap')).toBeInTheDocument();
  expect(screen.getByText('Cancellation Rate Trend')).toBeInTheDocument();
  expect(screen.getByText('Review Sentiment Over Time')).toBeInTheDocument();
  expect(screen.getByText('Occupancy Forecast')).toBeInTheDocument();

  // The SVG chart actually drew a line path (not an empty/NaN path).
  const paths = container.querySelectorAll('svg path');
  expect(paths.length).toBeGreaterThan(0);
  paths.forEach((p) => expect(p.getAttribute('d')).not.toMatch(/NaN|Infinity/));

  // Bookings Per Day draws columns, and no bar geometry is NaN either.
  const rects = [...container.querySelectorAll('svg rect')].filter(
    (r) => r.getAttribute('fill') !== 'transparent');
  expect(rects.length).toBeGreaterThan(0);
  rects.forEach((r) => expect(r.getAttribute('height')).not.toMatch(/NaN|Infinity/));

  expect(screen.getByText('$940.00')).toBeInTheDocument();        // hero figure
});

test('every chart offers a table view so values are never colour-only', async () => {
  mockBoth();
  render(<Analytics />);

  await waitFor(() => expect(screen.getByText('Revenue Over Time')).toBeInTheDocument());

  // One toggle per chart card: the five dashboard charts plus the four
  // enhanced ones (heatmap, cancellation, sentiment, forecast).
  const toggles = screen.getAllByRole('button', { name: 'Table' });
  expect(toggles).toHaveLength(9);

  fireEvent.click(toggles[0]);
  expect(screen.getByRole('columnheader', { name: 'Revenue' })).toBeInTheDocument();
  expect(screen.getByText('$120.50')).toBeInTheDocument();
});


test('handles an empty database without crashing', async () => {
  const emptyDash = {
    range_days: 30,
    summary: {
      total_revenue: 0, total_bookings: 0, active_bookings: 0, seats_sold: 0,
      occupancy_pct: 0, total_capacity: 0, seats_occupied: 0, avg_ticket_price: 0,
      avg_seats_per_booking: 0, cancellation_rate_pct: 0, total_movies: 0,
      total_theatres: 0, total_users: 0, upcoming_shows: 0,
    },
    revenue_series: [{ date: '2026-08-03', revenue: 0, bookings: 0, seats: 0 }],
    booking_stats: { by_status: { PENDING: 0, CONFIRMED: 0, CANCELLED: 0 }, by_payment: {} },
    popular_movies: [],
    top_theatres: [],
  };
  const emptyEnhanced = {
    range_weeks: 8,
    revenue_heatmap: [],
    cancellation_trend: [{ week: '2026-08-03', total: 0, cancelled: 0, expired: 0, cancellation_rate_pct: 0, released_rate_pct: 0 }],
    review_sentiment: [{ week: '2026-08-03', average_rating: null, count: 0 }],
    occupancy_forecast: {
      method: 'trailing_4_week_average', forecast_occupancy_pct: 0, weeks_observed: 4,
      upcoming_capacity: 0, projected_seats_filled: 0, history: [],
    },
  };
  mockBoth(emptyDash, emptyEnhanced);
  const { container } = render(<Analytics />);

  await waitFor(() => expect(screen.getByText('Dashboard Analytics')).toBeInTheDocument());
  expect(screen.getByText(/No tickets sold yet/)).toBeInTheDocument();
  expect(screen.getByText(/No theatres added yet/)).toBeInTheDocument();
  // Empty enhanced data must render its own empty states, not crash.
  expect(screen.getByText(/the heatmap fills in as tickets sell/)).toBeInTheDocument();
  // Math.max over an empty list must not produce NaN in the bar widths.
  container.querySelectorAll('svg path').forEach(
    (p) => expect(p.getAttribute('d')).not.toMatch(/NaN|Infinity/)
  );
});

test('shows a clear message when a non-admin is blocked', async () => {
  axios.get.mockRejectedValue({ response: { status: 403 } });
  render(<Analytics />);
  await waitFor(() => expect(screen.getByText('Admin access required.')).toBeInTheDocument());
});
