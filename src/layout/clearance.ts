import type { BoardLayout } from './autoLayout';
import { BOARD_H, BOARD_W, GATE_HALF_SPAN, GATE_PIN_REACH, LAMP_SIZE, SWITCH_H, SWITCH_W, TRACE_HALF_SPAN } from './geometry';

/** Folga, em unidades da placa, entre um elemento e o que for posto por cima dela. */
const PAD = 12;

/**
 * Para cada linha da placa (y em unidades, de 0 a BOARD_H), o menor x ocupado por
 * algum elemento do circuito: lâmpada, portas e encaixes (com os pinos), chaves e trilhas.
 * O que ficar à esquerda desse x não cobre nada do jogo.
 */
export function leftClearance(layout: BoardLayout): Float32Array {
  const minX = new Float32Array(BOARD_H + 1).fill(BOARD_W);
  const mark = (x: number, y0: number, y1: number) => {
    const from = Math.max(0, Math.floor(y0 - PAD));
    const to = Math.min(BOARD_H, Math.ceil(y1 + PAD));
    for (let y = from; y <= to; y++) if (x - PAD < minX[y]!) minX[y] = x - PAD;
  };
  mark(layout.lamp.x - LAMP_SIZE / 2, layout.lamp.y - LAMP_SIZE / 2, layout.lamp.pin.y);
  for (const g of layout.gates) mark(g.x - GATE_HALF_SPAN, g.y - GATE_PIN_REACH, g.y + GATE_PIN_REACH);
  for (const i of layout.inputs) mark(i.x - SWITCH_W / 2, Math.min(i.pin.y, i.y - SWITCH_H / 2), i.y + SWITCH_H / 2);
  for (const e of layout.edges) {
    for (let k = 1; k < e.points.length; k++) {
      const a = e.points[k - 1]!;
      const b = e.points[k]!;
      const steps = Math.max(1, Math.ceil(Math.abs(b.y - a.y)));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        // Num trecho horizontal, a linha inteira é ocupada a partir da ponta mais à esquerda.
        const left = a.y === b.y ? Math.min(a.x, b.x) : x;
        mark(left - TRACE_HALF_SPAN, y - TRACE_HALF_SPAN, y + TRACE_HALF_SPAN);
      }
    }
  }
  return minX;
}

/** O retângulo [0, right] × [top, bottom] (unidades da placa) não cobre nenhum elemento. */
export function isLeftStripFree(clearance: Float32Array, right: number, top: number, bottom: number): boolean {
  const from = Math.max(0, Math.floor(top));
  const to = Math.min(clearance.length - 1, Math.ceil(bottom));
  for (let y = from; y <= to; y++) if (clearance[y]! < right) return false;
  return true;
}
