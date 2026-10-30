import type { Point } from '../core/types';

/** Trecho de uma aresta dentro de um canal horizontal entre duas camadas. */
export interface ChannelSegment {
  edgeId: string;
  /** Posição do trecho dentro da cadeia da aresta (de baixo para cima). */
  index: number;
  /** Ponto na base do canal. */
  from: Point;
  /** Ponto no topo do canal. */
  to: Point;
  /** Preenchido por routeChannel. */
  points: Point[];
}

const CHANNEL_MARGIN = 14;

/**
 * Roteia os trechos de um canal com segmentos verticais, a 45° e horizontais.
 * Cada trecho com deslocamento lateral ganha uma faixa própria; a ordem das
 * faixas evita cruzamentos entre trechos que seguem na mesma direção.
 */
export function routeChannel(segments: ChannelSegment[], top: number, bottom: number): void {
  const right = segments.filter((s) => s.to.x - s.from.x > 0.5);
  const left = segments.filter((s) => s.from.x - s.to.x > 0.5);
  // De cima para baixo: quem sai mais à direita (indo para a direita) fica mais embaixo.
  right.sort((a, b) => a.from.x - b.from.x || a.to.x - b.to.x);
  left.sort((a, b) => b.from.x - a.from.x || b.to.x - a.to.x);

  for (const seg of segments) seg.points = [seg.from, { x: seg.from.x, y: seg.to.y }, seg.to];

  // Faixas distintas para todos: quem vai para a direita ocupa as de cima.
  const moving = [...right, ...left];
  const usable = bottom - top - 2 * CHANNEL_MARGIN;
  const step = usable / (moving.length + 1);
  {
    moving.forEach((seg, i) => {
      const trackY = top + CHANNEL_MARGIN + step * (i + 1);
      const dx = seg.to.x - seg.from.x;
      const dir = Math.sign(dx);
      const k = Math.max(0, Math.min(Math.abs(dx) / 2, trackY - top, bottom - trackY));
      seg.points = [
        seg.from,
        { x: seg.from.x, y: trackY + k },
        { x: seg.from.x + dir * k, y: trackY },
        { x: seg.to.x - dir * k, y: trackY },
        { x: seg.to.x, y: trackY - k },
        seg.to,
      ];
    });
  }
}

/** Remove pontos repetidos e pontos no meio de segmentos retos. */
export function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 1e-6 && Math.abs(last.y - p.y) < 1e-6) continue;
    out.push({ x: p.x, y: p.y });
    while (out.length >= 3) {
      const a = out[out.length - 3]!;
      const b = out[out.length - 2]!;
      const c = out[out.length - 1]!;
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      const dot = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);
      if (Math.abs(cross) > 1e-6 || dot < 0) break;
      out.splice(out.length - 2, 1);
    }
  }
  return out;
}

export function polylineLength(points: readonly Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  return len;
}

/** Ponto a uma distância `d` do início da polilinha. */
export function pointAt(points: readonly Point[], d: number): Point {
  let remaining = Math.max(0, d);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining <= seg) {
      const t = seg === 0 ? 0 : remaining / seg;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    remaining -= seg;
  }
  const last = points[points.length - 1]!;
  return { x: last.x, y: last.y };
}

/** Trecho da polilinha entre as distâncias `from` e `to`. */
export function subPolyline(points: readonly Point[], from: number, to: number): Point[] {
  if (to <= from) return [];
  const out: Point[] = [pointAt(points, from)];
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    acc += Math.hypot(b.x - a.x, b.y - a.y);
    if (acc > from && acc < to) out.push({ x: b.x, y: b.y });
    if (acc >= to) break;
  }
  out.push(pointAt(points, to));
  return out;
}
