/**
 * Generate Chrome Web Store assets:
 * - Icon 128x128
 * - Screenshot 1280x800
 */
import { createCanvas } from "@napi-rs/canvas";
import { writeFileSync, mkdirSync } from "node:fs";

const OUT = "store-assets";
mkdirSync(OUT, { recursive: true });

// --- Icon 128x128 ---
function generateIcon() {
  const size = 128;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  // Background - rounded square
  const r = 24;
  ctx.fillStyle = "#006efa";
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, r);
  ctx.fill();

  // Subtle gradient overlay
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, "rgba(255,255,255,0.12)");
  grad.addColorStop(1, "rgba(0,0,0,0.08)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, r);
  ctx.fill();

  // Download arrow
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const cx = size / 2;

  // Shaft
  ctx.beginPath();
  ctx.moveTo(cx, 26);
  ctx.lineTo(cx, 74);
  ctx.stroke();

  // Arrowhead
  ctx.beginPath();
  ctx.moveTo(cx - 24, 52);
  ctx.lineTo(cx, 74);
  ctx.lineTo(cx + 24, 52);
  ctx.stroke();

  // Base line
  ctx.beginPath();
  ctx.moveTo(28, 98);
  ctx.lineTo(100, 98);
  ctx.stroke();

  writeFileSync(`${OUT}/icon-128.png`, canvas.toBuffer("image/png"));
  console.log("✓ icon-128.png");
}

