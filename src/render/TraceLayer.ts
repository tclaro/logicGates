import { BlurFilter, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { Point } from '../core/types';
import type { BoardLayout, RoutedEdge } from '../layout/autoLayout';
import { pointAt, subPolyline } from '../layout/router';
import { PALETTE } from './palette';
import type { Propagation } from './Propagation';

const TRACE_W = 12;
const PAD_R = 11;
const PULSE_SPACING = 70;
const PULSE_SPEED = 260;

function strokePath(g: Graphics, pts: readonly Point[]): void {
  if (pts.length < 2) return;
  g.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]!.x, pts[i]!.y);
}

interface Pad {
  p: Point;
  /** Nó cuja saída energiza o pad, ou a aresta cuja ponta final o energiza. */
  source?: string;
  edgeEnd?: string;
}

/** Trilhas de cobre, ilhas de solda, brilho da energia e pulsos correndo. */
export class TraceLayer extends Container {
  private readonly base = new Graphics();
  private readonly glowLayer = new Container();
  private readonly glow = new Graphics();
  private readonly lit = new Graphics();
  private readonly sparks = new Container();
  private readonly pads: Pad[] = [];
  private readonly sparkPool: Sprite[] = [];
  private time = 0;

  constructor(
    private readonly layout: BoardLayout,
    private readonly glowTexture: Texture,
  ) {
    super();
    this.glowLayer.addChild(this.glow);
    this.glowLayer.filters = [new BlurFilter({ strength: 14, quality: 3, resolution: 0.5 })];
    this.glowLayer.blendMode = 'add';
    this.sparks.blendMode = 'add';
    this.addChild(this.base, this.glowLayer, this.lit, this.sparks);
    this.collectPads();
    this.drawBase();
  }

  private collectPads(): void {
    const { layout } = this;
    for (const input of layout.inputs) this.pads.push({ p: input.pin, source: input.id });
    for (const gate of layout.gates) {
      this.pads.push({ p: gate.outPin, source: gate.id });
      gate.inPins.forEach((pin, i) => this.pads.push({ p: pin, edgeEnd: gate.inEdges[i] }));
    }
    const lampEdge = layout.edges.find((e) => e.to === '@lamp');
    if (lampEdge) this.pads.push({ p: layout.lamp.pin, edgeEnd: lampEdge.id });
    for (const j of layout.junctions) {
      const e = layout.edges.find((edge) => Math.abs(edge.points[0]!.x - j.x) < 0.5 && edge.points.some((p) => Math.abs(p.y - j.y) < 0.5));
      this.pads.push({ p: j, source: e?.from });
    }
  }

  private drawBase(): void {
    const g = this.base;
    for (const e of this.layout.edges) {
      strokePath(g, e.points.map((p) => ({ x: p.x + 2, y: p.y + 3 })));
      g.stroke({ width: TRACE_W + 6, color: PALETTE.copperShadow, alpha: 0.55, cap: 'round', join: 'round' });
    }
    for (const e of this.layout.edges) {
      strokePath(g, e.points);
      g.stroke({ width: TRACE_W + 2, color: PALETTE.copperDark, cap: 'round', join: 'round' });
    }
    for (const e of this.layout.edges) {
      strokePath(g, e.points);
      g.stroke({ width: TRACE_W - 3, color: PALETTE.copper, cap: 'round', join: 'round' });
    }
    for (const e of this.layout.edges) {
      strokePath(
        g,
        e.points.map((p) => ({ x: p.x - 1.5, y: p.y - 1.5 })),
      );
      g.stroke({ width: 2, color: PALETTE.copperLight, alpha: 0.45, cap: 'round', join: 'round' });
    }
    for (const pad of this.pads) {
      g.circle(pad.p.x + 2, pad.p.y + 3, PAD_R + 2).fill({ color: PALETTE.copperShadow, alpha: 0.5 });
      g.circle(pad.p.x, pad.p.y, PAD_R + 1).fill({ color: PALETTE.copperDark });
      g.circle(pad.p.x, pad.p.y, PAD_R - 1.5).fill({ color: PALETTE.padRing });
      g.circle(pad.p.x - 2, pad.p.y - 2, PAD_R - 6).fill({ color: PALETTE.copperLight, alpha: 0.35 });
      g.circle(pad.p.x, pad.p.y, 3.5).fill({ color: PALETTE.padHole });
    }
  }

