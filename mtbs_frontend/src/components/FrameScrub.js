import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowRight, FiMousePointer } from 'react-icons/fi';
import {
  FRAME_COUNT,
  coverRect,
  frameIndex,
  frameSrc,
  nearestAvailable,
  prefetchOrder,
  sectionProgress,
  windowCapacity,
} from './frameScrubEngine';

// Scene captions keyed to scroll progress (0-1); boundaries sampled from the frames.
const SCENES = [
  { from: 0.0, to: 0.1, title: 'WELCOME TO THE PLAZA', text: 'Scroll to step inside.', hint: true },
  { from: 0.14, to: 0.32, title: 'THROUGH THE GLASS', text: 'Doors open. The show is close.' },
  { from: 0.38, to: 0.55, title: 'THE RED LOBBY', text: 'Velvet sofas, marble floors, the hum before the show.' },
  { from: 0.63, to: 0.8, title: 'INSIDE THE AUDITORIUM', text: 'Lights down. Find your seat.' },
  { from: 0.84, to: 0.93, title: 'CINEMA UNDER THE STARS', text: 'Every screen, every city.' },
  { from: 0.95, to: 1.01, title: 'CINEPASS', text: 'One pass. Every movie.', cta: true },
];

// Fade in over first 20% of a scene's range, out over the last 20%.
const fade = (p, from, to) => {
  if (p < from || p > to) return 0;
  const t = (p - from) / (to - from);
  return Math.min(1, Math.min(t, 1 - t) / 0.2);
};

/**
 * Why every cached frame is a full-resolution decode.
 *
 * The earlier version of this file kept two tiers of *downscaled* frames — a
 * complete 480px copy of the sequence plus a 960px window near the playhead — on
 * the assumption that a smaller decode is a cheaper decode, so a smaller frame was
 * the price of keeping up with a fast scroll. Measured on this machine, decoding
 * the same 1920×1080 JPEG out of an already-fetched blob:
 *
 *     createImageBitmap options        sequential      4 in flight
 *     none (native 1920×1080)          6.67 ms/150 fps   3.28 ms/305 fps
 *     resizeWidth 480,  'low'          8.14 ms/123 fps   4.17 ms/240 fps
 *     resizeWidth 960,  'low'          9.31 ms/107 fps          —
 *     resizeWidth 960,  'high'        19.46 ms/ 51 fps  16.12 ms/ 62 fps
 *     resizeWidth 1600, 'high'        20.38 ms/ 49 fps          —
 *
 * The assumption was simply wrong. The JPEG decode is the cheap part; the *resize*
 * is the expensive part, and it does not parallelise — four lanes of 960 'high'
 * buy 62 frames a second where four lanes of native buy 305. So every downscaled
 * tier was paying throughput *and* sharpness for nothing. A 1000 px/s scroll over
 * this section asks for ~83 frames a second; native decode supplies ~305.
 *
 * Hence one tier: a rolling window of native decodes around the playhead. Drawing
 * one into the 1432×900 canvas is a *downscale* — 0.06 ms with the high-quality
 * filter — so the frame on screen is now limited by the source image rather than by
 * anything this component does to it.
 *
 * The assets changed after that work: 241 PNGs at 1920×1088, ~1.78 MB each, 440 MB
 * for the sequence, replacing 300 JPEGs of ~50 KB. Re-measured here, PNG decode is
 * about three times the cost of JPEG and needs more lanes to cover a fast scroll:
 *
 *     lanes    1        2        4        6        8
 *     PNG   28.6 ms  14.9 ms  9.8 ms   7.4 ms   7.0 ms
 *            35 fps   67 fps  102 fps  136 fps  142 fps
 *
 * Six lanes it is on desktop (136 fps against the ~67 a 1000 px/s scroll asks for),
 * two on a phone, where there are fewer cores to spend and a much smaller budget to
 * hold the results in. The conclusion about resizing is unchanged and applies more
 * strongly: a resize would be added on top of an already dearer decode.
 *
 * The other consequence of 440 MB of source is that the sequence can no longer be
 * held as blobs — that alone would be 1.5× the whole memory budget — so the blob
 * cache is bounded and centred on the playhead too, and there is no global
 * "fetch everything in refinement order" pass any more. Frames the user scrolls
 * back to are re-fetched, which the browser's own HTTP cache makes cheap.
 *
 * What is deliberately *not* here any more: any downscaled stand-in. When the
 * frame the scroll asks for is not decoded yet, the canvas keeps the nearest frame
 * that is — sharp, a frame or two behind — and never draws a soft one. Falling a
 * frame behind for a moment is invisible; a soft frame is not.
 *
 * `createImageBitmap` rather than `new Image()` + `img.decode()`, for two reasons
 * measured here: `decode()` never settled at all while the document was hidden
 * (`createImageBitmap` kept resolving at 150 fps in the same document), and an
 * `HTMLImageElement`'s decoded form is owned by the browser, which may drop it
 * under memory pressure and re-decode lazily *at draw time* — the exact mechanism
 * that puts an unfinished image on screen. An `ImageBitmap` is resident until
 * `close()`, so "decoded" means decoded.
 */

