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

describe('frame paths', () => {
  it('matches the names on disk, with the space encoded', () => {
    expect(frameSrc(1)).toMatch(/\/frames\/1%20\(1\)\.png$/);
    expect(frameSrc(241)).toMatch(/\/frames\/1%20\(241\)\.png$/);
  });

  it('does not zero-pad — the files are not padded', () => {
    expect(frameSrc(7)).not.toContain('007');
  });
});

describe('sectionProgress', () => {
  // A 5-viewport section pinned in a 1000px window: 4000px of travel.
  const p = (top) => sectionProgress(top, 5000, 1000);

  it('is 0 before the section reaches the top', () => {
    expect(p(500)).toBe(0);
    expect(p(0)).toBe(0);
  });

  it('tracks scroll linearly through the travel', () => {
    expect(p(-1000)).toBeCloseTo(0.25);
    expect(p(-2000)).toBeCloseTo(0.5);
    expect(p(-4000)).toBeCloseTo(1);
  });

  it('clamps past the end rather than overshooting', () => {
    expect(p(-6000)).toBe(1);
  });

  it('does not divide by zero when the section is shorter than the viewport', () => {
    expect(sectionProgress(-10, 500, 1000)).toBe(0);
  });
});

describe('frameIndex', () => {
  it('starts at frame 1 and ends at the last frame', () => {
    expect(frameIndex(0)).toBe(1);
    expect(frameIndex(1)).toBe(FRAME_COUNT);
  });

  it('cannot leave the valid range whatever the progress', () => {
    [-5, -0.1, 1.1, 99, NaN, Infinity].forEach((v) => {
      const n = frameIndex(v);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(FRAME_COUNT);
    });
  });

  it('is monotonic — scrolling forward never picks an earlier frame', () => {
    let prev = 0;
    for (let i = 0; i <= 100; i += 1) {
      const n = frameIndex(i / 100);
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
  });
});

describe('coverRect', () => {
  it('fills a wider box by overflowing top and bottom', () => {
    // 16:9 source into a 2:1 box — height spills, width fits exactly.
    const r = coverRect(1920, 1080, 1000, 500);
    expect(r.w).toBeCloseTo(1000);
    expect(r.h).toBeCloseTo(562.5);
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(-31.25); // centred, so the spill is split
  });

  it('fills a taller box by overflowing left and right', () => {
    // 16:9 source into a portrait box, as on a phone.
    const r = coverRect(1920, 1080, 400, 800);
    expect(r.h).toBeCloseTo(800);
    expect(r.w).toBeCloseTo(1422.22, 1);
    expect(r.y).toBeCloseTo(0);
  });

  it('preserves the source aspect ratio in every case', () => {
    [[1000, 500], [400, 800], [900, 900]].forEach(([dw, dh]) => {
      const r = coverRect(1920, 1080, dw, dh);
      expect(r.w / r.h).toBeCloseTo(1920 / 1080, 5);
      // …and always covers the destination.
      expect(r.w).toBeGreaterThanOrEqual(dw - 0.01);
      expect(r.h).toBeGreaterThanOrEqual(dh - 0.01);
    });
  });

  it('degrades to the destination box for a zero-sized source', () => {
    expect(coverRect(0, 0, 300, 200)).toEqual({ x: 0, y: 0, w: 300, h: 200 });
  });
});

describe('nearestAvailable', () => {
  it('prefers the exact frame', () => {
    expect(nearestAvailable(50, (n) => n === 50 || n === 49)).toBe(50);
  });

  it('falls back to the closest decoded frame', () => {
    expect(nearestAvailable(50, (n) => n === 47)).toBe(47);
  });

  it('breaks ties forward, in the direction of the sequence', () => {
    expect(nearestAvailable(50, (n) => n === 48 || n === 52)).toBe(52);
  });

  it('gives up rather than showing something wildly out of sequence', () => {
    expect(nearestAvailable(150, (n) => n === 1, FRAME_COUNT, 10)).toBeNull();
  });

  it('never runs off either end of the sequence', () => {
    expect(nearestAvailable(1, () => false, FRAME_COUNT, 5)).toBeNull();
    expect(nearestAvailable(FRAME_COUNT, (n) => n === FRAME_COUNT - 3)).toBe(FRAME_COUNT - 3);
  });
});

describe('prefetchOrder', () => {
  it('asks for the frame under the playhead first', () => {
    expect(prefetchOrder(100, 10)[0]).toBe(100);
  });

  it('leans the way the user is scrolling', () => {
    const down = prefetchOrder(100, 10, FRAME_COUNT, 1);
    const up = prefetchOrder(100, 10, FRAME_COUNT, -1);
    expect(down[1]).toBe(101);
    expect(up[1]).toBe(99);
    // Reverse scrolling must still be served, not just forward.
    expect(down).toContain(99);
    expect(up).toContain(101);
  });

  it('stays inside the sequence at the edges', () => {
    prefetchOrder(2, 20).forEach((n) => {
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(FRAME_COUNT);
    });
    prefetchOrder(FRAME_COUNT - 1, 20).forEach((n) => {
      expect(n).toBeLessThanOrEqual(FRAME_COUNT);
    });
  });

  it('never repeats a frame', () => {
    const order = prefetchOrder(150, 30);
    expect(new Set(order).size).toBe(order.length);
  });
});

describe('windowCapacity', () => {
  const NATIVE = [1920, 1088];
  const frameBytes = 1920 * 1088 * 4;

  it('fits as many full-resolution frames as the budget allows', () => {
    expect(windowCapacity(...NATIVE, 265e6)).toBe(31);
    // Phone: a much tighter budget, so a much shorter window.
    expect(windowCapacity(...NATIVE, 95e6)).toBe(11);
  });

  it('leaves headroom for the blobs and the decodes in flight', () => {
    // What FrameScrub passes: the device budget less the bounded blob cache and the
    // decode lanes that can be resolved-but-not-yet-evicted when the pump next runs.
    // The peak of all three is what has to stay inside the device budget.
    [[280e6, 45e6, 6, 22], [110e6, 20e6, 2, 8]].forEach(
      ([budget, blobBudget, lanes, expected]) => {
        const n = windowCapacity(...NATIVE, budget - blobBudget - lanes * frameBytes);
        expect(n).toBe(expected);
        expect((n + lanes) * frameBytes + blobBudget).toBeLessThanOrEqual(budget);
      });
  });

  it('never exceeds the budget it was given', () => {
    [1e6, 40e6, 95e6, 265e6, 600e6].forEach((budget) => {
      const n = windowCapacity(...NATIVE, budget, 0);
      expect(n * frameBytes).toBeLessThanOrEqual(budget);
    });
  });

  it('still yields a usable window when the budget is exhausted', () => {
    // A window of nothing would mean no frame is ever ready to show.
    expect(windowCapacity(...NATIVE, 1)).toBe(6);
  });

  it('does not grow without bound on an absurd budget', () => {
    expect(windowCapacity(...NATIVE, 999e9)).toBe(64);
  });
});
