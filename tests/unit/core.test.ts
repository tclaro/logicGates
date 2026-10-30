import { describe, expect, it } from 'vitest';
import { ancestors, depths, evaluate, initialInputs, outputValue, topoOrder } from '../../src/core/circuit';
import { applyGate, truthRowIndex, truthTable } from '../../src/core/logic';
import { solve } from '../../src/core/solver';
import type { Bit, GateType, LevelDef } from '../../src/core/types';
import { validateLevel } from '../../src/core/validator';

const EXPECTED: Record<GateType, Bit[]> = {
  // saídas para 00, 01, 10, 11 (NOT: 0, 1)
  AND: [0, 0, 0, 1],
  OR: [0, 1, 1, 1],
  NAND: [1, 1, 1, 0],
  NOR: [1, 0, 0, 0],
  XOR: [0, 1, 1, 0],
  XNOR: [1, 0, 0, 1],
  NOT: [1, 0],
};

describe('logic', () => {
  for (const [type, outputs] of Object.entries(EXPECTED) as [GateType, Bit[]][]) {
    it(`tabela verdade de ${type}`, () => {
      expect(truthTable(type).map((r) => r.output)).toEqual(outputs);
    });
  }

  it('linhas da tabela em ordem binária', () => {
    expect(truthTable('AND').map((r) => r.inputs)).toEqual([[0, 0], [0, 1], [1, 0], [1, 1]]);
    expect(truthTable('NOT').map((r) => r.inputs)).toEqual([[0], [1]]);
  });

  it('truthRowIndex mapeia entradas para a linha', () => {
    expect(truthRowIndex([0, 0])).toBe(0);
    expect(truthRowIndex([1, 0])).toBe(2);
    expect(truthRowIndex([1, 1])).toBe(3);
    expect(truthRowIndex([1])).toBe(1);
    for (const row of truthTable('XOR')) {
      expect(applyGate('XOR', row.inputs)).toBe(truthTable('XOR')[truthRowIndex(row.inputs)]!.output);
    }
  });
});

const level = (partial: Partial<LevelDef> & Pick<LevelDef, 'inputs' | 'gates' | 'output'>): LevelDef => ({ id: 1, ...partial });

// (a AND b) OR (NOT c)
const sample = level({
  inputs: [
    { id: 'a', initial: 1 },
    { id: 'b', initial: 0 },
    { id: 'c', initial: 1 },
  ],
  gates: [
    { id: 'g3', type: 'OR', in: ['g1', 'g2'] },
    { id: 'g1', type: 'AND', in: ['a', 'b'] },
    { id: 'g2', type: 'NOT', in: ['c'] },
  ],
  output: 'g3',
});

describe('circuit', () => {
  it('ordena portas topologicamente mesmo fora de ordem no arquivo', () => {
    const order = topoOrder(sample).map((g) => g.id);
    expect(order.indexOf('g1')).toBeLessThan(order.indexOf('g3'));
    expect(order.indexOf('g2')).toBeLessThan(order.indexOf('g3'));
  });

  it('avalia todos os nós', () => {
    expect(evaluate(sample, initialInputs(sample))).toEqual({ a: 1, b: 0, c: 1, g1: 0, g2: 0, g3: 0 });
    expect(outputValue(sample, { a: 1, b: 1, c: 1 })).toBe(1);
    expect(outputValue(sample, { a: 0, b: 0, c: 0 })).toBe(1);
  });

  it('detecta ciclos e referências inválidas', () => {
    const cyclic = level({
      inputs: [{ id: 'a', initial: 0 }],
      gates: [
        { id: 'g1', type: 'AND', in: ['a', 'g2'] },
        { id: 'g2', type: 'NOT', in: ['g1'] },
      ],
      output: 'g2',
    });
    expect(() => topoOrder(cyclic)).toThrow(/Ciclo/);
    const dangling = level({ inputs: [{ id: 'a', initial: 0 }], gates: [{ id: 'g1', type: 'NOT', in: ['zz'] }], output: 'g1' });
    expect(() => topoOrder(dangling)).toThrow(/não existe/);
  });

  it('calcula profundidade e ancestrais', () => {
    expect(depths(sample)).toMatchObject({ a: 0, g1: 1, g2: 1, g3: 2 });
    expect([...ancestors(sample, 'g1')].sort()).toEqual(['a', 'b', 'g1']);
  });
});