// Eight fetches in flight saturates the connection without queueing so deeply that
// a jump's target waits behind frames the user has already left.
const MAX_FETCH = 8;

// How far paint will look for a stand-in. Beyond the window there is nothing to
// find, so this only has to cover the window itself.
const MAX_REACH = 40;

// Section height in viewports. One viewport is pinned, so 5 gives 4 viewports
// of travel to scrub 241 frames — roughly 60 frames per screen of scrolling.
const SECTION_VH = 5;

const isMobile = () => window.innerWidth < 768;

// Frames are decoded at their native 1920×1088, so what a frame costs in memory is
// fixed — 8.36 MB — and the budget buys a window length rather than a resolution.
const NATIVE_W = 1920;
const NATIVE_H = 1088;
const FRAME_BYTES = NATIVE_W * NATIVE_H * 4;

const budgetFor = () => (isMobile() ? 110e6 : 280e6);

// Decode lanes: 6 on desktop (136 fps measured, against the ~67 a brisk scroll
// asks for), 2 on a phone, which has fewer cores and far less room to hold the
// results. PNG decode scales with lanes right up to 6, unlike a resize.
const lanesFor = () => (isMobile() ? 2 : 6);

// The blob cache's share of the budget. The whole sequence is 440 MB of PNG, so it
// cannot be held — this buys ~25 frames' worth of source on desktop, ~11 on a phone,
// centred on the playhead like the decoded window. A blob is 4.7× cheaper than the
// bitmap it decodes to, which is what makes caching any of them worthwhile.
const blobBudgetFor = () => (isMobile() ? 20e6 : 45e6);

// `?frameDebug=1` puts the pipeline's state on screen: target frame, displayed
// frame, what is decoded around it, and the decode latency for the target. Off
// unless asked for, so nothing ships to a normal visitor.
const DEBUG = typeof window !== 'undefined'
  && /[?&]frameDebug=1/.test(window.location.search);

const supportsBitmap = typeof createImageBitmap === 'function';

/**
 * Decode one already-fetched blob to a frame that is ready to draw.
 *
 * No resize options: they are what made the old tiers both slower and softer (see
 * the note at the top of the file). `createImageBitmap` resolves only once the
 * pixels exist, off the main thread, and the result is resident until `close()` —
 * so a frame in the cache is genuinely drawable, not merely requested.
 */
const decodeFrame = async (blob) => {
  if (supportsBitmap) return createImageBitmap(blob);
  // No createImageBitmap: fall back to an <img>, and wait for a real decode rather
  // than for `load`, which only means the bytes arrived.
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  if (img.decode) {
    try {
      await img.decode();
    } catch {
      // Some engines reject `decode()` for an image that is not being rendered.
      // `load` is weaker evidence, but it is the only evidence left.
      await new Promise((resolve) => { img.onload = img.onerror = resolve; });
    }
  } else {
    await new Promise((resolve) => { img.onload = img.onerror = resolve; });
  }
  img.revokeUrl = url;
  return img;
};

// ImageBitmaps hold GPU/heap memory until closed — letting them fall out of the
// Map is not enough.
const release = (frame) => {
  if (!frame) return;
  if (typeof frame.close === 'function') frame.close();
  if (frame.revokeUrl) URL.revokeObjectURL(frame.revokeUrl);
};

const sourceSize = (frame) => ({
  w: frame.width || frame.naturalWidth || 0,
  h: frame.height || frame.naturalHeight || 0,
});

