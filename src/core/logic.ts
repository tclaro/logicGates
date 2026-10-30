import type { Bit, GateType } from './types';

export const GATE_TYPES: readonly GateType[] = ['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR', 'XNOR'];

export const GATE_ARITY: Record<GateType, number> = {
  AND: 2,
  OR: 2,
  NOT: 1,
  NAND: 2,
  NOR: 2,
  XOR: 2,
  XNOR: 2,
};

export function isGateType(value: unknown): value is GateType {
  return typeof value === 'string' && (GATE_TYPES as readonly string[]).includes(value);
}

export function applyGate(type: GateType, ins: readonly Bit[]): Bit {
  const a = ins[0] ?? 0;
  const b = ins[1] ?? 0;
  switch (type) {
    case 'AND':
      return (a & b) as Bit;
    case 'OR':
      return (a | b) as Bit;
    case 'NOT':
      return (a ^ 1) as Bit;
    case 'NAND':
      return ((a & b) ^ 1) as Bit;
    case 'NOR':
      return ((a | b) ^ 1) as Bit;
    case 'XOR':
      return (a ^ b) as Bit;
    case 'XNOR':
      return ((a ^ b) ^ 1) as Bit;
  }
}

export interface TruthRow {
  inputs: Bit[];
  output: Bit;
}

/** Linhas em ordem binária crescente: 00, 01, 10, 11. */
export function truthTable(type: GateType): TruthRow[] {
  const arity = GATE_ARITY[type];
  const rows: TruthRow[] = [];
  for (let mask = 0; mask < 1 << arity; mask++) {
    const inputs: Bit[] = [];
    for (let i = arity - 1; i >= 0; i--) inputs.push(((mask >> i) & 1) as Bit);
    rows.push({ inputs, output: applyGate(type, inputs) });
  }
  return rows;
}

/** Índice da linha da tabela verdade correspondente às entradas dadas. */
export function truthRowIndex(inputs: readonly Bit[]): number {
  return inputs.reduce<number>((acc, bit) => (acc << 1) | bit, 0);
}
