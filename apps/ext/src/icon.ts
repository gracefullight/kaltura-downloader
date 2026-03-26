/**
 * Programmatic icon generation using OffscreenCanvas.
 * Draws a rounded-square with a download arrow.
 */

export function drawIcon(size: number): ImageData {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d")!;

  const r = size * 0.18;

  // Rounded rectangle background
  ctx.fillStyle = "#006efa";
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, r);
  ctx.fill();

  // Download arrow
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = Math.max(size * 0.1, 1.5);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const cx = size / 2;
  const top = size * 0.2;
  const tip = size * 0.58;
  const wing = size * 0.2;
  const baseY = size * 0.76;

  // Shaft
  ctx.beginPath();
  ctx.moveTo(cx, top);
  ctx.lineTo(cx, tip);
  ctx.stroke();

  // Arrowhead
  ctx.beginPath();
  ctx.moveTo(cx - wing, tip - wing);
  ctx.lineTo(cx, tip);
  ctx.lineTo(cx + wing, tip - wing);
  ctx.stroke();

  // Base line
  ctx.beginPath();
  ctx.moveTo(size * 0.22, baseY);
  ctx.lineTo(size * 0.78, baseY);
  ctx.stroke();

  return ctx.getImageData(0, 0, size, size);
}

export function createIconImageData(): Record<string, ImageData> {
  return {
    "16": drawIcon(16),
    "32": drawIcon(32),
    "48": drawIcon(48),
    "128": drawIcon(128),
  };
}
