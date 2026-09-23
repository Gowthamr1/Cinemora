/**
 * Pure helpers for the scroll-scrubbed frame sequence.
 *
 * Split out from the component so the arithmetic that decides *which* frame is
 * on screen — and how it is fitted to the canvas — can be tested without a
 * browser. The component keeps the side effects (fetch, decode, rAF, DOM).
 */

export const FRAME_COUNT = 241;

// The frames on disk are `1 (1).png` … `1 (241).png` — the names the exporter gave
// them. The space has to be percent-encoded for the URL; the parentheses are legal
// unencoded and are left alone so the path still reads like the filename.
export const frameSrc = (n) => `${process.env.PUBLIC_URL}/frames/1%20(${n}).png`;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * How far through the pinned section we are, 0 → 1.
 *
 * `top` is the section's `getBoundingClientRect().top`. The section is taller
 * than the viewport; the pinned child occupies one viewport, so the travel
 * available for scrubbing is `height - viewportH`. Progress is clamped, which
 * is what keeps frame 1 on screen above the section and frame 300 below it.
 */
export const sectionProgress = (top, height, viewportH) => {
  const travel = height - viewportH;
  if (!(travel > 0)) return 0;
  return clamp(-top / travel, 0, 1);
};

/** Progress → a 1-based frame number that can never leave [1, count]. */
export const frameIndex = (p, count = FRAME_COUNT) => {
  if (!Number.isFinite(p)) return 1;
  return clamp(Math.round(clamp(p, 0, 1) * (count - 1)) + 1, 1, count);
};

/**
 * `object-fit: cover` in numbers: the largest centred rect that covers the
 * destination while preserving the source's aspect ratio.
 */
export const coverRect = (sw, sh, dw, dh) => {
  if (!(sw > 0 && sh > 0)) return { x: 0, y: 0, w: dw, h: dh };
  const scale = Math.max(dw / sw, dh / sh);
  const w = sw * scale;
  const h = sh * scale;
  return { x: (dw - w) / 2, y: (dh - h) / 2, w, h };
};

/**
 * The best stand-in for `want` out of what is actually decoded — the nearest by
 * absolute distance. Every cached frame is a full-resolution decode, so the
 * stand-in is always *sharp*; it is just a frame or two behind where the scroll
 * has reached, which is the one degradation worth accepting. Returns null if
 * nothing usable is ready, in which case the caller must leave the canvas alone
 * rather than draw something unfinished.
 *
 * Bounded by `maxDistance` so we never show something wildly out of sequence.
 */
export const nearestAvailable = (want, has, count = FRAME_COUNT, maxDistance = 24) => {
  if (has(want)) return want;
  for (let d = 1; d <= maxDistance; d += 1) {
    const lo = want - d;
    const hi = want + d;
    // Ties break forward: scrolling down, the frame ahead is the truer one.
    if (hi <= count && has(hi)) return hi;
    if (lo >= 1 && has(lo)) return lo;
  }
  return null;
};

/**
 * Which frames to decode next, nearest-first so the frame under the playhead
 * always wins the race. Biased in the direction of travel — while scrolling
 * down, frames ahead are needed sooner than the ones already passed.
 */
export const prefetchOrder = (idx, radius, count = FRAME_COUNT, direction = 1) => {
  const ahead = direction >= 0 ? 1 : -1;
  const out = [];
  const push = (n) => {
    if (n >= 1 && n <= count && !out.includes(n)) out.push(n);
  };
  push(idx);
  for (let d = 1; d <= radius; d += 1) {
    push(idx + d * ahead);
    // Behind is still worth having — reverse scrolling must not stall — but at
    // half the reach, so the budget goes mostly where the user is heading.
    if (d * 2 <= radius) push(idx - d * ahead);
  }
  return out;
};

/**
 * How many decoded frames fit in the memory budget.
 *
 * Every cached frame is a full-resolution decode — 1920 × 1088 × 4 bytes, 8.4 MB —
 * because decoding *without* a resize is both the sharpest and, measured, the
 * fastest option available (see the note at the top of `FrameScrub.js`). So the
 * budget buys a rolling window rather than a complete sequence: 22 frames on
 * desktop, 8 on a phone, once the bounded PNG blob cache and the decodes in
 * flight have been taken out of the budget. The floor of 6 keeps the window from
 * collapsing to something that cannot cover a playhead and its neighbours.
 */
export const windowCapacity = (frameW, frameH, budgetBytes, min = 6, max = 64) =>
  clamp(Math.floor(budgetBytes / Math.max(1, frameW * frameH * 4)), min, max);

