import { evaluate } from '../core/circuit';
import { applyGate } from '../core/logic';
import type { Bit, GateDef, InputState, LevelDef } from '../core/types';
import { LAMP_ID, type RoutedEdge } from '../layout/autoLayout';

interface Wave {
  pos: number;
  value: Bit;
}

interface EdgeState {
  edge: RoutedEdge;
  /** Valor no trecho que nenhuma onda alcançou ainda (o fim da trilha). */
  settled: Bit;
  /** Ondas em ordem de criação: a mais antiga é a mais distante do início. */
  waves: Wave[];
}

export interface PropagationOptions {
  /** Velocidade da frente de energia em unidades da placa por segundo. */
  speed?: number;
  /** Tempo que cada porta leva para reagir a uma mudança na entrada. */
  gateDelay?: number;
}

/**
 * Simulação visual do sinal: a lógica muda na hora, mas a energia percorre
 * cada trilha numa velocidade finita e cada porta só reage quando o sinal chega.
 */
export class Propagation {
  readonly speed: number;
  readonly gateDelay: number;
  private readonly edges = new Map<string, EdgeState>();
  private readonly outgoing = new Map<string, EdgeState[]>();
  private readonly incoming = new Map<string, EdgeState[]>();
  private readonly gates = new Map<string, GateDef>();
  private readonly sourceValue = new Map<string, Bit>();
  private readonly pending = new Map<string, number>();
  /** Nós que devem emitir o próximo valor mesmo sem mudança (energização a partir do escuro). */
  private readonly forced = new Set<string>();
  private lamp: Bit = 0;

  onLampChange: (value: Bit) => void = () => {};
  onGateChange: (gateId: string, value: Bit) => void = () => {};

  constructor(level: LevelDef, edges: readonly RoutedEdge[], inputs: InputState, options: PropagationOptions = {}) {
    this.speed = options.speed ?? 1100;
    this.gateDelay = options.gateDelay ?? 0.05;
    for (const gate of level.gates) this.gates.set(gate.id, gate);
    for (const edge of edges) {
      const state: EdgeState = { edge, settled: 0, waves: [] };
      this.edges.set(edge.id, state);
      this.outgoing.set(edge.from, [...(this.outgoing.get(edge.from) ?? []), state]);
      this.incoming.set(edge.to, [...(this.incoming.get(edge.to) ?? []), state]);
    }
    for (const list of this.incoming.values()) list.sort((a, b) => a.edge.slot - b.edge.slot);
    this.reset(level, inputs);
  }

  /** Coloca tudo em repouso no valor lógico de `inputs`, sem animação. */
  reset(level: LevelDef, inputs: InputState): void {
    const values = evaluate(level, inputs);
    this.pending.clear();
    this.forced.clear();
    for (const [id, v] of Object.entries(values)) this.sourceValue.set(id, v);
    for (const state of this.edges.values()) {
      state.settled = values[state.edge.from] ?? 0;
      state.waves = [];
    }
    this.lamp = values[level.output] ?? 0;
  }

  get lampValue(): Bit {
    return this.lamp;
  }

  /** Valor que a fonte está mandando agora (chave ou porta), como o jogador vê. */
  nodeValue(id: string): Bit {
    return this.sourceValue.get(id) ?? 0;
  }

  /** Valores que chegaram aos pinos da porta, na ordem de `gate.in`. */
  gateInputs(gateId: string): Bit[] {
    return (this.incoming.get(gateId) ?? []).map((s) => s.settled);
  }

  get animating(): boolean {
    if (this.pending.size) return true;
    for (const s of this.edges.values()) if (s.waves.length) return true;
    return false;
  }

  setInput(id: string, value: Bit): void {
    this.emit(id, value);
  }

  /** Apaga tudo (trilhas, portas e lâmpada em 0), sem animação. */
  blackout(): void {
    this.pending.clear();
    this.forced.clear();
    for (const id of this.sourceValue.keys()) this.sourceValue.set(id, 0);
    for (const state of this.edges.values()) {
      state.settled = 0;
      state.waves = [];
    }
    this.lamp = 0;
  }

  /**
   * Liga a energia a partir das chaves, com tudo apagado. Cada porta decide quando
   * o sinal chega nela, mesmo que seja 0 (uma NOT com entrada 0 também acende).
   */
  energize(inputs: InputState): void {
    for (const id of this.gates.keys()) this.forced.add(id);
    for (const [id, value] of Object.entries(inputs)) {
      this.forced.add(id);
      this.emit(id, value);
    }
  }

  private emit(sourceId: string, value: Bit): void {
    const force = this.forced.delete(sourceId);
    if (!force && this.sourceValue.get(sourceId) === value) return;
    this.sourceValue.set(sourceId, value);
    for (const state of this.outgoing.get(sourceId) ?? []) state.waves.push({ pos: 0, value });
  }

  update(dt: number): void {
    const arrived: EdgeState[] = [];
    for (const state of this.edges.values()) {
      if (!state.waves.length) continue;
      for (const w of state.waves) w.pos += this.speed * dt;
      while (state.waves.length && state.waves[0]!.pos >= state.edge.length) {
        state.settled = state.waves.shift()!.value;
        arrived.push(state);
      }
    }
    for (const state of arrived) {
      if (state.edge.to === LAMP_ID) {
        if (this.lamp !== state.settled) {
          this.lamp = state.settled;
          this.onLampChange(this.lamp);
        }
      } else if (!this.pending.has(state.edge.to)) {
        this.pending.set(state.edge.to, this.gateDelay);
      }
    }
    for (const [gateId, left] of [...this.pending]) {
      const remaining = left - dt;
      if (remaining > 0) {
        this.pending.set(gateId, remaining);
        continue;
      }
      this.pending.delete(gateId);
      const gate = this.gates.get(gateId)!;
      const out = applyGate(gate.type, this.gateInputs(gateId));
      if (out !== this.sourceValue.get(gateId) || this.forced.has(gateId)) {
        this.emit(gateId, out);
        this.onGateChange(gateId, out);
      }
    }
  }

  /** Trechos energizados da trilha como pares [início, fim] em distância ao longo dela. */
  litRanges(edgeId: string): [number, number][] {
    const state = this.edges.get(edgeId);
    if (!state) return [];
    const len = state.edge.length;
    const ranges: [number, number][] = [];
    const push = (a: number, b: number, v: Bit) => {
      if (v !== 1 || b <= a) return;
      const last = ranges[ranges.length - 1];
      if (last && Math.abs(last[1] - a) < 1e-6) last[1] = b;
      else ranges.push([a, b]);
    };
    let start = 0;
    for (let i = state.waves.length - 1; i >= 0; i--) {
      const w = state.waves[i]!;
      const end = Math.min(len, w.pos);
      push(start, end, w.value);
      start = end;
    }
    push(start, len, state.settled);
    return ranges;
  }

  /** Posições das frentes de onda que estão ligando a trilha (para o brilho na ponta). */
  risingFronts(edgeId: string): number[] {
    const state = this.edges.get(edgeId);
    return state ? state.waves.filter((w) => w.value === 1).map((w) => Math.min(w.pos, state.edge.length)) : [];
  }
}
