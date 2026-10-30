import { evaluate, topoOrder } from './circuit';
import type { Bit, InputState, LevelDef } from './types';

export interface SolveResult {
  /** Combinações (na ordem de `level.inputs`) que acendem a lâmpada. */
  solutions: Bit[][];
  /** Menor número de chaves a alternar a partir do estado inicial; -1 se não houver solução. */
  minClicks: number;
  /** Uma solução mais próxima do estado inicial, ou null. */
  best: Bit[] | null;
  /** Total de combinações testadas (2^n). */
  total: number;
}

export const MAX_INPUTS = 10;

export function toInputState(level: LevelDef, bits: readonly Bit[]): InputState {
  const state: InputState = {};
  level.inputs.forEach((input, i) => (state[input.id] = bits[i] ?? 0));
  return state;
}

/** Testa todas as combinações das chaves (força bruta, n ≤ MAX_INPUTS). */
export function solve(level: LevelDef): SolveResult {
  const n = level.inputs.length;
  if (n > MAX_INPUTS) throw new Error(`Fase com ${n} chaves; o máximo é ${MAX_INPUTS}`);
  const order = topoOrder(level);
  const initial = level.inputs.map((i) => i.initial);
  const solutions: Bit[][] = [];
  let minClicks = -1;
  let best: Bit[] | null = null;
  const total = 1 << n;

  for (let mask = 0; mask < total; mask++) {
    const bits: Bit[] = [];
    for (let i = 0; i < n; i++) bits.push(((mask >> (n - 1 - i)) & 1) as Bit);
    if (evaluate(level, toInputState(level, bits), order)[level.output] !== 1) continue;
    solutions.push(bits);
    const clicks = bits.reduce<number>((acc, b, i) => acc + (b !== initial[i] ? 1 : 0), 0);
    if (minClicks === -1 || clicks < minClicks) {
      minClicks = clicks;
      best = bits;
    }
  }
  return { solutions, minClicks, best, total };
}
