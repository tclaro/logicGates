import { applyGate } from './logic';
import type { Bit, GateDef, InputState, LevelDef, NodeValues } from './types';

export class CircuitError extends Error {}

/**
 * Ordena as portas de modo que cada uma venha depois das suas fontes.
 * Lança CircuitError para referências desconhecidas ou ciclos.
 */
export function topoOrder(level: LevelDef): GateDef[] {
  const inputIds = new Set(level.inputs.map((i) => i.id));
  const gatesById = new Map(level.gates.map((g) => [g.id, g]));
  const state = new Map<string, 'visiting' | 'done'>();
  const order: GateDef[] = [];

  const visit = (gate: GateDef, path: string[]): void => {
    const s = state.get(gate.id);
    if (s === 'done') return;
    if (s === 'visiting') {
      throw new CircuitError(`Ciclo detectado: ${[...path, gate.id].join(' → ')}`);
    }
    state.set(gate.id, 'visiting');
    for (const src of gate.in) {
      if (inputIds.has(src)) continue;
      const dep = gatesById.get(src);
      if (!dep) throw new CircuitError(`A porta "${gate.id}" referencia "${src}", que não existe`);
      visit(dep, [...path, gate.id]);
    }
    state.set(gate.id, 'done');
    order.push(gate);
  };

  for (const gate of level.gates) visit(gate, []);
  return order;
}

export function initialInputs(level: LevelDef): InputState {
  const state: InputState = {};
  for (const input of level.inputs) state[input.id] = input.initial;
  return state;
}

/** Valor lógico de todos os nós (chaves e portas) para um estado das chaves. */
export function evaluate(level: LevelDef, inputs: InputState, order = topoOrder(level)): NodeValues {
  const values: NodeValues = {};
  for (const input of level.inputs) values[input.id] = inputs[input.id] ?? 0;
  for (const gate of order) {
    values[gate.id] = applyGate(
      gate.type,
      gate.in.map((src) => values[src] as Bit),
    );
  }
  return values;
}

export function outputValue(level: LevelDef, inputs: InputState): Bit {
  return evaluate(level, inputs)[level.output] ?? 0;
}

/** Profundidade de cada porta: 1 + maior profundidade das fontes (chaves = 0). */
export function depths(level: LevelDef): Record<string, number> {
  const d: Record<string, number> = {};
  for (const input of level.inputs) d[input.id] = 0;
  for (const gate of topoOrder(level)) {
    d[gate.id] = 1 + Math.max(...gate.in.map((src) => d[src] ?? 0));
  }
  return d;
}

/** Conjunto de nós dos quais `target` depende (incluindo ele mesmo). */
export function ancestors(level: LevelDef, target: string): Set<string> {
  const gatesById = new Map(level.gates.map((g) => [g.id, g]));
  const seen = new Set<string>();
  const stack = [target];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const gate = gatesById.get(id);
    if (gate) stack.push(...gate.in);
  }
  return seen;
}
