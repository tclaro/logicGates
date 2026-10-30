import { ancestors, CircuitError, depths, evaluate, initialInputs, topoOrder } from './circuit';
import { GATE_ARITY, isGateType } from './logic';
import { MAX_INPUTS, solve } from './solver';
import type { GateType, LevelDef } from './types';

export interface LevelStats {
  inputs: number;
  gates: number;
  depth: number;
  /** Maior número de destinos ligados a um mesmo nó. */
  maxFanout: number;
  minClicks: number;
  solutions: number;
  /** Chaves que começam em 1 e precisam ser desligadas na solução mais próxima. */
  trapInputs: number;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  stats: LevelStats | null;
}

export interface ValidateOptions {
  /** Portas permitidas nesta fase; se omitido, todas. */
  allowedGates?: ReadonlySet<GateType>;
}

export function validateLevel(level: LevelDef, options: ValidateOptions = {}): ValidationResult {
  const errors: string[] = [];
  const fail = (): ValidationResult => ({ ok: false, errors, stats: null });

  if (!Number.isInteger(level.id) || level.id < 1) errors.push('Id da fase deve ser um inteiro ≥ 1');
  if (level.inputs.length === 0) errors.push('A fase precisa de pelo menos uma chave');
  if (level.inputs.length > MAX_INPUTS) errors.push(`No máximo ${MAX_INPUTS} chaves`);
  if (level.gates.length === 0) errors.push('A fase precisa de pelo menos uma porta');

  const ids = new Set<string>();
  for (const node of [...level.inputs, ...level.gates]) {
    if (!node.id) errors.push('Todo nó precisa de um id');
    else if (ids.has(node.id)) errors.push(`Id repetido: "${node.id}"`);
    ids.add(node.id);
  }
  for (const input of level.inputs) {
    if (input.initial !== 0 && input.initial !== 1) errors.push(`Chave "${input.id}" com valor inicial inválido`);
  }
  for (const gate of level.gates) {
    if (!isGateType(gate.type)) {
      errors.push(`Porta "${gate.id}" com tipo inválido: ${String(gate.type)}`);
      continue;
    }
    if (gate.in.length !== GATE_ARITY[gate.type]) {
      errors.push(`Porta "${gate.id}" (${gate.type}) precisa de ${GATE_ARITY[gate.type]} entrada(s), tem ${gate.in.length}`);
    }
    if (options.allowedGates && !options.allowedGates.has(gate.type)) {
      errors.push(`A porta ${gate.type} ainda não foi apresentada nesta fase`);
    }
  }
  if (!level.gates.some((g) => g.id === level.output)) {
    errors.push(`A saída "${level.output}" precisa ser uma porta existente`);
  }
  if (errors.length) return fail();

  try {
    topoOrder(level);
  } catch (e) {
    if (e instanceof CircuitError) {
      errors.push(e.message);
      return fail();
    }
    throw e;
  }

  const relevant = ancestors(level, level.output);
  for (const input of level.inputs) {
    if (!relevant.has(input.id)) errors.push(`A chave "${input.id}" não está ligada à lâmpada`);
  }
  for (const gate of level.gates) {
    if (!relevant.has(gate.id)) errors.push(`A porta "${gate.id}" não está ligada à lâmpada`);
  }

  if (evaluate(level, initialInputs(level))[level.output] === 1) {
    errors.push('A lâmpada não pode começar acesa');
  }

  const result = solve(level);
  if (result.minClicks === -1) errors.push('A fase não tem solução');

  const fanout = new Map<string, number>();
  for (const gate of level.gates) for (const src of gate.in) fanout.set(src, (fanout.get(src) ?? 0) + 1);

  const best = result.best;
  const stats: LevelStats = {
    inputs: level.inputs.length,
    gates: level.gates.length,
    depth: depths(level)[level.output] ?? 0,
    maxFanout: Math.max(1, ...fanout.values()),
    minClicks: result.minClicks,
    solutions: result.solutions.length,
    trapInputs: best ? level.inputs.filter((input, i) => input.initial === 1 && best[i] === 0).length : 0,
  };
  return { ok: errors.length === 0, errors, stats };
}
