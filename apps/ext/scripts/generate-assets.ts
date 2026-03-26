/**
 * Generate Chrome Web Store assets:
 * - Icon 128x128
 * - Screenshot 1280x800
 */
import { createCanvas } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const OUT = resolve(import.meta.dirname, "..", "assets");
mkdirSync(OUT, { recursive: true });

type Ctx = ReturnType<ReturnType<typeof createCanvas>["getContext"]>;

// --- Rounded rect helper ---
function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
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

// --- Mini download arrow icon (vector, no emoji) ---
function drawMiniArrow(ctx: Ctx, cx: number, cy: number, size: number) {
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle as string;
  ctx.lineWidth = Math.max(size * 0.15, 1.2);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const half = size / 2;
  // shaft
  ctx.beginPath();
  ctx.moveTo(cx, cy - half * 0.6);
  ctx.lineTo(cx, cy + half * 0.3);
  ctx.stroke();
  // head
  ctx.beginPath();
  ctx.moveTo(cx - half * 0.4, cy);
  ctx.lineTo(cx, cy + half * 0.4);
  ctx.lineTo(cx + half * 0.4, cy);
  ctx.stroke();
  // base
  ctx.beginPath();
  ctx.moveTo(cx - half * 0.5, cy + half * 0.7);
  ctx.lineTo(cx + half * 0.5, cy + half * 0.7);
  ctx.stroke();
  ctx.restore();
}

// --- Icon 128x128 ---
function generateIcon() {
  const size = 128;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  const r = 24;
  ctx.fillStyle = "#006efa";
  ctx.beginPath();
  roundRect(ctx, 0, 0, size, size, r);
  ctx.fill();

  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, "rgba(255,255,255,0.12)");
  grad.addColorStop(1, "rgba(0,0,0,0.08)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  roundRect(ctx, 0, 0, size, size, r);
  ctx.fill();

  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const cx = size / 2;

  ctx.beginPath();
  ctx.moveTo(cx, 26);
  ctx.lineTo(cx, 74);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - 24, 52);
  ctx.lineTo(cx, 74);
  ctx.lineTo(cx + 24, 52);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(28, 98);
  ctx.lineTo(100, 98);
  ctx.stroke();

  writeFileSync(`${OUT}/icon-128.png`, canvas.toBuffer("image/png"));
  console.log("  icon-128.png");
}

