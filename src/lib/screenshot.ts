import { toPng } from 'html-to-image';

/**
 * Rasterize the current viewport to a PNG data URL for the snip tool. Skips any
 * element flagged `data-feedback-chrome` so the feedback UI doesn't capture
 * itself. DOM-based (no permission prompt), so it captures the app as-is.
 */
export async function captureViewport(): Promise<string> {
  return toPng(document.body, {
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    cacheBust: true,
    filter: (node) =>
      !(node instanceof HTMLElement && node.dataset?.feedbackChrome === 'true'),
  });
}
