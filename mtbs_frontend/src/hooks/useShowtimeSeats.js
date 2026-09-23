/**
 * Live seat availability for one showtime.
 *
 * The server pushes the *whole* seat map on every change, never a delta, so a
 * socket that drops and comes back is correct from its first frame — there is
 * no replay to miss and no way to drift out of sync. That is also why a
 * reconnect needs no HTTP refetch: connecting is the refetch.
 *
 * Returns null for `bookedSeats` until the first frame arrives, so callers can
 * tell "nobody has booked" apart from "we don't know yet" and fall back to
 * whatever the HTTP response gave them.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { WS_ROOT } from '../api/axios';

// Back off on repeated failures so a dead server isn't hammered, but stay
// responsive to a brief blip. Capped, and the last value repeats forever.
const BACKOFF_MS = [1000, 2000, 5000, 10000, 20000];

export const useShowtimeSeats = (showtimeId) => {
  const [bookedSeats, setBookedSeats] = useState(null);
  const [seatsAvailable, setSeatsAvailable] = useState(null);
  const [live, setLive] = useState(false);

  const socketRef = useRef(null);
  const timerRef = useRef(null);
  const attemptRef = useRef(0);
  // Survives unmount so a reconnect scheduled mid-teardown doesn't fire.
  const closedRef = useRef(false);

  useEffect(() => {
    if (!showtimeId) return undefined;

    closedRef.current = false;

    const connect = () => {
      if (closedRef.current) return;

      let socket;
      try {
        socket = new WebSocket(
          `${WS_ROOT}showtimes/${showtimeId}/seats/`);
      } catch {
        scheduleReconnect();
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => {
        attemptRef.current = 0;
        setLive(true);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type !== 'seat_state') return;
          setBookedSeats(data.booked_seats || []);
          if (typeof data.seats_available === 'number') {
            setSeatsAvailable(data.seats_available);
          }
        } catch {
          // A frame we can't parse is not worth tearing the socket down for.
        }
      };

      socket.onclose = (event) => {
        setLive(false);
        // 4404 means this showtime doesn't exist. Retrying can't fix that.
        if (event.code === 4404 || event.code === 4400) return;
        scheduleReconnect();
      };

      // onclose always follows, so reconnecting is handled there.
      socket.onerror = () => {};
    };

    const scheduleReconnect = () => {
      if (closedRef.current) return;
      const wait = BACKOFF_MS[Math.min(attemptRef.current, BACKOFF_MS.length - 1)];
      attemptRef.current += 1;
      timerRef.current = setTimeout(connect, wait);
    };

    connect();

    return () => {
      closedRef.current = true;
      clearTimeout(timerRef.current);
      const socket = socketRef.current;
      if (socket) {
        // Drop the handler first: closing on purpose must not look like a drop
        // and trigger a reconnect for a component that's going away.
        socket.onclose = null;
        socket.close();
      }
      setLive(false);
    };
  }, [showtimeId]);

  /** Ask the server to resend — used when the tab comes back to the foreground. */
  const refresh = useCallback(() => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ action: 'refresh' }));
    }
  }, []);

  // A backgrounded tab can have its socket quietly killed, and browsers throttle
  // timers, so re-check the moment the user looks at the page again.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  return { bookedSeats, seatsAvailable, live, refresh };
};

export default useShowtimeSeats;
