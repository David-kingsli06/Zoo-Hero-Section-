// Frame sequence storage in two tiers:
//   1. compressed files (Blobs): small enough to keep all of them
//   2. decoded bitmaps (~8.3 MB each at 1080p): only a window around the playhead
// Frames are addressed by one global, zero-based index across all scenes.

export interface FrameScene {
  folder: string;
  frameCount: number;
}

export interface FrameStoreOptions {
  scenes: FrameScene[];
  getUrl: (folder: string, frameNumber: number) => string;
  /** Hold `ready` until every frame has downloaded, for timed playback. */
  waitForAll?: boolean;
  /** Maximum number of decoded bitmaps kept in memory. */
  windowSize: number;
  /** Called whenever a new bitmap becomes drawable. */
  onDecoded: () => void;
  /** Called while the opening frames load; `ready` flips once they have settled. */
  onProgress: (percent: number, ready: boolean) => void;
}

const COARSE_STEP = 4;
const OPENING_FRAMES = 12; // coarse frames needed before `ready`, by default
const MAX_FETCHES = 6;
const MAX_DECODES = 4;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

export function createFrameStore({
  scenes,
  getUrl,
  waitForAll = false,
  windowSize,
  onDecoded,
  onProgress,
}: FrameStoreOptions) {
  const urls: string[] = [];
  const ranges = scenes.map(({ folder, frameCount }) => {
    const start = urls.length;
    for (let n = 1; n <= frameCount; n++) urls.push(getUrl(folder, n));
    return { start, end: urls.length - 1 };
  });
  const total = urls.length;

  const blobs = new Map<number, Blob>();
  const bitmaps = new Map<number, ImageBitmap>();
  const fetching = new Set<number>();
  const decoding = new Set<number>();
  const attempts = new Map<number, number>();
  const broken = new Set<number>(); // gave up: failed to fetch or decode
  const waiting = new Set<number>(); // backing off before a retry
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const abort = new AbortController();

  let playhead = 0;
  let direction = 1;
  let destroyed = false;
  let ready = false;
  let wanted: number[] = [];
  let wantedSet = new Set<number>();

  const sceneOf = (index: number) => {
    const found = ranges.findIndex((r) => index <= r.end);
    return found === -1 ? ranges.length - 1 : found;
  };

  // Download order, as passes over one scene. Every list is relative to the
  // scene currently on screen, so the queue re-prioritises after a jump.
  const buildQueue = (scene: number) => {
    const queue: number[] = [];
    const add = (s: number, step: number) => {
      const range = ranges[s];
      if (!range) return;
      for (let i = range.start; i <= range.end; i += step) queue.push(i);
      queue.push(range.end); // the last frame is what a scene boundary shows
    };
    add(scene, COARSE_STEP);
    add(scene + 1, COARSE_STEP);
    add(scene, 1);
    add(scene + 1, 1);
    add(scene - 1, 1);
    for (let s = 0; s < ranges.length; s++) add(s, COARSE_STEP);
    for (let s = 0; s < ranges.length; s++) add(s, 1);
    return queue;
  };
  const queues = ranges.map((_, s) => buildQueue(s));

  const needsFetch = (i: number) =>
    !blobs.has(i) && !fetching.has(i) && !broken.has(i) && !waiting.has(i);

  const opening: number[] = [];
  const openingStep = waitForAll ? 1 : COARSE_STEP;
  const openingLimit = waitForAll ? total : OPENING_FRAMES;
  const openingEnd = waitForAll ? total - 1 : ranges[0].end;
  for (let i = 0; i <= openingEnd && opening.length < openingLimit; i += openingStep) {
    opening.push(i);
  }

  const reportProgress = () => {
    if (ready) return;
    const settled = opening.filter((i) => blobs.has(i) || broken.has(i)).length;
    // Wait for something drawable, unless nothing could be loaded at all.
    const drawable = bitmaps.size > 0 || blobs.size === 0;
    ready = settled === opening.length && drawable;
    onProgress(Math.round((settled / opening.length) * 100), ready);
  };

  const pumpFetches = () => {
    if (destroyed) return;
    const queue = queues[sceneOf(playhead)];
    while (fetching.size < MAX_FETCHES) {
      // The frames about to be drawn come first, then the scene passes.
      const next = wanted.find(needsFetch) ?? queue.find(needsFetch);
      if (next === undefined) return;
      void fetchFrame(next);
    }
  };

  const fetchFrame = async (index: number) => {
    fetching.add(index);
    try {
      const response = await fetch(urls[index], { signal: abort.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      if (destroyed) return;
      blobs.set(index, blob);
      // A new file near the playhead belongs in the decode window right away.
      if (Math.abs(index - playhead) <= windowSize * COARSE_STEP) updateWindow();
    } catch {
      if (destroyed) return;
      const count = (attempts.get(index) ?? 0) + 1;
      attempts.set(index, count);
      if (count >= MAX_ATTEMPTS) {
        broken.add(index);
      } else {
        waiting.add(index);
        const timer = setTimeout(() => {
          timers.delete(timer);
          waiting.delete(index);
          pumpFetches();
        }, RETRY_DELAY_MS * count);
        timers.add(timer);
      }
    } finally {
      fetching.delete(index);
    }
    reportProgress();
    pumpDecodes();
    pumpFetches();
  };

  const pumpDecodes = () => {
    if (destroyed) return;
    for (const index of wanted) {
      if (decoding.size >= MAX_DECODES) return;
      const blob = blobs.get(index);
      if (blob && !bitmaps.has(index) && !decoding.has(index)) {
        void decodeFrame(index, blob);
      }
    }
  };

  const decodeFrame = async (index: number, blob: Blob) => {
    decoding.add(index);
    try {
      const bitmap = await createImageBitmap(blob);
      // The playhead may have moved away while this was decoding.
      if (destroyed || !wantedSet.has(index)) {
        bitmap.close();
      } else {
        bitmaps.set(index, bitmap);
        onDecoded();
      }
    } catch {
      blobs.delete(index);
      broken.add(index);
    } finally {
      decoding.delete(index);
    }
    if (destroyed) return;
    reportProgress();
    pumpDecodes();
  };

  // Rebuild the decode window: nearest first, two thirds of it in the direction
  // of travel. If a frame has not downloaded, the next downloaded one takes its
  // place, so coarse passes still animate.
  const updateWindow = () => {
    const ahead: number[] = [];
    const behind: number[] = [];
    const collect = (list: number[], step: number, limit: number) => {
      for (let i = playhead + step; i >= 0 && i < total && list.length < limit; i += step) {
        if (Math.abs(i - playhead) > windowSize * COARSE_STEP) break;
        if (blobs.has(i)) list.push(i);
      }
    };
    const aheadLimit = Math.floor(((windowSize - 1) * 2) / 3);
    collect(ahead, direction, aheadLimit);
    collect(behind, -direction, windowSize - 1 - aheadLimit);

    const next = [playhead];
    for (let k = 0; k < Math.max(ahead.length, behind.length); k++) {
      if (k < ahead.length) next.push(ahead[k]);
      if (k < behind.length) next.push(behind[k]);
    }
    // Until the playhead frame arrives, also request its immediate neighbours.
    if (!blobs.has(playhead)) {
      for (let k = 1; k < MAX_FETCHES; k++) {
        const i = playhead + k * direction;
        if (i >= 0 && i < total && !next.includes(i)) next.push(i);
      }
    }
    wanted = next;
    wantedSet = new Set(next);

    // Evict whatever fell outside the window, farthest first, but only as far as
    // needed: stale frames are still useful stand-ins while new ones decode.
    if (bitmaps.size > windowSize / 2) {
      const stale = [...bitmaps.keys()]
        .filter((i) => !wantedSet.has(i))
        .sort((a, b) => Math.abs(b - playhead) - Math.abs(a - playhead));
      const keep = Math.max(0, windowSize - wanted.length);
      for (const i of stale.slice(0, Math.max(0, stale.length - keep))) {
        bitmaps.get(i)?.close();
        bitmaps.delete(i);
      }
    }
  };

  const refresh = () => {
    updateWindow();
    pumpDecodes();
    pumpFetches();
  };

  return {
    start() {
      refresh();
    },

    setPlayhead(index: number) {
      if (destroyed || index === playhead) return;
      direction = index > playhead ? 1 : -1;
      playhead = index;
      refresh();
    },

    /**
     * The decoded frame closest to `index` within the same scene, so a gap never
     * shows footage from another stage. Null if that scene has nothing decoded.
     */
    getNearest(index: number): { index: number; bitmap: ImageBitmap } | null {
      const { start, end } = ranges[sceneOf(index)];
      let best = -1;
      for (const i of bitmaps.keys()) {
        if (i < start || i > end) continue;
        if (best === -1 || Math.abs(i - index) < Math.abs(best - index)) best = i;
      }
      const bitmap = bitmaps.get(best);
      return bitmap ? { index: best, bitmap } : null;
    },

    destroy() {
      destroyed = true;
      abort.abort();
      timers.forEach(clearTimeout);
      timers.clear();
      bitmaps.forEach((bitmap) => bitmap.close());
      bitmaps.clear();
      blobs.clear();
    },
  };
}

/** Decoded 1080p frames take about 8.3 MB each, so low-memory and touch devices keep fewer. */
export function getDecodeWindowSize() {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const constrained =
    (memory !== undefined && memory <= 4) ||
    window.matchMedia("(pointer: coarse)").matches;
  return constrained ? 12 : 24;
}
