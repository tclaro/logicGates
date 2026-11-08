import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/core/circuit';
import type { UltimateLevelDef } from '../../src/core/types';
import {
  emptyFill,
  fits,
  isComplete,
  isSolution,
  remainingPieces,
  solveUltimate,
  ultimateCases,
  validateUltimate,
} from '../../src/core/ultimate';
import { newPiecesIn, ULTIMATE_LEVELS } from '../../src/levels';
import { layoutLevel } from '../../src/layout/autoLayout';
import { Propagation } from '../../src/render/Propagation';
import { checkLayout } from './layoutChecks';

/** OR(a, NOT a) com a chave `a` alternando: só acende sempre com NOT + OR. */
const tautology: UltimateLevelDef = {
  id: 1,
  inputs: [{ id: 'a', initial: 0 }],
  gates: [
    { id: 'g1', type: 'NOT', in: ['a'] },
    { id: 'g2', type: 'OR', in: ['a', 'g1'] },
  ],
  output: 'g2',
  slots: ['g1', 'g2'],
  pieces: { NOT: 1, AND: 1, OR: 1 },
  hidden: true,
  clock: 'a',
};

describe('modo Ultimate: núcleo', () => {
  it('encaixe vazio não conduz', () => {
    const values = evaluate(tautology, { a: 1 }, undefined, new Set(['g1', 'g2']));
    expect(values.g1).toBe(0);
    expect(values.g2).toBe(0);
    // Sem g1, o OR ainda vê a chave.
    expect(evaluate(tautology, { a: 1 }, undefined, new Set(['g1'])).g2).toBe(1);
  });

  it('peça só cabe em encaixe com o mesmo número de entradas', () => {
    expect(fits(tautology, 'g1', 'NOT')).toBe(true);
    expect(fits(tautology, 'g1', 'AND')).toBe(false);
    expect(fits(tautology, 'g2', 'NOT')).toBe(false);
    expect(fits(tautology, 'g2', 'XOR')).toBe(true);
  });

  it('estoque: peças nos encaixes saem da bandeja e não podem passar do total', () => {
    const fill = { g1: 'NOT', g2: 'OR' } as const;
    expect(remainingPieces(tautology, fill)).toEqual({ NOT: 0, AND: 1, OR: 0 });
    expect(isComplete(tautology, emptyFill(tautology))).toBe(false);
    expect(isComplete(tautology, fill)).toBe(true);
    expect(isComplete({ ...tautology, pieces: { NOT: 1, AND: 1 } }, fill)).toBe(false);
  });

  it('chave automática: a lâmpada precisa acender nos dois valores', () => {
    expect(ultimateCases(tautology)).toEqual([{ a: 0 }, { a: 1 }]);
    expect(isSolution(tautology, { g1: 'NOT', g2: 'OR' })).toBe(true);
    // AND(a, NOT a) nunca acende; um OR sem o NOT só acende com a = 1.
    expect(isSolution(tautology, { g1: 'NOT', g2: 'AND' })).toBe(false);
    expect(isSolution({ ...tautology, clock: undefined, inputs: [{ id: 'a', initial: 1 }] }, { g1: 'NOT', g2: 'OR' })).toBe(true);
    expect(solveUltimate(tautology)).toEqual([{ g1: 'NOT', g2: 'OR' }]);
  });

  it('validação aponta problemas de fase', () => {
    expect(validateUltimate(tautology).errors).toEqual([]);
    expect(validateUltimate({ ...tautology, hidden: false }).errors).toContain('Fase com chave automática precisa de energia escondida');
    expect(validateUltimate({ ...tautology, slots: ['g9'] }).errors).toContain('O encaixe "g9" precisa ser uma porta existente');
    expect(validateUltimate({ ...tautology, pieces: { NOT: 1, AND: 1 } }).errors).toContain('A fase não tem solução');
    const wrongRef = { ...tautology, gates: [tautology.gates[0]!, { id: 'g2', type: 'AND' as const, in: ['a', 'g1'] }] };
    expect(validateUltimate(wrongRef).errors).toContain('As portas gravadas nos encaixes não resolvem a fase com as peças dadas');
  });

  it('propagação: peça colocada faz a energia seguir; esvaziar corta', () => {
    const level = structuredClone({ ...tautology, clock: undefined, hidden: undefined, inputs: [{ id: 'a', initial: 1 as const }] });
    const prop = new Propagation(level, layoutLevel(level).edges, { a: 1 }, { empty: ['g1', 'g2'] });
    const run = () => {
      for (let i = 0; i < 200 && prop.animating; i++) prop.update(0.02);
    };
    expect(prop.lampValue).toBe(0);
    prop.setGate('g2', 'OR', true);
    run();
    expect(prop.lampValue).toBe(1);
    prop.setGate('g2', null, true);
    run();
    expect(prop.lampValue).toBe(0);
  });
});

describe('modo Ultimate: fases', () => {
  it('ids em sequência a partir de 1', () => {
    expect(ULTIMATE_LEVELS.map((l) => l.id)).toEqual(ULTIMATE_LEVELS.map((_, i) => i + 1));
    expect(ULTIMATE_LEVELS.length).toBeGreaterThanOrEqual(10);
  });

  for (const level of ULTIMATE_LEVELS) {
    it(`fase ${level.id} é válida, tem layout limpo e no máximo 2 soluções`, () => {
      const result = validateUltimate(level);
      expect(result.errors).toEqual([]);
      expect(result.stats!.solutions).toBeLessThanOrEqual(2);
      expect(checkLayout(layoutLevel(level)).problems).toEqual([]);
    });
  }

  it('começa com energia visível e só esconde depois; chave automática só uma por fase', () => {
    expect(ULTIMATE_LEVELS[0]!.hidden).toBeFalsy();
    expect(ULTIMATE_LEVELS.some((l) => l.hidden)).toBe(true);
    for (const level of ULTIMATE_LEVELS) if (level.clock) expect(level.hidden).toBe(true);
  });

  it('a fase que estreia uma peça exige essa peça em toda solução', () => {
    for (const level of ULTIMATE_LEVELS) {
      for (const gate of newPiecesIn(level.id)) {
        if (level.id === 1) continue;
        expect(
          solveUltimate(level).every((fill) => Object.values(fill).includes(gate)),
          `fase ${level.id} deveria exigir ${gate}`,
        ).toBe(true);
      }
    }
  });
});