// --- Screenshot 1280x800 ---
function generateScreenshot() {
  const W = 1280;
  const H = 800;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#f5f5f5";
  ctx.fillRect(0, 0, W, H);

  // Browser chrome
  ctx.fillStyle = "#e8e8e8";
  ctx.fillRect(0, 0, W, 72);
  ctx.fillStyle = "#ccc";
  ctx.fillRect(0, 72, W, 1);

  // Tab
  ctx.fillStyle = "#fff";
  roundRect(ctx, 12, 8, 260, 36, 8);
  ctx.fill();
  ctx.fillStyle = "#444";
  ctx.font = "13px sans-serif";
  ctx.fillText("Week 2 Lecture - University LMS", 24, 31);

  // URL bar
  ctx.fillStyle = "#fff";
  roundRect(ctx, 12, 48, W - 24, 20, 6);
  ctx.fill();
  ctx.fillStyle = "#888";
  ctx.font = "11px monospace";
  ctx.fillText("https://university.example.edu/courses/12345/pages/week-2-lecture", 20, 62);

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

  // Page title
  const contentY = 100;
  ctx.fillStyle = "#222";
  ctx.font = "bold 28px sans-serif";
  ctx.fillText("Week 2 Lecture: Introduction to Deep Learning", 60, contentY + 40);

  // Lecture Recording header
  const vidX = 60;
  const vidW = W - 120;
  const headerY = contentY + 70;

  ctx.fillStyle = "#e91e63";
  ctx.fillRect(vidX, headerY, vidW, 3);
  ctx.fillStyle = "#666";
  ctx.fillRect(vidX, headerY + 3, vidW, 36);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 14px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Lecture Recording", vidX + vidW / 2, headerY + 26);
  ctx.textAlign = "left";

  // Video player - large
  const vidY = headerY + 52;
  const vidH = 480;
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(vidX, vidY, vidW, vidH);
  ctx.fillStyle = "#222";
  ctx.fillRect(vidX, vidY, vidW, vidH - 40);

  // Red accent bar
  ctx.fillStyle = "#e53935";
  ctx.fillRect(vidX + 40, vidY + 40, 60, 4);

  // Video title
  ctx.fillStyle = "#fff";
  ctx.font = "bold 30px sans-serif";
  ctx.fillText("Introduction to Deep Learning", vidX + 40, vidY + 90);
  ctx.font = "bold 22px sans-serif";
  ctx.fillText("Week 2 Lecture", vidX + 40, vidY + 180);
  ctx.font = "18px sans-serif";
  ctx.fillStyle = "#ccc";
  ctx.fillText("Neural Networks and Backpropagation Basics", vidX + 40, vidY + 210);

  // Play button
  const playCx = vidX + vidW / 2 + 140;
  const playCy = vidY + vidH / 2 - 30;
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.beginPath();
  ctx.arc(playCx, playCy, 50, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(playCx - 16, playCy - 24);
  ctx.lineTo(playCx + 22, playCy);
  ctx.lineTo(playCx - 16, playCy + 24);
  ctx.closePath();
  ctx.fill();

  // Controls bar
  ctx.fillStyle = "#333";
  ctx.fillRect(vidX, vidY + vidH - 40, vidW, 40);
  // Progress
  ctx.fillStyle = "#555";
  ctx.fillRect(vidX + 80, vidY + vidH - 22, vidW - 160, 4);
  ctx.fillStyle = "#006efa";
  ctx.fillRect(vidX + 80, vidY + vidH - 22, 200, 4);
  ctx.fillStyle = "#888";
  ctx.font = "12px sans-serif";
  ctx.fillText(">  12:34 / 1:37:32", vidX + 10, vidY + vidH - 15);

  // === Download overlay (bottom-right of player) ===
  const btnX = vidX + vidW - 155;
  const btnY = vidY + vidH - 160;

  // Download pill
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = "#006efa";
  roundRect(ctx, btnX, btnY, 130, 36, 18);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.fillStyle = "#fff";
  drawMiniArrow(ctx, btnX + 22, btnY + 18, 18);
  ctx.font = "bold 14px sans-serif";
  ctx.fillText("Download", btnX + 38, btnY + 23);

  // Subtitle button
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.shadowColor = "rgba(0,0,0,0.2)";
  ctx.shadowBlur = 6;
  roundRect(ctx, btnX + 20, btnY + 44, 110, 30, 15);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#333";
  ctx.font = "bold 12px sans-serif";
  ctx.fillText("CC  Subtitle", btnX + 40, btnY + 63);

  // m3u8 button
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.shadowColor = "rgba(0,0,0,0.2)";
  ctx.shadowBlur = 6;
  roundRect(ctx, btnX + 48, btnY + 80, 82, 30, 15);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#333";
  ctx.font = "bold 12px sans-serif";
  ctx.fillText("{ } m3u8", btnX + 60, btnY + 99);

  // Quality pills
  const qY = btnY - 40;
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.shadowColor = "rgba(0,0,0,0.15)";
  ctx.shadowBlur = 4;
  roundRect(ctx, btnX, qY, 62, 28, 14);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#006efa";
  ctx.lineWidth = 2;
  roundRect(ctx, btnX, qY, 62, 28, 14);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.shadowColor = "rgba(0,0,0,0.15)";
  ctx.shadowBlur = 4;
  roundRect(ctx, btnX + 70, qY, 62, 28, 14);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#bbb";
  ctx.lineWidth = 1.5;
  roundRect(ctx, btnX + 70, qY, 62, 28, 14);
  ctx.stroke();

  ctx.fillStyle = "#222";
  ctx.font = "bold 12px sans-serif";
  ctx.fillText("1080p", btnX + 12, qY + 18);
  ctx.fillText("720p", btnX + 84, qY + 18);

  // Annotation arrow
  ctx.strokeStyle = "#e53935";
  ctx.lineWidth = 2.5;
  ctx.setLineDash([8, 5]);
  ctx.beginPath();
  ctx.moveTo(btnX - 20, btnY + 18);
  ctx.lineTo(btnX - 140, btnY - 50);
  ctx.stroke();
  ctx.setLineDash([]);

  // Annotation label
  ctx.fillStyle = "#e53935";
  ctx.font = "bold 16px sans-serif";
  ctx.fillText("One-click download", btnX - 340, btnY - 56);
  ctx.fillText("with quality selection + subtitles", btnX - 340, btnY - 34);

  // Footer
  ctx.fillStyle = "#999";
  ctx.font = "13px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(
    "Kaltura Downloader -- Download HLS videos and subtitles from Kaltura (KAF) players",
    W / 2,
    H - 20,
  );
  ctx.textAlign = "left";

  writeFileSync(`${OUT}/screenshot-1280x800.png`, canvas.toBuffer("image/png"));
  console.log("  screenshot-1280x800.png");
}

generateIcon();
generateScreenshot();
console.log(`\nAssets saved to ${OUT}/`);
