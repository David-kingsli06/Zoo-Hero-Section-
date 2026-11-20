/**
 * frameRenderer.ts
 *
 * Canvas-based frame renderer with cover-fit math, devicePixelRatio awareness,
 * and high-performance preloading with HTMLImageElement.decode().
 */

export interface CoverRect {
  dx: number;
  dy: number;
  dWidth: number;
  dHeight: number;
}

/**
 * Calculates cover-fit destination rectangle for drawing an image/frame onto a canvas
 * preserving aspect ratio without distortion.
 */
export function calculateCoverFit(
  contentWidth: number,
  contentHeight: number,
  containerWidth: number,
  containerHeight: number
): CoverRect {
  if (contentWidth === 0 || contentHeight === 0 || containerWidth === 0 || containerHeight === 0) {
    return { dx: 0, dy: 0, dWidth: containerWidth, dHeight: containerHeight };
  }

  const contentRatio = contentWidth / contentHeight;
  const containerRatio = containerWidth / containerHeight;

  let dWidth = containerWidth;
  let dHeight = containerHeight;
  let dx = 0;
  let dy = 0;

  if (containerRatio > contentRatio) {
    // Container is wider than content -> scale to container width
    dWidth = containerWidth;
    dHeight = containerWidth / contentRatio;
    dy = (containerHeight - dHeight) / 2;
  } else {
    // Container is taller than content -> scale to container height
    dHeight = containerHeight;
    dWidth = containerHeight * contentRatio;
    dx = (containerWidth - dWidth) / 2;
  }

  return { dx, dy, dWidth, dHeight };
}

/**
 * Resizes canvas taking into account devicePixelRatio for retina crispness.
 */
export function syncCanvasSize(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D
): { cssWidth: number; cssHeight: number; dpr: number } {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2); // Cap at 2 to balance memory and sharpness

  const targetWidth = Math.round(rect.width * dpr);
  const targetHeight = Math.round(rect.height * dpr);

  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }

  // Set transform to scale 1 css px = dpr canvas px
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  return { cssWidth: rect.width, cssHeight: rect.height, dpr };
}

/**
 * Draws a given image onto the canvas with cover-fit math.
 */
export function renderFrameToCanvas(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  img: HTMLImageElement
): void {
  if (!img || img.naturalWidth === 0) return;

  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  syncCanvasSize(canvas, context);

  const cover = calculateCoverFit(img.naturalWidth, img.naturalHeight, rect.width, rect.height);

  context.clearRect(0, 0, rect.width, rect.height);
  context.drawImage(img, cover.dx, cover.dy, cover.dWidth, cover.dHeight);
}

/**
 * Format frame number to 4 digits: e.g. 1 -> "0001"
 */
export function formatFrameNumber(index: number): string {
  return String(index).padStart(4, "0");
}

/**
 * Get frame path for a given folder and frame number (1-based)
 */
export function getFrameUrl(folderPath: string, frameNumber: number): string {
  return `${folderPath}/frame_${formatFrameNumber(frameNumber)}.webp`;
}

/**
 * Load a single image with async decode()
 */
export async function loadFrameImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = url;
  try {
    if ("decode" in img) {
      await img.decode();
    }
  } catch {
    // Decoding error or aborted, image element will still fallback on onload
  }
  return img;
}