  /** Redesenha a energia; chame quando a propagação mudou. */
  redraw(prop: Propagation): void {
    const { glow, lit } = this;
    glow.clear();
    lit.clear();
    const litEnds = new Set<string>();
    for (const e of this.layout.edges) {
      const ranges = prop.litRanges(e.id);
      for (const [a, b] of ranges) {
        const pts = subPolyline(e.points, a, b);
        strokePath(glow, pts);
        glow.stroke({ width: 30, color: PALETTE.energyGlow, alpha: 0.85, cap: 'round', join: 'round' });
        strokePath(lit, pts);
        lit.stroke({ width: TRACE_W - 1, color: PALETTE.energyGlow, cap: 'round', join: 'round' });
        strokePath(lit, pts);
        lit.stroke({ width: TRACE_W - 6, color: PALETTE.energyCore, cap: 'round', join: 'round' });
        strokePath(lit, pts);
        lit.stroke({ width: 2, color: PALETTE.energyHot, alpha: 0.9, cap: 'round', join: 'round' });
        if (b >= e.length - 1e-6) litEnds.add(e.id);
      }
    }
    for (const pad of this.pads) {
      const on = pad.source ? prop.nodeValue(pad.source) === 1 : pad.edgeEnd ? litEnds.has(pad.edgeEnd) : false;
      if (!on) continue;
      glow.circle(pad.p.x, pad.p.y, PAD_R + 12).fill({ color: PALETTE.energyGlow, alpha: 0.9 });
      lit.circle(pad.p.x, pad.p.y, PAD_R).fill({ color: PALETTE.energyGlow });
      lit.circle(pad.p.x, pad.p.y, PAD_R - 4).fill({ color: PALETTE.energyCore });
      lit.circle(pad.p.x, pad.p.y, 3.5).fill({ color: PALETTE.energyHot });
    }
  }

  /** Pulsos de luz correndo pelas trilhas ligadas e faíscas nas frentes de onda. */
  animate(prop: Propagation, dt: number): void {
    this.time += dt;
    let used = 0;
    const spark = (p: Point, scale: number, alpha: number, tint: number) => {
      let s = this.sparkPool[used];
      if (!s) {
        s = new Sprite(this.glowTexture);
        s.anchor.set(0.5);
        this.sparkPool.push(s);
        this.sparks.addChild(s);
      }
      s.visible = true;
      s.position.set(p.x, p.y);
      s.scale.set(scale);
      s.alpha = alpha;
      s.tint = tint;
      used++;
    };
    const drawn = new Set<string>();
    for (const e of this.layout.edges) {
      for (const front of prop.risingFronts(e.id)) spark(pointAt(e.points, front), 0.55, 1, PALETTE.energyHot);
      const ranges = prop.litRanges(e.id);
      if (!ranges.length) continue;
      const offset = (this.time * PULSE_SPEED) % PULSE_SPACING;
      for (let d = offset; d < e.length; d += PULSE_SPACING) {
        if (!ranges.some(([a, b]) => d >= a && d <= b)) continue;
        const p = pointAt(e.points, d);
        const key = `${Math.round(p.x)},${Math.round(p.y)}`;
        if (drawn.has(key)) continue; // trechos compartilhados por fan-out
        drawn.add(key);
        const flicker = 0.55 + 0.25 * Math.sin(this.time * 9 + d * 0.05);
        spark(p, 0.24, flicker, PALETTE.energyCore);
      }
    }
    for (let i = used; i < this.sparkPool.length; i++) this.sparkPool[i]!.visible = false;
  }

  edgeById(id: string): RoutedEdge | undefined {
    return this.layout.edges.find((e) => e.id === id);
  }
}
