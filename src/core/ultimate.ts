import { depths, evaluate, initialInputs, topoOrder } from './circuit';
import { GATE_ARITY, GATE_TYPES, isGateType } from './logic';
import { maxFanout, structureErrors, type ValidateOptions } from './validator';
import type { Bit, GateType, InputState, LevelDef, Pieces, SlotFill, UltimateLevelDef } from './types';

/** Quantas vezes a chave automática alterna depois que a energia chega pela primeira vez. */
export const CLOCK_TICKS = 3;

/** Encaixes vazios, prontos para o jogador. */
export function emptyFill(level: UltimateLevelDef): SlotFill {
  return Object.fromEntries(level.slots.map((id) => [id, null]));
}

/** Número de entradas do encaixe: só cabe peça com a mesma quantidade. */
export function slotArity(level: LevelDef, slotId: string): number {
  return level.gates.find((g) => g.id === slotId)?.in.length ?? 0;
}

export function fits(level: LevelDef, slotId: string, piece: GateType): boolean {
  return GATE_ARITY[piece] === slotArity(level, slotId);
}

/** Peças ainda na bandeja, descontando as que estão nos encaixes. */
export function remainingPieces(level: UltimateLevelDef, fill: SlotFill): Pieces {
  const left: Pieces = { ...level.pieces };
  for (const piece of Object.values(fill)) if (piece) left[piece] = (left[piece] ?? 0) - 1;
  return left;
}

/** Estados das chaves que o circuito precisa aguentar: o inicial e, com chave automática, o outro valor dela. */
export function ultimateCases(level: UltimateLevelDef): InputState[] {
  const base = initialInputs(level);
  if (!level.clock) return [base];
  return [base, { ...base, [level.clock]: ((base[level.clock] ?? 0) ^ 1) as Bit }];
}

/** A fase com as peças escolhidas no lugar dos tipos de referência. */
export function withFill(level: UltimateLevelDef, fill: SlotFill): UltimateLevelDef {
  return { ...level, gates: level.gates.map((g) => (fill[g.id] ? { ...g, type: fill[g.id]! } : g)) };
}

/** Encaixes ainda vazios. */
export function emptySlots(level: UltimateLevelDef, fill: SlotFill): Set<string> {
  return new Set(level.slots.filter((id) => !fill[id]));
}

/** Todos os encaixes preenchidos, com peças que cabem e sem passar do estoque. */
export function isComplete(level: UltimateLevelDef, fill: SlotFill): boolean {
  if (!level.slots.every((id) => fill[id] && fits(level, id, fill[id]!))) return false;
  return Object.values(remainingPieces(level, fill)).every((n) => (n ?? 0) >= 0);
}

/** A montagem acende a lâmpada em todos os estados das chaves. */
export function isSolution(level: UltimateLevelDef, fill: SlotFill): boolean {
  if (!isComplete(level, fill)) return false;
  const filled = withFill(level, fill);
  const order = topoOrder(filled);
  return ultimateCases(level).every((inputs) => evaluate(filled, inputs, order)[level.output] === 1);
}

/** Todas as montagens que resolvem a fase (busca exaustiva respeitando o estoque). */
export function solveUltimate(level: UltimateLevelDef): SlotFill[] {
  const solutions: SlotFill[] = [];
  const left: Pieces = { ...level.pieces };
  const fill = emptyFill(level);
  const types = GATE_TYPES.filter((g) => (level.pieces[g] ?? 0) > 0);
  const visit = (i: number): void => {
    if (i === level.slots.length) {
      if (isSolution(level, fill)) solutions.push({ ...fill });
      return;
    }
    const slot = level.slots[i]!;
    for (const piece of types) {
      if ((left[piece] ?? 0) <= 0 || !fits(level, slot, piece)) continue;
      left[piece]! -= 1;
      fill[slot] = piece;
      visit(i + 1);
      left[piece]! += 1;
    }
    fill[slot] = null;
  };
  visit(0);
  return solutions;
}

export interface UltimateStats {
  slots: number;
  gates: number;
  depth: number;
  maxFanout: number;
  /** Peças na bandeja além das necessárias. */
  spare: number;
  /** Montagens possíveis com o estoque (certas ou não). */
  assemblies: number;
  solutions: number;
}

export interface UltimateValidation {
  ok: boolean;
  errors: string[];
  stats: UltimateStats | null;
}

/** Quantas montagens completas o estoque permite (para medir quanto o chute ajudaria). */
function countAssemblies(level: UltimateLevelDef): number {
  const left: Pieces = { ...level.pieces };
  const visit = (i: number): number => {
    if (i === level.slots.length) return 1;
    let total = 0;
    for (const piece of GATE_TYPES) {
      if ((left[piece] ?? 0) <= 0 || !fits(level, level.slots[i]!, piece)) continue;
      left[piece]! -= 1;
      total += visit(i + 1);
      left[piece]! += 1;
    }
    return total;
  };
  return visit(0);
}

export function validateUltimate(level: UltimateLevelDef, options: ValidateOptions = {}): UltimateValidation {
  const errors = structureErrors(level, options);
  if (errors.length) return { ok: false, errors, stats: null };

  const gateIds = new Set(level.gates.map((g) => g.id));
  if (!Array.isArray(level.slots) || level.slots.length === 0) errors.push('A fase precisa de pelo menos um encaixe');
  if (new Set(level.slots).size !== level.slots.length) errors.push('Encaixe repetido');
  for (const id of level.slots) if (!gateIds.has(id)) errors.push(`O encaixe "${id}" precisa ser uma porta existente`);
  for (const [type, count] of Object.entries(level.pieces ?? {})) {
    if (!isGateType(type)) errors.push(`Peça com tipo inválido: ${type}`);
    else if (!Number.isInteger(count) || count! < 1) errors.push(`Quantidade inválida de ${type}: ${String(count)}`);
    else if (options.allowedGates && !options.allowedGates.has(type)) errors.push(`A peça ${type} ainda não foi apresentada nesta fase`);
  }
  if (level.clock !== undefined) {
    if (!level.inputs.some((i) => i.id === level.clock)) errors.push(`A chave automática "${level.clock}" não existe`);
    if (!level.hidden) errors.push('Fase com chave automática precisa de energia escondida');
  }
  if (errors.length) return { ok: false, errors, stats: null };

  const reference: SlotFill = Object.fromEntries(level.slots.map((id) => [id, level.gates.find((g) => g.id === id)!.type]));
  if (!isSolution(level, reference)) errors.push('As portas gravadas nos encaixes não resolvem a fase com as peças dadas');
  const empty = emptySlots(level, emptyFill(level));
  if (ultimateCases(level).some((inputs) => evaluate(level, inputs, undefined, empty)[level.output] === 1)) {
    errors.push('A lâmpada não pode acender com os encaixes vazios');
  }

  const solutions = solveUltimate(level);
  if (solutions.length === 0) errors.push('A fase não tem solução');
  const needed = level.slots.length;
  const stock = Object.values(level.pieces).reduce<number>((a, n) => a + (n ?? 0), 0);
  const stats: UltimateStats = {
    slots: needed,
    gates: level.gates.length,
    depth: depths(level)[level.output] ?? 0,
    maxFanout: maxFanout(level),
    spare: stock - needed,
    assemblies: countAssemblies(level),
    solutions: solutions.length,
  };
  return { ok: errors.length === 0, errors, stats };
}
