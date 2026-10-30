import type { Point } from '../../src/core/types';
import type { BoardLayout } from '../../src/layout/autoLayout';
import { BOARD_H, BOARD_W, GATE_BODY_H, GATE_W } from '../../src/layout/geometry';

interface Seg {
  a: Point;
  b: Point;
  edge: string;
  source: string;
}

function segments(layout: BoardLayout): Seg[] {
  const out: Seg[] = [];
  for (const e of layout.edges) {
    for (let i = 1; i < e.points.length; i++) out.push({ a: e.points[i - 1]!, b: e.points[i]!, edge: e.id, source: e.from });
  }
  return out;
}

const EPS = 1e-6;

function orient(p: Point, q: Point, r: Point): number {
  const v = (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return Math.abs(v) < EPS ? 0 : Math.sign(v);
}

function onSegment(p: Point, q: Point, r: Point): boolean {
  return Math.min(p.x, r.x) - EPS <= q.x && q.x <= Math.max(p.x, r.x) + EPS && Math.min(p.y, r.y) - EPS <= q.y && q.y <= Math.max(p.y, r.y) + EPS;
}

export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a, c, b)) return true;
  if (o2 === 0 && onSegment(a, d, b)) return true;
  if (o3 === 0 && onSegment(c, a, d)) return true;
  if (o4 === 0 && onSegment(c, b, d)) return true;
  return false;
}

function segmentHitsRect(a: Point, b: Point, x0: number, y0: number, x1: number, y1: number): boolean {
  const inside = (p: Point) => p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1;
  if (inside(a) || inside(b)) return true;
  const c = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
  return c.some((p, i) => segmentsIntersect(a, b, p, c[(i + 1) % 4]!));
}

/** Sobreposição colinear entre dois segmentos com comprimento maior que `min`. */
function collinearOverlap(s: Seg, t: Seg, min = 1): boolean {
  if (orient(s.a, s.b, t.a) !== 0 || orient(s.a, s.b, t.b) !== 0) return false;
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  const len = Math.hypot(dx, dy);
  if (len < EPS) return false;
  const proj = (p: Point) => ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / len;
  const [t0, t1] = [proj(t.a), proj(t.b)].sort((u, v) => u - v) as [number, number];
  return Math.min(len, t1) - Math.max(0, t0) > min;
}

export interface LayoutReport {
  problems: string[];
  crossings: number;
}

export function checkLayout(layout: BoardLayout): LayoutReport {
  const problems: string[] = [];
  const segs = segments(layout);

  for (const g of layout.gates) {
    if (g.x - GATE_W / 2 < 0 || g.x + GATE_W / 2 > BOARD_W) problems.push(`porta ${g.id} fora da placa (x=${g.x.toFixed(0)})`);
    if (g.y < 0 || g.y > BOARD_H) problems.push(`porta ${g.id} fora da placa (y=${g.y.toFixed(0)})`);
  }
  for (let i = 0; i < layout.gates.length; i++) {
    for (let j = i + 1; j < layout.gates.length; j++) {
      const a = layout.gates[i]!;
      const b = layout.gates[j]!;
      if (Math.abs(a.x - b.x) < GATE_W + 20 && Math.abs(a.y - b.y) < GATE_BODY_H + 20) problems.push(`portas ${a.id} e ${b.id} sobrepostas`);
    }
  }
  for (let i = 1; i < layout.inputs.length; i++) {
    const xs = layout.inputs.map((n) => n.x).sort((u, v) => u - v);
    if (xs[i]! - xs[i - 1]! < 90) problems.push('chaves muito próximas');
  }

  for (const s of segs) {
    const dx = Math.abs(s.b.x - s.a.x);
    const dy = Math.abs(s.b.y - s.a.y);
    if (!(dx < 0.01 || dy < 0.01 || Math.abs(dx - dy) < 0.01)) problems.push(`trecho fora de 0°/45°/90° em ${s.edge}`);
    if (s.b.y > s.a.y + 0.01) problems.push(`trilha descendo em ${s.edge}`);
    for (const g of layout.gates) {
      const hw = GATE_W / 2 - 2;
      const hh = GATE_BODY_H / 2 - 2;
      if (segmentHitsRect(s.a, s.b, g.x - hw, g.y - hh, g.x + hw, g.y + hh)) problems.push(`trilha ${s.edge} atravessa a porta ${g.id}`);
    }
  }

  let crossings = 0;
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const s = segs[i]!;
      const t = segs[j]!;
      if (s.source === t.source) continue;
      if (collinearOverlap(s, t)) problems.push(`trilhas ${s.edge} e ${t.edge} sobrepostas`);
      else if (segmentsIntersect(s.a, s.b, t.a, t.b)) crossings++;
    }
  }
  return { problems: [...new Set(problems)], crossings };
}