const FrameScrub = () => {
  const wrapRef = useRef(null);
  const pinRef = useRef(null);
  const canvasRef = useRef(null);
  const captionsRef = useRef(null);
  const debugRef = useRef(null);

  // The blob cache: index → source PNG bytes, bounded by `size.blobBudget` and
  // centred on the playhead. `blobBytesRef` is the running total, because a Map of
  // blobs cannot report its own weight and the whole sequence would be 440 MB.
  const blobsRef = useRef(new Map());
  const blobBytesRef = useRef(0);
  // The frame cache: index → decoded, drawable, native-resolution frame. A frame is
  // in here only once its pixels exist, which is what "ready" has to mean for the
  // paint policy below to be worth anything. "Loading" is `decodingRef`.
  const framesRef = useRef(new Map());

  const fetchingRef = useRef(new Set());
  const decodingRef = useRef(new Set());
  const abortRef = useRef(null);

  const progressRef = useRef(0);
  const lastIdxRef = useRef(1);
  const dirRef = useRef(1);
  const drawnRef = useRef('');
  const shownRef = useRef(0);
  const sizeRef = useRef({
    backingW: 0, backingH: 0, cap: 8, radius: 4, lanes: 4, blobBudget: 45e6,
  });
  // Diagnostics only: when the frame under the playhead was first asked for, and how
  // long it took to arrive.
  const statsRef = useRef({ askedAt: 0, askedFor: 0, latency: 0, drawAt: 0 });
  const [ready, setReady] = useState(false);

  /**
   * Resize the backing store to the CSS box × DPR. Returns true if it changed.
   *
   * The DPR is capped twice: at 2, as usual, and again at the point where the frame
   * would have to be *magnified* to cover the canvas. A 16:9 source cannot fill a
   * 750 × 1624 portrait backing store — it would need 2887 px of width and only has
   * 1920 — so asking for one buys upscale blur and a slower draw in exchange for
   * nothing. Cap the backing store instead and the browser's own compositor scales
   * the finished canvas up, which is the cheap place to do it. On a phone that means
   * 500 × 1080 with a cover scale of exactly 1.0; on desktop the cap never binds.
   */
  const syncCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    if (!cssW || !cssH) return false;
    const noMagnify = Math.min(NATIVE_W / cssW, NATIVE_H / cssH);
    const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.max(1, noMagnify));
    const w = Math.round(cssW * dpr);
    const h = Math.round(cssH * dpr);
    if (!w || !h) return false;
    const size = sizeRef.current;
    // The only thing that changes the backing store is the viewport. Every other
    // path through the rAF loop leaves the canvas alone.
    if (size.backingW === w && size.backingH === h) return false;

    // Assigning width/height clears the canvas, so the frame must be redrawn.
    canvas.width = w;
    canvas.height = h;
    size.backingW = w;
    size.backingH = h;
    // Frames are native-resolution, so the plan is just how many of them fit once the
    // blob cache and a full set of decode lanes have been taken out of the budget:
    // 22 on desktop, 8 on a phone. The window is centred on the playhead, biased the
    // way it is travelling, so the radius is a little under half of it.
    //
    // Counting *bytes*, not entries: a lane that has resolved but not yet been
    // evicted is as real as a cached frame, and it was exactly this distinction that
    // put an earlier version of this file 160 MB over its ceiling.
    size.lanes = lanesFor();
    size.blobBudget = blobBudgetFor();
    size.cap = windowCapacity(
      NATIVE_W, NATIVE_H, budgetFor() - size.blobBudget - size.lanes * FRAME_BYTES);
    size.radius = Math.max(2, Math.floor(size.cap / 2) - 1);
    drawnRef.current = '';
    return true;
  }, []);

  /**
   * Draw the frame the scroll is asking for — or, if it is not decoded yet, leave a
   * sharp frame on screen instead of a soft one.
   *
   * The policy, in order:
   *   1. the target frame is decoded → draw it;
   *   2. it is not → draw the nearest frame that *is* decoded, which is sharp and at
   *      most a frame or two out of step;
   *   3. nothing is decoded at all (the first moments after mount) → return without
   *      touching the canvas, and let the loading overlay stand.
   *
   * There is no fourth case, because there is nothing else in the cache to draw: no
   * downscaled tier, no placeholder, no partial decode. `clearRect` is never called
   * either, so whatever was last painted stays until something better replaces it.
   */
  const paint = useCallback((now) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    syncCanvasSize();
    const { backingW: w, backingH: h } = sizeRef.current;
    if (!w || !h) return;

    const want = frameIndex(progressRef.current, FRAME_COUNT);
    if (want !== lastIdxRef.current) {
      dirRef.current = want > lastIdxRef.current ? 1 : -1;
      lastIdxRef.current = want;
      const stats = statsRef.current;
      // Start the clock on the new target, for the diagnostics overlay.
      stats.askedFor = want;
      stats.askedAt = now;
      stats.latency = framesRef.current.has(want) ? 0 : -1;
    }

    const frames = framesRef.current;
    let use = want;
    let frame = frames.get(want);
    if (!frame) {
      const near = nearestAvailable(want, (n) => frames.has(n), FRAME_COUNT, MAX_REACH);
      // Nothing decoded yet: the canvas keeps whatever it had, which early on is
      // nothing at all — hence the overlay, which is still up until frame 1 lands.
      if (near == null) return;
      use = near;
      frame = frames.get(near);
    }

    const { w: sw, h: sh } = sourceSize(frame);
    if (!sw || !sh) return;
    const r = coverRect(sw, sh, w, h);

    // The draw is a downscale at every ordinary viewport — a 1920-wide frame covering
    // a 1432×900 canvas, or 500×1080 on a phone once the DPR cap in `syncCanvasSize`
    // has kept the backing store inside what the source can fill. A downscale is
    // where the high-quality filter both matters (a cheap one aliases, which reads as
    // noise of its own) and costs nothing: 0.21 ms against 0.005, measured.
    const token = `${use}:${w}x${h}`;
    if (drawnRef.current === token) return;
    drawnRef.current = token;

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // No clearRect: every frame covers the whole canvas, so clearing first would
    // only add a chance of showing background between the two operations.
    ctx.drawImage(frame, r.x, r.y, r.w, r.h);
    shownRef.current = use;

    const stats = statsRef.current;
    stats.drawAt = now;
    // Latency is measured to the moment the target actually reaches the canvas, not
    // to the moment its decode resolved.
    if (use === stats.askedFor && stats.latency < 0) stats.latency = now - stats.askedAt;
  }, [syncCanvasSize]);

  /** Imperative caption fades — scrubbing must not trigger React renders. */
  const paintCaptions = useCallback(() => {
    const captions = captionsRef.current;
    if (!captions) return;
    const p = progressRef.current;
    Array.from(captions.children).forEach((el, i) => {
      const s = SCENES[i];
      if (!s) return;
      const o = fade(p, s.from, s.to);
      if (el.dataset.o !== String(o)) {
        el.dataset.o = String(o);
        el.style.opacity = o;
        el.style.pointerEvents = o > 0.5 ? 'auto' : 'none';
      }
    });
  }, []);

  /**
   * Temporary instrumentation, on `?frameDebug=1` only.
   *
   * Written straight to a DOM node for the same reason the captions are: React state
   * per frame is exactly the thing this component must not do. Off by default, so it
   * costs one boolean test per tick in normal use.
   */
  const paintDebug = useCallback(() => {
    const el = debugRef.current;
    if (!el) return;
    const want = lastIdxRef.current;
    const frames = framesRef.current;
    const { latency } = statsRef.current;
    const { cap, radius, backingW, backingH } = sizeRef.current;
    const keys = [...frames.keys()].sort((a, b) => a - b);
    const lag = shownRef.current - want;
    el.textContent = [
      `target ${want}  shown ${shownRef.current}${lag ? ` (${lag > 0 ? '+' : ''}${lag})` : ' ✓'}`,
      `decoded ${frames.size}/${cap}  loading ${decodingRef.current.size}`,
      `window ${keys.length ? `${keys[0]}–${keys[keys.length - 1]}` : '—'}  radius ${radius}`,
      `blobs ${blobsRef.current.size} · ${(blobBytesRef.current / 1e6).toFixed(0)}/${(sizeRef.current.blobBudget / 1e6).toFixed(0)} MB  fetching ${fetchingRef.current.size}`,
      `latency ${latency < 0 ? 'pending' : `${latency.toFixed(0)} ms`}`,
      `held ${((frames.size * NATIVE_W * NATIVE_H * 4 + blobBytesRef.current) / 1e6).toFixed(0)} MB  lanes ${sizeRef.current.lanes}`,
      `canvas ${backingW}×${backingH}  frame ${NATIVE_W}×${NATIVE_H} of ${FRAME_COUNT}`,
    ].join('\n');
  }, []);

  /**
   * The blob for a frame, fetched from the network only when it is not already held.
   *
   * The cache is bounded (see `trimBlobs`), so this is not "fetched once, ever" any
   * more — 440 MB of PNG cannot all be resident. What it does guarantee is that
   * decoding never waits on the network for anything near the playhead, and that a
   * re-decode after eviction is a local read. A frame the user scrolls back to after
   * a long detour is re-fetched, and comes from the browser's HTTP cache.
   */
  const getBlob = useCallback(async (n, signal) => {
    const cached = blobsRef.current.get(n);
    if (cached) return cached;
    const res = await fetch(frameSrc(n), { signal });
    if (!res.ok) throw new Error(`frame ${n}: ${res.status}`);
    const blob = await res.blob();
    if (!blobsRef.current.has(n)) {
      blobsRef.current.set(n, blob);
      blobBytesRef.current += blob.size;
    }
    return blob;
  }, []);

  /**
   * Hold the blob cache inside its byte budget, dropping whatever is furthest from
   * the playhead. Byte-bounded rather than entry-bounded because a PNG's size varies
   * with the frame — a busy frame is nearly 2 MB, a dark one much less — so counting
   * entries would let a run of heavy frames walk straight through the ceiling.
   */
  const trimBlobs = useCallback((idx) => {
    const blobs = blobsRef.current;
    const budget = sizeRef.current.blobBudget;
    if (blobBytesRef.current <= budget) return;
    const furthestFirst = [...blobs.keys()].sort(
      (a, b) => Math.abs(b - idx) - Math.abs(a - idx));
    for (const n of furthestFirst) {
      if (blobBytesRef.current <= budget) break;
      // Never drop the bytes a decode in flight is reading from.
      if (decodingRef.current.has(n) || Math.abs(n - idx) <= 1) continue;
      blobBytesRef.current -= blobs.get(n).size;
      blobs.delete(n);
    }
  }, []);

  /**
   * Decode one frame into the cache. Nothing is ever created twice: `decodingRef`
   * holds the in-flight indices, and a frame already in the cache is skipped by the
   * caller, so a scroll back and forth over the same frames issues no work at all.
   */
  const decodeInto = useCallback(async (n, signal) => {
    if (decodingRef.current.has(n) || framesRef.current.has(n)) return;
    decodingRef.current.add(n);
    try {
      const blob = await getBlob(n, signal);
      const frame = await decodeFrame(blob);
      if (signal?.aborted) { release(frame); return; }
      framesRef.current.set(n, frame);
      // If this is the frame the playhead is on, let the next tick draw it over
      // whatever stand-in is up. This is step 5 of the policy: the target appears on
      // the first rAF after its decode finishes, not on some later change.
      if (n === lastIdxRef.current) drawnRef.current = '';
      // Any decoded frame is enough to retire the overlay: `paint` will show it, or
      // something nearer, from the very next tick.
      setReady(true);
    } catch {
      /* a dropped frame just means a stand-in is used a little longer */
    } finally {
      decodingRef.current.delete(n);
    }
  }, [getBlob]);

  /**
   * Keep a bounded ring of source bytes around the playhead.
   *
   * Reach is wider than the decode window — a blob is 4.7× cheaper than the bitmap it
   * becomes — so the bytes for the frames about to be decoded are usually already
   * local. `prefetchOrder` leans the way the user is travelling, which is what makes a
   * scrollbar jump survivable: frame 250's *bytes* are needed before anything at 250
   * can be decoded, and this asks for them first rather than working through the
   * frames in between.
   *
   * There is no global "fetch the whole sequence" pass. At 1.78 MB a frame the
   * sequence is 440 MB; holding it was possible when the frames were 50 KB JPEGs and
   * is not now.
   */
  const pumpFetches = useCallback((idx, signal) => {
    const blobs = blobsRef.current;
    const fetching = fetchingRef.current;
    trimBlobs(idx);
    if (blobBytesRef.current >= sizeRef.current.blobBudget) return;
    for (const n of prefetchOrder(idx, sizeRef.current.cap, FRAME_COUNT, dirRef.current)) {
      if (fetching.size >= MAX_FETCH) return;
      if (blobs.has(n) || fetching.has(n)) continue;
      fetching.add(n);
      getBlob(n, signal)
        .catch(() => { /* retried on a later pass */ })
        .finally(() => { fetching.delete(n); });
    }
  }, [getBlob, trimBlobs]);

  /**
   * Keep a rolling window of decoded frames around the playhead.
   *
   * `prefetchOrder` puts the target frame first and then leans the way the user is
   * travelling — N, N+1, N+2, N+3, N-1, N+4 … forwards, mirrored backwards — so the
   * decode lanes always spend themselves on the frame that is wanted now, followed by
   * the frames about to be wanted. Nothing between the old position and a jumped-to
   * one is decoded: the window simply recentres, so a jump from 100 to 180 decodes 180
   * immediately rather than working through 101…179.
   *
   * Frames outside the window are closed. That is the whole memory story — the cache
   * never holds more than `cap` frames, and every one of them is 8.36 MB.
   */
  const pumpDecodes = useCallback((idx, signal) => {
    const size = sizeRef.current;
    const frames = framesRef.current;
    const decoding = decodingRef.current;
    const free = () => size.lanes - decoding.size;

    if (frames.size > size.cap) {
      const furthestFirst = [...frames.keys()].sort(
        (a, b) => Math.abs(b - idx) - Math.abs(a - idx));
      for (const n of furthestFirst) {
        if (frames.size <= size.cap) break;
        if (Math.abs(n - idx) <= 1) continue; // never drop what is on screen
        release(frames.get(n));
        frames.delete(n);
      }
    }

    for (const n of prefetchOrder(idx, size.radius, FRAME_COUNT, dirRef.current)) {
      if (free() <= 0) return;
      if (frames.has(n)) continue;
      decodeInto(n, signal);
    }
  }, [decodeInto]);

  // Get something on screen before anything else: frame 1, then the last frame, so
  // both ends of the sequence are solid immediately.
  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;
    // The containers themselves live for the component's lifetime — only their
    // contents change — so holding them in locals is safe, and it is what the
    // cleanup needs to avoid reading a ref after unmount.
    const frames = framesRef.current;
    const blobs = blobsRef.current;
    const fetching = fetchingRef.current;
    const decoding = decodingRef.current;

    (async () => {
      await decodeInto(1, signal);
      if (!signal.aborted) await decodeInto(FRAME_COUNT, signal);
    })();

    return () => {
      controller.abort();
      frames.forEach(release);
      frames.clear();
      blobs.clear();
      blobBytesRef.current = 0;
      fetching.clear();
      decoding.clear();
    };
  }, [decodeInto]);

  /**
   * One rAF loop, gated on the section being near the viewport.
   *
   * Progress is read from the layout each frame rather than from a scroll
   * handler. That covers wheel, trackpad, touch, keyboard, anchor jumps and
   * momentum scrolling identically, does no work in the event path at all, and
   * cannot wedge the way a "one rAF in flight" latch does when the tab is
   * backgrounded and the pending frame is never delivered.
   */
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;
    let raf = 0;
    let running = false;
    let pumpAt = 0;

    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const rect = wrap.getBoundingClientRect();
      progressRef.current = sectionProgress(rect.top, rect.height, window.innerHeight);
      paint(now);
      paintCaptions();
      if (DEBUG) paintDebug();
      // Scheduling is cheap but not free, and 40 ms is still far more often than
      // decodes can complete.
      if (now - pumpAt > 40) {
        pumpAt = now;
        const signal = abortRef.current?.signal;
        pumpFetches(lastIdxRef.current, signal);
        pumpDecodes(lastIdxRef.current, signal);
      }
    };

    const start = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
      raf = 0;
    };

    // A viewport of slack either side: the loop is live just before the section
    // arrives, so the sequence is already loading by the time it is visible.
    const io = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? start() : stop()),
      { rootMargin: '100% 0px' });
    io.observe(wrap);

    // rAF is not delivered to hidden tabs. Restarting on the way back keeps the
    // loop from being left stopped by the browser rather than by us.
    const onVisible = () => { if (!document.hidden) { drawnRef.current = ''; start(); } };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisible);
      stop();
    };
  }, [paint, paintCaptions, paintDebug, pumpDecodes, pumpFetches]);

  /**
   * Pin height, measured once and re-measured only when the *width* changes.
   *
   * Mobile browsers change `innerHeight` as the URL bar hides, which with a
   * `100vh` box means the pinned viewport and the section around it resize
   * mid-scroll — a visible jump, and a progress value that shifts under the
   * user. Ignoring height-only changes holds the geometry still.
   */
  useEffect(() => {
    let lastWidth = 0;
    let retry = 0;
    const apply = () => {
      const el = wrapRef.current;
      const pin = pinRef.current;
      if (!el || !pin) return;
      const h = window.innerHeight;
      if (!(h > 0)) {
        // Prerender, a restored bfcache page, or an offscreen frame can report a
        // zero-height viewport. Writing that through would collapse the section
        // to nothing, so keep the vh fallback and look again next frame.
        cancelAnimationFrame(retry);
        retry = requestAnimationFrame(apply);
        return;
      }
      pin.style.height = `${h}px`;
      el.style.height = `${h * SECTION_VH}px`;
      drawnRef.current = '';
    };
    const onResize = () => {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      apply();
    };
    lastWidth = window.innerWidth;
    apply();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', apply);
    return () => {
      cancelAnimationFrame(retry);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', apply);
    };
  }, []);

  return (
    // The inline heights are replaced with pixel values on mount; the vh values
    // are the pre-hydration fallback so the section never starts at zero height.
    <section ref={wrapRef} className="relative w-full" style={{ height: `${SECTION_VH * 100}vh` }}>
      <div ref={pinRef} className="sticky top-0 w-full overflow-hidden bg-slate-950" style={{ height: '100vh' }}>
        <canvas ref={canvasRef} className="block w-full h-full" role="img" aria-label="Cinematic fly-through of the cinema" />

        {/* Scene captions */}
        <div ref={captionsRef} className="absolute inset-0">
          {SCENES.map((s, i) => (
            <div
              key={i}
              className="absolute inset-0 flex flex-col items-center justify-end pb-24 sm:pb-32 text-center px-4 pointer-events-none"
              style={{ opacity: 0 }}
            >
              {s.hint && (
                <div className="mb-6 flex items-center space-x-2 text-slate-300 text-xs sm:text-sm font-bold uppercase tracking-widest animate-bounce">
                  <FiMousePointer className="w-4 h-4 text-rose-400" />
                  <span>Scroll to enter</span>
                </div>
              )}
              <h2 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight text-white mb-4 font-display drop-shadow-2xl">
                {s.title}
              </h2>
              <p className="text-base sm:text-xl text-slate-200 max-w-2xl drop-shadow-lg">{s.text}</p>
              {s.cta && (
                <Link to="/movies" className="mt-8">
                  <span className="inline-flex items-center space-x-3 bg-gradient-to-r from-rose-600 via-rose-500 to-amber-500 text-white font-extrabold px-8 py-4 rounded-2xl text-lg shadow-xl shadow-rose-600/40 hover:shadow-rose-600/60 transition-all">
                    <span>Book Tickets Now</span>
                    <FiArrowRight className="w-6 h-6" />
                  </span>
                </Link>
              )}
            </div>
          ))}
        </div>

        {/* Temporary pipeline diagnostics — `?frameDebug=1`. */}
        {DEBUG && (
          <pre
            ref={debugRef}
            className="absolute top-4 left-4 z-20 m-0 px-3 py-2 rounded-lg bg-slate-950/80 text-emerald-300 text-[11px] leading-snug font-mono pointer-events-none whitespace-pre"
          />
        )}

        {/* Loading overlay until the first frame is drawable. Fades rather than
            cutting, so there is no hard switch from panel to image. */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-10 transition-opacity duration-500"
          style={{ opacity: ready ? 0 : 1, pointerEvents: 'none' }}
        >
          <div className="w-10 h-10 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">Entering the cinema…</p>
        </div>
      </div>
    </section>
  );
};

export default FrameScrub;
