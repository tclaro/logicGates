import { describe, expect, it } from 'vitest';
import { evaluate, initialInputs } from '../../src/core/circuit';
import { solve, toInputState } from '../../src/core/solver';
import type { Bit, InputState } from '../../src/core/types';
import { layoutLevel, LAMP_ID } from '../../src/layout/autoLayout';
import { LEVELS } from '../../src/levels';
import { Propagation } from '../../src/render/Propagation';

function settle(p: Propagation, maxSeconds = 20): number {
  let t = 0;
  while (p.animating && t < maxSeconds) {
    p.update(1 / 60);
    t += 1 / 60;
  }
  return t;
}

describe('Propagation', () => {
  const level = LEVELS.find((l) => l.id === 7)!; // AND(a, NOT(b)), a=0 b=1
  const layout = layoutLevel(level);

  it('começa em repouso com os valores lógicos', () => {
    const p = new Propagation(level, layout.edges, initialInputs(level));
    expect(p.animating).toBe(false);
    expect(p.lampValue).toBe(0);
    const bEdge = layout.edges.find((e) => e.from === 'b')!;
    expect(p.litRanges(bEdge.id)).toEqual([[0, bEdge.length]]);
  });

  it('a energia avança pela trilha antes de chegar na porta', () => {
    const p = new Propagation(level, layout.edges, initialInputs(level), { speed: 100 });
    const aEdge = layout.edges.find((e) => e.from === 'a')!;
    p.setInput('a', 1);
    p.update(0.5);
    const [range] = p.litRanges(aEdge.id);
    expect(range![0]).toBe(0);
    expect(range![1]).toBeCloseTo(50, 5);
    expect(p.risingFronts(aEdge.id)[0]).toBeCloseTo(50, 5);
  });

  it('a lâmpada acende só depois de o sinal atravessar o circuito', () => {
    const p = new Propagation(level, layout.edges, initialInputs(level));
    const events: Bit[] = [];
    p.onLampChange = (v) => events.push(v);
    p.setInput('a', 1);
    p.setInput('b', 0);
    expect(p.lampValue).toBe(0);
    const t = settle(p);
    expect(p.lampValue).toBe(1);
    expect(events).toEqual([1]);
    expect(t).toBeGreaterThan(0.2);
  });

  it('cliques rápidos geram várias ondas e terminam no valor certo', () => {
    const p = new Propagation(level, layout.edges, initialInputs(level), { speed: 300 });
    const aEdge = layout.edges.find((e) => e.from === 'a')!;
    p.setInput('a', 1);
    p.update(0.2);
    p.setInput('a', 0);
    p.update(0.2);
    p.setInput('a', 1);
    p.update(0.05);
    // trecho perto do início ligado, depois um apagado, depois ligado de novo
    expect(p.litRanges(aEdge.id).length).toBe(2);
    settle(p);
    expect(p.litRanges(aEdge.id)).toEqual([[0, aEdge.length]]);
  });

  it('em todas as fases, a solução do solver acende a lâmpada e o visual bate com a lógica', () => {
    for (const lvl of LEVELS) {
      const lay = layoutLevel(lvl);
      const p = new Propagation(lvl, lay.edges, initialInputs(lvl));
      const best = solve(lvl).best!;
      const target: InputState = toInputState(lvl, best);
      for (const input of lvl.inputs) p.setInput(input.id, target[input.id]!);
      settle(p);
      expect(p.lampValue, `fase ${lvl.id}`).toBe(1);
      const values = evaluate(lvl, target);
      for (const edge of lay.edges) {
        const expected = values[edge.from]!;
        expect(p.litRanges(edge.id), `fase ${lvl.id} aresta ${edge.id}`).toEqual(expected ? [[0, edge.length]] : []);
      }
      for (const gate of lvl.gates) {
        expect(p.gateInputs(gate.id)).toEqual(gate.in.map((src) => values[src]));
      }
      expect(lay.edges.some((e) => e.to === LAMP_ID)).toBe(true);
    }
  });
});
