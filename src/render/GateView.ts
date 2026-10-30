import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import type { GateType } from '../core/types';
import { GATE_PIN_REACH } from '../layout/geometry';
import { gateShape, type Cmd } from './gateShapes';
import { PALETTE } from './palette';

function trace(g: Graphics, cmds: Cmd[]): void {
  for (const c of cmds) {
    switch (c.op) {
      case 'M':
        g.moveTo(c.x, c.y);
        break;
      case 'L':
        g.lineTo(c.x, c.y);
        break;
      case 'Q':
        g.quadraticCurveTo(c.cx, c.cy, c.x, c.y);
        break;
      case 'TopArc':
        g.arc(c.cx, c.cy, c.r, Math.PI, Math.PI * 2);
        break;
      case 'Z':
        g.closePath();
        break;
    }
  }
}

/** Desenha o símbolo serigrafado de uma porta em `g`, centrado em (0, 0). */
export function drawGateSymbol(g: Graphics, type: GateType, color: number, fill: number | null, width = 5): void {
  const s = gateShape(type);
  for (const [x1, y1, x2, y2] of s.stubs) g.moveTo(x1, y1).lineTo(x2, y2);
  g.stroke({ width, color, cap: 'round' });
  trace(g, s.body);
  if (fill !== null) g.fill({ color: fill, alpha: 0.92 });
  trace(g, s.body);
  g.stroke({ width, color, join: 'round' });
  for (const extra of s.extras) {
    trace(g, extra);
    g.stroke({ width, color, cap: 'round' });
  }
  if (s.bubble) {
    g.circle(s.bubble.x, s.bubble.y, s.bubble.r);
    if (fill !== null) g.fill({ color: fill });
    g.circle(s.bubble.x, s.bubble.y, s.bubble.r).stroke({ width: width - 1, color });
  }
}

export class GateView extends Container {
  private readonly active = new Graphics();
  private readonly labelText: Text;
  private glow = 0;
  private target = 0;

  constructor(
    readonly gateId: string,
    readonly type: GateType,
  ) {
    super();
    const shadow = new Graphics();
    drawGateSymbol(shadow, type, PALETTE.copperShadow, PALETTE.copperShadow, 7);
    shadow.position.set(3, 4);
    shadow.alpha = 0.55;
    const normal = new Graphics();
    drawGateSymbol(normal, type, PALETTE.silkscreen, PALETTE.gateFill);
    drawGateSymbol(this.active, type, PALETTE.silkscreenActive, null);
    this.active.alpha = 0;
    const s = gateShape(type);
    this.labelText = new Text({
      text: type,
      style: {
        fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        fontSize: s.label.size,
        fontWeight: '800',
        fill: PALETTE.silkscreen,
        letterSpacing: 1,
      },
      resolution: 3,
    });
    this.labelText.anchor.set(0.5);
    this.labelText.position.set(s.label.x, s.label.y);
    this.labelText.alpha = 0.9;
    this.addChild(shadow, normal, this.active, this.labelText);
    this.hitArea = new Rectangle(-62, -GATE_PIN_REACH, 124, GATE_PIN_REACH * 2);
  }

  setActive(on: boolean): void {
    this.target = on ? 1 : 0;
  }

  update(dt: number): void {
    if (this.glow === this.target) return;
    const step = dt * 6;
    this.glow = this.target > this.glow ? Math.min(this.target, this.glow + step) : Math.max(this.target, this.glow - step);
    this.active.alpha = this.glow;
    this.labelText.style.fill = this.glow > 0.5 ? PALETTE.silkscreenActive : PALETTE.silkscreen;
  }
}