describe('solver', () => {
  it('encontra o mínimo de cliques', () => {
    // inicial a=1 b=0 c=1: ligar b (1 clique) ou desligar c (1 clique)
    const r = solve(sample);
    expect(r.minClicks).toBe(1);
    expect(r.total).toBe(8);
    // soluções: c=0 (4 combinações) + a=b=1,c=1
    expect(r.solutions).toHaveLength(5);
  });

  it('mínimo de cliques com armadilhas', () => {
    // AND(a, NOT b) com a=0, b=1: precisa ligar a e desligar b
    const trap = level({
      inputs: [
        { id: 'a', initial: 0 },
        { id: 'b', initial: 1 },
      ],
      gates: [
        { id: 'n', type: 'NOT', in: ['b'] },
        { id: 'g', type: 'AND', in: ['a', 'n'] },
      ],
      output: 'g',
    });
    expect(solve(trap)).toMatchObject({ minClicks: 2, best: [1, 0] });
  });

  it('sem solução', () => {
    // a AND (NOT a) nunca acende
    const impossible = level({
      inputs: [{ id: 'a', initial: 0 }],
      gates: [
        { id: 'n', type: 'NOT', in: ['a'] },
        { id: 'g', type: 'AND', in: ['a', 'n'] },
      ],
      output: 'g',
    });
    expect(solve(impossible)).toMatchObject({ minClicks: -1, best: null, solutions: [] });
  });
});

describe('validator', () => {
  it('aceita fase válida e calcula estatísticas', () => {
    const r = validateLevel(sample);
    expect(r.errors).toEqual([]);
    expect(r.stats).toMatchObject({ inputs: 3, gates: 3, depth: 2, minClicks: 1, maxFanout: 1 });
  });

  it('rejeita lâmpada começando acesa', () => {
    const lit = { ...sample, inputs: sample.inputs.map((i) => ({ ...i, initial: 0 as Bit })) };
    expect(validateLevel(lit).errors).toContain('A lâmpada não pode começar acesa');
  });

  it('rejeita chave ou porta desconectada', () => {
    const r = validateLevel({ ...sample, inputs: [...sample.inputs, { id: 'd', initial: 0 }], gates: [...sample.gates, { id: 'x', type: 'NOT', in: ['a'] }] });
    expect(r.errors).toContain('A chave "d" não está ligada à lâmpada');
    expect(r.errors).toContain('A porta "x" não está ligada à lâmpada');
  });

  it('rejeita aridade errada, porta não apresentada e ids repetidos', () => {
    const r = validateLevel(
      {
        ...sample,
        gates: [
          { id: 'g3', type: 'XOR', in: ['g1', 'g2'] },
          { id: 'g1', type: 'AND', in: ['a'] },
          { id: 'g2', type: 'NOT', in: ['c'] },
          { id: 'a', type: 'NOT', in: ['b'] },
        ],
      },
      { allowedGates: new Set<GateType>(['AND', 'OR', 'NOT']) },
    );
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('Id repetido: "a"');
    expect(r.errors.some((e) => e.includes('"g1" (AND) precisa de 2'))).toBe(true);
    expect(r.errors).toContain('A porta XOR ainda não foi apresentada nesta fase');
  });

  it('rejeita saída que não é porta', () => {
    expect(validateLevel({ ...sample, output: 'a' }).errors.some((e) => e.includes('saída'))).toBe(true);
  });
});
