import type { GateType } from '../core/types';

/** Fase em que cada porta é apresentada (com tela de introdução antes dela). */
export const GATE_INTRO_LEVEL: Record<GateType, number> = {
  AND: 1,
  OR: 2,
  NOT: 6,
  NAND: 11,
  NOR: 16,
  XOR: 21,
  XNOR: 27,
};

/** Porta apresentada imediatamente antes desta fase, se houver. */
export function introGateFor(levelId: number): GateType | undefined {
  return (Object.keys(GATE_INTRO_LEVEL) as GateType[]).find((g) => GATE_INTRO_LEVEL[g] === levelId);
}

/** Portas que já foram apresentadas até esta fase (inclusive). */
export function allowedGatesFor(levelId: number): Set<GateType> {
  return new Set((Object.keys(GATE_INTRO_LEVEL) as GateType[]).filter((g) => GATE_INTRO_LEVEL[g] <= levelId));
}

/** Portas apresentadas em ordem, para o glossário. */
export function gatesInIntroOrder(): GateType[] {
  return (Object.keys(GATE_INTRO_LEVEL) as GateType[]).sort((a, b) => GATE_INTRO_LEVEL[a] - GATE_INTRO_LEVEL[b]);
}
