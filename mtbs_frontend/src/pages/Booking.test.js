import React from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import Booking from './Booking';
import axios from '../api/axios';

// Factory mock: keeps Jest from loading the real axios module, which ships
// ESM that CRA's Jest config doesn't transform. WS_ROOT is a named export the
// seat-socket hook reads, so the mock has to provide it too.
jest.mock('../api/axios', () => ({
  __esModule: true,
  WS_ROOT: 'ws://localhost:8000/ws/',
  default: { get: jest.fn(), post: jest.fn() },
}));

// Virtual: react-router-dom v7 is ESM-only via package "exports", which
// jest-resolve in CRA can't follow. The mock replaces it outright.
jest.mock('react-router-dom', () => ({
  useParams: () => ({ id: '7' }),
  useNavigate: () => jest.fn(),
}), { virtual: true });

/** Minimal stand-in for the browser WebSocket, so tests can drive the wire. */
class FakeSocket {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = FakeSocket.CONNECTING;
    this.sent = [];
    FakeSocket.instances.push(this);
  }

  send(data) { this.sent.push(data); }

  close() {
    this.readyState = FakeSocket.CLOSED;
    if (this.onclose) this.onclose({ code: 1000 });
  }

  // --- test-side controls ---
  open() {
    this.readyState = FakeSocket.OPEN;
    act(() => { if (this.onopen) this.onopen(); });
  }

  push(payload) {
    act(() => {
      if (this.onmessage) this.onmessage({ data: JSON.stringify(payload) });
    });
  }

  drop(code = 1006) {
    this.readyState = FakeSocket.CLOSED;
    act(() => { if (this.onclose) this.onclose({ code }); });
  }
}
FakeSocket.CONNECTING = 0;
FakeSocket.OPEN = 1;
FakeSocket.CLOSING = 2;
FakeSocket.CLOSED = 3;

const SHOWTIME = {
  id: 7,
  movie: { id: 1, title: 'Dune' },
  theatre: { id: 1, name: 'PVR Central', city: 'Mumbai' },
  screen_number: 2,
  start_time: '2030-05-01T18:30:00Z',
  total_seats: 20,
  seats_available: 18,
  price: '10.00',
  booked_seats: [1, 2],
  seat_layout: { rows: 2, seats_per_row: 10, row_labels: ['A', 'B'] },
};

const seatButton = (label) => screen.getByTitle(`Seat ${label}`);
const isTaken = (label) => seatButton(label).disabled;

const state = (overrides = {}) => ({
  type: 'seat_state',
  showtime: 7,
  booked_seats: [],
  total_seats: 20,
  seats_available: 20,
  ...overrides,
});

const socket = () => FakeSocket.instances[FakeSocket.instances.length - 1];

const showBooking = async () => {
  await act(async () => { render(<Booking />); });
  return socket();
};

beforeEach(() => {
  FakeSocket.instances = [];
  global.WebSocket = FakeSocket;
  axios.get.mockResolvedValue({ data: SHOWTIME });
});

test('the seat map falls back to the HTTP snapshot until the socket speaks', async () => {
  await showBooking();

  // Socket is open but has sent nothing yet — seats 1 and 2 come from the
  // showtime response, so the grid is never blank or wrongly empty.
  expect(isTaken('A1')).toBe(true);
  expect(isTaken('A2')).toBe(true);
  expect(isTaken('A3')).toBe(false);
  expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
});

test('the socket connects to this showtime and reports itself live', async () => {
  const ws = await showBooking();

  expect(ws.url).toBe('ws://localhost:8000/ws/showtimes/7/seats/');
  ws.open();
  expect(screen.getByText('Live')).toBeInTheDocument();
});

test('a seat someone else books goes taken without a refresh', async () => {
  const ws = await showBooking();
  ws.open();

  // The first frame is authoritative and replaces the HTTP snapshot.
  ws.push(state({ booked_seats: [5], seats_available: 19 }));

  expect(isTaken('A5')).toBe(true);
  expect(isTaken('A1')).toBe(false);   // freed since the page loaded
  expect(screen.getByText('19')).toBeInTheDocument();  // availability follows

  // Now somebody takes A9 while we're sitting here.
  ws.push(state({ booked_seats: [5, 9], seats_available: 18 }));
  expect(isTaken('A9')).toBe(true);
});

test('a seat taken out from under a selection is dropped, and said so', async () => {
  const ws = await showBooking();
  ws.open();
  ws.push(state());

  fireEvent.click(seatButton('A4'));
  fireEvent.click(seatButton('A6'));
  expect(screen.getByText('A4, A6')).toBeInTheDocument();

  // Someone else grabs A4 mid-selection.
  ws.push(state({ booked_seats: [4], seats_available: 19 }));

  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent(
      'Seat A4 was just booked by someone else.'));
  expect(screen.getByText('A6')).toBeInTheDocument();   // A4 dropped, A6 kept
  expect(isTaken('A4')).toBe(true);
});

test('a dropped connection stops claiming to be live and retries', async () => {
  jest.useFakeTimers();
  try {
    const ws = await showBooking();
    ws.open();
    expect(screen.getByText('Live')).toBeInTheDocument();

    ws.drop();
    expect(screen.getByText('Reconnecting…')).toBeInTheDocument();

    // Backoff is 1s for the first retry.
    act(() => { jest.advanceTimersByTime(1000); });
    expect(FakeSocket.instances).toHaveLength(2);

    // Reconnecting is the refetch: the fresh socket's opening frame is the
    // whole seat map, so a client that missed messages is correct again.
    const retry = socket();
    retry.open();
    retry.push(state({ booked_seats: [3, 4] }));
    expect(isTaken('A3')).toBe(true);
    expect(screen.getByText('Live')).toBeInTheDocument();
  } finally {
    jest.useRealTimers();
  }
});

test('a showtime the server rejects is not retried forever', async () => {
  jest.useFakeTimers();
  try {
    const ws = await showBooking();
    ws.drop(4404);   // no such showtime — retrying cannot fix it

    act(() => { jest.advanceTimersByTime(60000); });
    expect(FakeSocket.instances).toHaveLength(1);
  } finally {
    jest.useRealTimers();
  }
});
