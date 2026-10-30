import { Texture } from 'pixi.js';
import { BOARD_H, BOARD_W } from '../layout/geometry';

/** Gerador pseudoaleatório determinístico (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

const BOARD_SCALE = 1.25;

/** Placa de circuito provisória: máscara verde, textura, trilhas decorativas, furos e serigrafia. */
export function drawBoardCanvas(seed: number): HTMLCanvasElement {
  const W = Math.round(BOARD_W * BOARD_SCALE);
  const H = Math.round(BOARD_H * BOARD_SCALE);
  const [c, ctx] = canvas(W, H);
  const rand = rng(seed * 7919 + 17);
  ctx.scale(BOARD_SCALE, BOARD_SCALE);

  // Base com leve variação.
  const base = ctx.createLinearGradient(0, 0, BOARD_W, BOARD_H);
  base.addColorStop(0, '#0f4a38');
  base.addColorStop(0.5, '#0c4031');
  base.addColorStop(1, '#093428');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, BOARD_W, BOARD_H);
  const light = ctx.createRadialGradient(BOARD_W / 2, BOARD_H * 0.42, 50, BOARD_W / 2, BOARD_H * 0.45, BOARD_H * 0.75);
  light.addColorStop(0, 'rgba(70, 160, 120, 0.18)');
  light.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, BOARD_W, BOARD_H);

  // Trama da fibra de vidro.
  ctx.save();
  ctx.globalAlpha = 0.045;
  ctx.strokeStyle = '#9fe0c0';
  ctx.lineWidth = 1;
  for (let d = -BOARD_H; d < BOARD_W + BOARD_H; d += 9) {
    ctx.beginPath();
    ctx.moveTo(d, 0);
    ctx.lineTo(d - BOARD_H, BOARD_H);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(d - BOARD_H, 0);
    ctx.lineTo(d, BOARD_H);
    ctx.stroke();
  }
  ctx.restore();

  // Trilhas decorativas sob a máscara (apagadas, sem função).
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const ghost = (pts: [number, number][]) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = 'rgba(4, 26, 19, 0.55)';
    ctx.lineWidth = 9;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(60, 140, 100, 0.22)';
    ctx.lineWidth = 5;
    ctx.stroke();
    const [ex, ey] = pts[pts.length - 1]!;
    via(ex, ey, 0.55);
  };
  const via = (x: number, y: number, alpha: number) => {
    ctx.beginPath();
    ctx.arc(x, y, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(190, 150, 80, ${alpha})`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 2.8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(3, 15, 11, 0.9)';
    ctx.fill();
  };
  const sides: [number, number][] = [
    [22, 1],
    [BOARD_W - 22, -1],
  ];
  for (const [x0, dir] of sides) {
    for (let i = 0; i < 7; i++) {
      const y0 = 260 + rand() * 1100;
      const run = 30 + rand() * 60;
      const up = (rand() < 0.5 ? -1 : 1) * (40 + rand() * 120);
      ghost([
        [x0, y0],
        [x0 + dir * run * 0.3, y0],
        [x0 + dir * run, y0 + Math.sign(up) * run * 0.7],
        [x0 + dir * run, y0 + up],
      ]);
    }
  }
  for (let i = 0; i < 16; i++) via(30 + rand() * (BOARD_W - 60), 20 + rand() * (BOARD_H - 40), 0.18 + rand() * 0.15);
  ctx.restore();

  // Furos de fixação nos cantos.
  for (const [x, y] of [
    [34, 34],
    [BOARD_W - 34, 34],
    [34, BOARD_H - 34],
    [BOARD_W - 34, BOARD_H - 34],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x, y, 21, 0, Math.PI * 2);
    ctx.fillStyle = '#b8924c';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 17, 0, Math.PI * 2);
    ctx.fillStyle = '#d9b46a';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#04110c';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 27, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(235, 235, 220, 0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Serigrafia decorativa.
  ctx.save();
  ctx.fillStyle = 'rgba(235, 235, 220, 0.32)';
  ctx.font = '600 15px "Consolas", "Courier New", monospace';
  ctx.textAlign = 'right';
  ctx.fillText('PORTAS LÓGICAS  REV 1.0', BOARD_W - 62, BOARD_H - 24);
  ctx.textAlign = 'left';
  ctx.fillText(`PCB-${String(seed).padStart(3, '0')}`, 62, BOARD_H - 24);
  ctx.font = '600 13px "Consolas", "Courier New", monospace';
  ctx.fillStyle = 'rgba(235, 235, 220, 0.2)';
  const designators = ['R1', 'R7', 'C3', 'C12', 'D2', 'Q4', 'TP1', 'J2', 'L1', 'R22'];
  for (let i = 0; i < 6; i++) {
    const side = rand() < 0.5 ? 18 + rand() * 30 : BOARD_W - 50 - rand() * 30;
    ctx.fillText(designators[Math.floor(rand() * designators.length)]!, side, 300 + rand() * 1050);
  }
  ctx.restore();

  // Ruído fino.
  const img = ctx.getImageData(0, 0, W, H);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (rand() - 0.5) * 10;
    data[i] = Math.max(0, Math.min(255, data[i]! + n));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1]! + n));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2]! + n));
  }
  ctx.putImageData(img, 0, 0);

  // Borda chanfrada.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(BOARD_SCALE, BOARD_SCALE);
  ctx.strokeStyle = 'rgba(160, 230, 190, 0.18)';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, BOARD_W - 3, BOARD_H - 3);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, BOARD_W - 12, BOARD_H - 12);
  return c;
}

/** Brilho radial branco, para pulsos e auréolas (tingido com `tint`). */
export function glowTexture(): Texture {
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.25)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return Texture.from(c);
}

/** Lâmpada provisória (512×512), no mesmo enquadramento esperado dos sprites. */
export function lampTexture(on: boolean): Texture {
  return Texture.from(lampCanvas(on));
}

export function lampCanvas(on: boolean): HTMLCanvasElement {
  const [c, ctx] = canvas(512, 512);
  const cx = 256;

  // Vidro: bulbo + pescoço.
  const glass = new Path2D();
  glass.moveTo(cx - 70, 360);
  glass.bezierCurveTo(cx - 75, 300, cx - 150, 280, cx - 150, 190);
  glass.arc(cx, 190, 150, Math.PI, 0);
  glass.bezierCurveTo(cx + 150, 280, cx + 75, 300, cx + 70, 360);
  glass.closePath();

  ctx.save();
  if (on) {
    ctx.shadowColor = 'rgba(255, 210, 80, 0.95)';
    ctx.shadowBlur = 60;
    const g = ctx.createRadialGradient(cx, 200, 10, cx, 200, 170);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.25, '#fff7c2');
    g.addColorStop(0.7, '#ffd54f');
    g.addColorStop(1, '#ffb300');
    ctx.fillStyle = g;
  } else {
    const g = ctx.createRadialGradient(cx - 40, 150, 10, cx, 200, 170);
    g.addColorStop(0, 'rgba(230, 240, 245, 0.55)');
    g.addColorStop(0.6, 'rgba(150, 175, 185, 0.32)');
    g.addColorStop(1, 'rgba(90, 110, 120, 0.4)');
    ctx.fillStyle = g;
  }
  ctx.fill(glass);
  ctx.restore();
  ctx.lineWidth = 6;
  ctx.strokeStyle = on ? 'rgba(255, 245, 210, 0.95)' : 'rgba(215, 228, 232, 0.85)';
  ctx.stroke(glass);

  // Filamento.
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = on ? '#ffffff' : '#5b4636';
  ctx.lineWidth = 5;
  if (on) {
    ctx.shadowColor = '#fff3b0';
    ctx.shadowBlur = 25;
  }
  ctx.beginPath();
  ctx.moveTo(cx - 34, 360);
  ctx.lineTo(cx - 34, 230);
  ctx.moveTo(cx + 34, 360);
  ctx.lineTo(cx + 34, 230);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 34, 230);
  for (let i = 0; i <= 8; i++) ctx.lineTo(cx - 34 + (68 * i) / 8, i % 2 ? 212 : 232);
  ctx.lineWidth = on ? 6 : 4;
  ctx.stroke();
  ctx.restore();

  // Brilho no vidro.
  ctx.beginPath();
  ctx.arc(cx, 190, 118, Math.PI * 1.08, Math.PI * 1.38);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Base rosqueada.
  const metal = ctx.createLinearGradient(cx - 75, 0, cx + 75, 0);
  metal.addColorStop(0, '#6d6d6d');
  metal.addColorStop(0.35, '#f2f2f2');
  metal.addColorStop(0.6, '#bdbdbd');
  metal.addColorStop(1, '#5e5e5e');
  ctx.fillStyle = metal;
  ctx.beginPath();
  ctx.roundRect(cx - 74, 355, 148, 100, 14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(40, 40, 40, 0.65)';
  ctx.lineWidth = 4;
  for (let y = 377; y < 450; y += 19) {
    ctx.beginPath();
    ctx.moveTo(cx - 72, y);
    ctx.quadraticCurveTo(cx, y + 9, cx + 72, y);
    ctx.stroke();
  }
  ctx.fillStyle = '#2b2b2b';
  ctx.beginPath();
  ctx.moveTo(cx - 52, 455);
  ctx.lineTo(cx + 52, 455);
  ctx.lineTo(cx + 26, 490);
  ctx.lineTo(cx - 26, 490);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#c9a14a';
  ctx.beginPath();
  ctx.ellipse(cx, 494, 20, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  return c;
}