// --- Screenshot 1280x800 ---
function generateScreenshot() {
  const W = 1280;
  const H = 800;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Background - light grey
  ctx.fillStyle = "#f5f5f5";
  ctx.fillRect(0, 0, W, H);

  // Browser chrome bar
  ctx.fillStyle = "#e8e8e8";
  ctx.fillRect(0, 0, W, 72);
  ctx.fillStyle = "#ccc";
  ctx.fillRect(0, 72, W, 1);

  // Tab
  ctx.fillStyle = "#fff";
  roundRect(ctx, 12, 8, 240, 36, 8);
  ctx.fill();
  ctx.fillStyle = "#444";
  ctx.font = "13px sans-serif";
  ctx.fillText("Week 2 Lecture - Canvas LMS", 24, 31);

  // URL bar
  ctx.fillStyle = "#fff";
  roundRect(ctx, 12, 48, W - 24, 20, 6);
  ctx.fill();
  ctx.fillStyle = "#888";
  ctx.font = "11px monospace";
  ctx.fillText("https://university.instructure.com/courses/38646/pages/week-2-lecture", 20, 62);

  // Extension icon (active) in toolbar
  ctx.fillStyle = "#006efa";
  roundRect(ctx, W - 48, 48, 20, 20, 4);
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(W - 38, 54);
  ctx.lineTo(W - 38, 62);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(W - 42, 59);
  ctx.lineTo(W - 38, 63);
  ctx.lineTo(W - 34, 59);
  ctx.stroke();

  // Page content area
  const contentY = 100;

  // Page title
  ctx.fillStyle = "#222";
  ctx.font = "bold 28px sans-serif";
  ctx.fillText("Week 2 Lecture: Machine Learning Basics", 60, contentY + 40);

  // Two-column layout header
  const colW = 540;
  const colX1 = 60;
  const colX2 = 640;
  const headerY = contentY + 70;

  // Column headers
  ctx.fillStyle = "#e91e63";
  ctx.fillRect(colX1, headerY, colW, 3);
  ctx.fillRect(colX2, headerY, colW, 3);

  ctx.fillStyle = "#666";
  ctx.fillRect(colX1, headerY + 3, colW, 32);
  ctx.fillRect(colX2, headerY + 3, colW, 32);

  ctx.fillStyle = "#fff";
  ctx.font = "bold 13px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Lecture Slides", colX1 + colW / 2, headerY + 23);
  ctx.fillText("Lecture Recording", colX2 + colW / 2, headerY + 23);
  ctx.textAlign = "left";

  // Left column - PDF
  const pdfY = headerY + 48;
  ctx.fillStyle = "#fff";
  ctx.fillRect(colX1, pdfY, colW, 280);
  ctx.strokeStyle = "#ddd";
  ctx.lineWidth = 1;
  ctx.strokeRect(colX1, pdfY, colW, 280);

  ctx.fillStyle = "#444";
  ctx.font = "15px sans-serif";
  ctx.fillText("Machine Learning Basics &", colX1 + 80, pdfY + 140);
  ctx.fillText("Introduction to Image Processing", colX1 + 60, pdfY + 162);

  ctx.fillStyle = "#1976d2";
  ctx.font = "13px sans-serif";
  ctx.fillText("📄 Week2-Lecture-2026.pdf  ⬇", colX1 + 130, pdfY + 200);

  // Right column - Video player
  const vidY = headerY + 48;
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(colX2, vidY, colW, 280);

  // Video thumbnail content
  ctx.fillStyle = "#2a2a2a";
  ctx.fillRect(colX2, vidY, colW, 250);

  // Fake video content
  ctx.fillStyle = "#e53935";
  ctx.fillRect(colX2 + 20, vidY + 20, 40, 3);

  ctx.fillStyle = "#fff";
  ctx.font = "bold 20px sans-serif";
  ctx.fillText("42028: Deep Learning and", colX2 + 20, vidY + 55);
  ctx.fillText("Convolutional Neural Network", colX2 + 20, vidY + 80);

  ctx.font = "bold 16px sans-serif";
  ctx.fillText("Week-2 Lecture", colX2 + 20, vidY + 130);
  ctx.font = "14px sans-serif";
  ctx.fillText("Machine Learning and", colX2 + 20, vidY + 152);
  ctx.fillText("Image Processing Basics", colX2 + 20, vidY + 170);

  // Play button
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.beginPath();
  ctx.arc(colX2 + colW / 2 + 60, vidY + 120, 35, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(colX2 + colW / 2 + 48, vidY + 105);
  ctx.lineTo(colX2 + colW / 2 + 78, vidY + 120);
  ctx.lineTo(colX2 + colW / 2 + 48, vidY + 135);
  ctx.closePath();
  ctx.fill();

  // Player controls bar
  ctx.fillStyle = "#333";
  ctx.fillRect(colX2, vidY + 250, colW, 30);
  ctx.fillStyle = "#666";
  ctx.font = "11px sans-serif";
  ctx.fillText("▶  00:00 / 1:37:32", colX2 + 10, vidY + 269);

  // === THE DOWNLOAD OVERLAY (highlight) ===
  const btnX = colX2 + colW - 140;
  const btnY = vidY + 200;

  // Download button - pill shape
  ctx.fillStyle = "#006efa";
  roundRect(ctx, btnX, btnY, 120, 32, 16);
  ctx.fill();
  ctx.shadowColor = "rgba(0,0,0,0.3)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  roundRect(ctx, btnX, btnY, 120, 32, 16);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Download icon + text
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(btnX + 18, btnY + 10);
  ctx.lineTo(btnX + 18, btnY + 20);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(btnX + 13, btnY + 16);
  ctx.lineTo(btnX + 18, btnY + 21);
  ctx.lineTo(btnX + 23, btnY + 16);
  ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.font = "bold 12px sans-serif";
  ctx.fillText("Download", btnX + 32, btnY + 20);

  // Subtitle button below
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  roundRect(ctx, btnX + 18, btnY + 38, 102, 26, 13);
  ctx.fill();
  ctx.fillStyle = "#333";
  ctx.font = "bold 11px sans-serif";
  ctx.fillText("📝 Subtitle", btnX + 38, btnY + 55);

  // m3u8 copy button
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  roundRect(ctx, btnX + 48, btnY + 70, 72, 26, 13);
  ctx.fill();
  ctx.fillStyle = "#333";
  ctx.font = "bold 11px sans-serif";
  ctx.fillText("📋 m3u8", btnX + 60, btnY + 87);

  // Annotation arrow + label
  ctx.strokeStyle = "#e53935";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(btnX - 30, btnY + 16);
  ctx.lineTo(btnX - 100, btnY - 30);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "#e53935";
  ctx.font = "bold 14px sans-serif";
  ctx.fillText("One-click download", btnX - 240, btnY - 32);
  ctx.fillText("with quality selection", btnX - 240, btnY - 14);

  // Quality pills (shown state)
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  const qY = vidY + 155;

  roundRect(ctx, btnX - 10, qY, 56, 24, 12);
  ctx.fill();
  ctx.strokeStyle = "#006efa";
  ctx.lineWidth = 1.5;
  roundRect(ctx, btnX - 10, qY, 56, 24, 12);
  ctx.stroke();

  roundRect(ctx, btnX + 54, qY, 56, 24, 12);
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fill();
  ctx.strokeStyle = "#bbb";
  roundRect(ctx, btnX + 54, qY, 56, 24, 12);
  ctx.stroke();

  ctx.fillStyle = "#222";
  ctx.font = "bold 11px sans-serif";
  ctx.fillText("1080p", btnX + 2, qY + 16);
  ctx.fillText("720p", btnX + 68, qY + 16);

  // Bottom info text
  ctx.fillStyle = "#888";
  ctx.font = "13px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(
    "Kaltura Downloader — Download HLS videos and subtitles from Kaltura (KAF) players",
    W / 2,
    H - 30,
  );
  ctx.textAlign = "left";

  writeFileSync(`${OUT}/screenshot-1280x800.png`, canvas.toBuffer("image/png"));
  console.log("✓ screenshot-1280x800.png");
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

generateIcon();
generateScreenshot();
console.log(`\nAssets saved to ${OUT}/`);
