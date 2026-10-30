import { GATE_PIN_OFFSET, GATE_PIN_REACH } from '../layout/geometry';
import type { GateType } from '../core/types';

/**
 * Símbolos ANSI das portas apontando para cima (saída no topo), centrados em (0, 0).
 * O mesmo desenho é usado na placa (Pixi) e nas telas HTML (SVG).
 */
export type Cmd =
  | { op: 'M'; x: number; y: number }
  | { op: 'L'; x: number; y: number }
  | { op: 'Q'; cx: number; cy: number; x: number; y: number }
  /** Semicírculo superior: da esquerda (cx - r) para a direita (cx + r) passando pelo topo. */
  | { op: 'TopArc'; cx: number; cy: number; r: number }
  | { op: 'Z' };

export interface GateShape {
  /** Contorno fechado do corpo (preenchido e contornado). */
  body: Cmd[];
  /** Traços abertos extras (a curva dupla do XOR). */
  extras: Cmd[][];
  /** Bolinha de negação. */
  bubble: { x: number; y: number; r: number } | null;
  /** Hastes dos pinos: [x1, y1, x2, y2]. */
  stubs: [number, number, number, number][];
  /** Posição do rótulo dentro do corpo. */
  label: { x: number; y: number; size: number };
}

const HALF_W = 50;
const BOTTOM = 40;
const BUBBLE_R = 8;

function backCurveY(x: number, y0: number, ctrlY: number): number {
  // Curva quadrática simétrica de (-HALF_W, y0) a (HALF_W, y0) com controle (0, ctrlY).
  const t = (x + HALF_W) / (2 * HALF_W);
  return (1 - t) * (1 - t) * y0 + 2 * t * (1 - t) * ctrlY + t * t * y0;
}

export function gateShape(type: GateType): GateShape {
  const negated = type === 'NAND' || type === 'NOR' || type === 'XNOR' || type === 'NOT';
  const base = type === 'NAND' ? 'AND' : type === 'NOR' || type === 'XNOR' || type === 'XOR' ? 'OR' : type;
  const xorLike = type === 'XOR' || type === 'XNOR';

  let body: Cmd[];
  let top: number;
  let inputStartY: number;
  const extras: Cmd[][] = [];
  const pins = [-GATE_PIN_OFFSET, GATE_PIN_OFFSET];

  if (base === 'AND') {
    body = [
      { op: 'M', x: -HALF_W, y: BOTTOM },
      { op: 'L', x: -HALF_W, y: 0 },
      { op: 'TopArc', cx: 0, cy: 0, r: HALF_W },
      { op: 'L', x: HALF_W, y: BOTTOM },
      { op: 'Z' },
    ];
    top = -HALF_W;
    inputStartY = BOTTOM;
  } else if (base === 'OR') {
    const ctrl = 18;
    top = -54;
    body = [
      { op: 'M', x: -HALF_W, y: BOTTOM },
      { op: 'Q', cx: -46, cy: -16, x: 0, y: top },
      { op: 'Q', cx: 46, cy: -16, x: HALF_W, y: BOTTOM },
      { op: 'Q', cx: 0, cy: ctrl, x: -HALF_W, y: BOTTOM },
      { op: 'Z' },
    ];
    inputStartY = backCurveY(GATE_PIN_OFFSET, BOTTOM, ctrl);
    if (xorLike) {
      const y0 = BOTTOM + 14;
      const c = ctrl + 14;
      extras.push([
        { op: 'M', x: -HALF_W, y: y0 },
        { op: 'Q', cx: 0, cy: c, x: HALF_W, y: y0 },
      ]);
      inputStartY = backCurveY(GATE_PIN_OFFSET, y0, c);
    }
  } else {
    // NOT: triângulo
    top = -40;
    body = [
      { op: 'M', x: -38, y: BOTTOM },
      { op: 'L', x: 38, y: BOTTOM },
      { op: 'L', x: 0, y: top },
      { op: 'Z' },
    ];
    inputStartY = BOTTOM;
  }

  const bubble = negated ? { x: 0, y: top - BUBBLE_R, r: BUBBLE_R } : null;
  const outStart = bubble ? bubble.y - bubble.r : top;
  const stubs: [number, number, number, number][] = [[0, outStart, 0, -GATE_PIN_REACH]];
  if (type === 'NOT') stubs.push([0, inputStartY, 0, GATE_PIN_REACH]);
  else for (const x of pins) stubs.push([x, inputStartY, x, GATE_PIN_REACH]);

  const label =
    type === 'NOT' ? { x: 0, y: 22, size: 15 } : base === 'AND' ? { x: 0, y: 8, size: type.length > 3 ? 19 : 22 } : { x: 0, y: 2, size: type.length > 3 ? 17 : 20 };

  return { body, extras, bubble, stubs, label };
}

/** Converte comandos em atributo `d` de SVG. */
export function toSvgPath(cmds: Cmd[]): string {
  return cmds
    .map((c) => {
      switch (c.op) {
        case 'M':
          return `M${c.x} ${c.y}`;
        case 'L':
          return `L${c.x} ${c.y}`;
        case 'Q':
          return `Q${c.cx} ${c.cy} ${c.x} ${c.y}`;
        case 'TopArc':
          return `A${c.r} ${c.r} 0 0 1 ${c.cx + c.r} ${c.cy}`;
        case 'Z':
          return 'Z';
      }
    })
    .join(' ');
}

/** SVG completo do símbolo, para as telas HTML. */
export function gateSvg(type: GateType, opts: { className?: string; label?: boolean } = {}): string {
  const s = gateShape(type);
  const extras = s.extras.map((e) => `<path class="gate-line" pathLength="1" d="${toSvgPath(e)}"/>`).join('');
  const bubble = s.bubble ? `<circle class="gate-line gate-fill" pathLength="1" cx="${s.bubble.x}" cy="${s.bubble.y}" r="${s.bubble.r}"/>` : '';
  const stubs = s.stubs
    .map(([x1, y1, x2, y2], i) => `<line pathLength="1" class="gate-stub ${i === 0 ? 'stub-out' : `stub-in stub-in-${i - 1}`}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`)
    .join('');
  const label = opts.label === false ? '' : `<text class="gate-label" x="${s.label.x}" y="${s.label.y}" font-size="${s.label.size}">${type}</text>`;
  return `<svg class="${opts.className ?? 'gate-svg'}" viewBox="-60 -80 120 160" aria-label="${type}">${stubs}<path class="gate-line gate-fill gate-body" pathLength="1" d="${toSvgPath(s.body)}"/>${extras}${bubble}${label}</svg>`;
}
