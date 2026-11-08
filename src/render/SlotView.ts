import { Container, Graphics, Rectangle } from 'pixi.js';
import type { GateType } from '../core/types';
import { GATE_PIN_OFFSET, GATE_PIN_REACH } from '../layout/geometry';
import { GateView } from './GateView';
import { PALETTE } from './palette';

const BOX = { left: -54, top: -56, right: 54, bottom: 46 };
const DASH = 14;
const GAP = 10;

function dashedLine(g: Graphics, x1: number, y1: number, x2: number, y2: number): void {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  for (let d = 0; d < len; d += DASH + GAP) {
    const e = Math.min(len, d + DASH);
    g.moveTo(x1 + ux * d, y1 + uy * d).lineTo(x1 + ux * e, y1 + uy * e);
  }
}

function dashedBox(g: Graphics): void {
  const { left, top, right, bottom } = BOX;
  dashedLine(g, left, top, right, top);
  dashedLine(g, right, top, right, bottom);
  dashedLine(g, right, bottom, left, bottom);
  dashedLine(g, left, bottom, left, top);
}

/** Encaixe das fases de montagem: contorno tracejado com os pinos, onde o jogador põe uma peça. */
export class SlotView extends Container {
  private readonly frame = new Graphics();
  private readonly hint = new Graphics();
  private piece: GateView | null = null;
  private hinted = false;
  private pulse = 0;

  constructor(
    readonly gateId: string,
    readonly arity: number,
  ) {
    super();
    const pins = arity === 1 ? [0] : [-GATE_PIN_OFFSET, GATE_PIN_OFFSET];
    const stubs = new Graphics();
    stubs.moveTo(0, BOX.top).lineTo(0, -GATE_PIN_REACH);
    for (const x of pins) stubs.moveTo(x, BOX.bottom).lineTo(x, GATE_PIN_REACH);
    stubs.stroke({ width: 5, color: PALETTE.silkscreen, cap: 'round', alpha: 0.75 });

    this.frame.rect(BOX.left, BOX.top, BOX.right - BOX.left, BOX.bottom - BOX.top).fill({ color: PALETTE.gateFill, alpha: 0.55 });
    dashedBox(this.frame);
    this.frame.stroke({ width: 4, color: PALETTE.silkscreen, cap: 'round', alpha: 0.8 });

    dashedBox(this.hint);
    this.hint.stroke({ width: 7, color: PALETTE.energyCore, cap: 'round' });
    this.hint.alpha = 0;

    this.addChild(stubs, this.frame, this.hint);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new Rectangle(-62, -GATE_PIN_REACH, 124, GATE_PIN_REACH * 2);
  }

  get filled(): GateType | null {
    return this.piece?.type ?? null;
  }

  /** Põe a peça (ou esvazia) e devolve a vista da porta, para a placa acender e apagar. */
  setPiece(type: GateType | null): GateView | null {
    this.piece?.destroy({ children: true });
    this.piece = null;
    this.frame.visible = !type;
    if (!type) return null;
    this.piece = new GateView(this.gateId, type);
    this.piece.eventMode = 'none';
    this.addChild(this.piece);
    this.setChildIndex(this.hint, this.children.length - 1);
    return this.piece;
  }

  /** Destaca o encaixe enquanto o jogador segura uma peça que cabe nele. */
  setHint(on: boolean): void {
    this.hinted = on;
    if (!on) this.hint.alpha = 0;
  }

  update(dt: number): void {
    if (!this.hinted) return;
    this.pulse = (this.pulse + dt * 3) % (Math.PI * 2);
    this.hint.alpha = 0.45 + 0.4 * Math.sin(this.pulse);
  }
}
