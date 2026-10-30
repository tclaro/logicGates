import { topoOrder } from '../core/circuit';
import type { GateDef, GateType, LevelDef, Point } from '../core/types';
import {
  BOARD_H,
  BOARD_W,
  GATE_HALF_SPAN,
  GATE_LAYER_BOTTOM,
  GATE_LAYER_MAX_SPACING,
  GATE_LAYER_TOP,
  GATE_PIN_OFFSET,
  GATE_PIN_REACH,
  LAMP_PIN_Y,
  LAMP_X,
  LAMP_Y,
  SIDE_MARGIN,
  SWITCH_MAX_SPACING,
  SWITCH_PIN_Y,
  SWITCH_Y,
  TRACE_HALF_SPAN,
} from './geometry';
import { routeChannel, simplify, polylineLength, type ChannelSegment } from './router';

export const LAMP_ID = '@lamp';

export interface LaidInput {
  id: string;
  index: number;
  x: number;
  y: number;
  pin: Point;
}

export interface LaidGate {
  id: string;
  type: GateType;
  layer: number;
  x: number;
  y: number;
  outPin: Point;
  /** Pinos de entrada da esquerda para a direita. */
  inPins: Point[];
  /** Aresta ligada a cada pino visual (mesma ordem de inPins). */
  inEdges: string[];
}

export interface RoutedEdge {
  id: string;
  from: string;
  /** Id da porta de destino ou LAMP_ID. */
  to: string;
  /** Posição da fonte em `gate.in` (0 para a lâmpada). */
  slot: number;
  points: Point[];
  length: number;
}

export interface BoardLayout {
  width: number;
  height: number;
  lamp: { x: number; y: number; pin: Point };
  inputs: LaidInput[];
  gates: LaidGate[];
  edges: RoutedEdge[];
  /** Pontos onde uma trilha se divide (fan-out). */
  junctions: Point[];
  /** y central de cada camada: 0 = lâmpada, L + 1 = chaves. */
  layerY: number[];
}

interface ChainNode {
  key: string;
  layer: number;
}

interface PlacedNode {
  key: string;
  half: number;
  desired: number;
  x: number;
}

/** Ordem das chaves: a salva no editor, ou a de uma busca em profundidade a partir da saída. */
function inputOrder(level: LevelDef, gatesById: Map<string, GateDef>): string[] {
  const valid = new Set(level.inputs.map((i) => i.id));
  const order: string[] = [];
  const push = (id: string) => {
    if (valid.has(id) && !order.includes(id)) order.push(id);
  };
  if (level.layout?.order) {
    level.layout.order.forEach(push);
  } else {
    const seen = new Set<string>();
    const visit = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      const gate = gatesById.get(id);
      if (gate) gate.in.forEach(visit);
      else push(id);
    };
    visit(level.output);
  }
  level.inputs.forEach((i) => push(i.id));
  return order;
}

/**
 * Separa os nós de uma camada sem trocar a ordem, deslocando-os o mínimo
 * possível das posições desejadas (regressão isotônica por blocos).
 */
export function resolveOverlaps(nodes: PlacedNode[], min = SIDE_MARGIN, max = BOARD_W - SIDE_MARGIN): void {
  const sep = (a: PlacedNode, b: PlacedNode) => a.half + b.half;
  interface Block {
    nodes: PlacedNode[];
    offsets: number[];
    pos: number;
  }
  const blocks: Block[] = [];
  for (const node of nodes) {
    blocks.push({ nodes: [node], offsets: [0], pos: node.desired });
    while (blocks.length >= 2) {
      const cur = blocks[blocks.length - 1]!;
      const prev = blocks[blocks.length - 2]!;
      const prevLast = prev.nodes[prev.nodes.length - 1]!;
      const gap = sep(prevLast, cur.nodes[0]!);
      if (cur.pos >= prev.pos + prev.offsets[prev.offsets.length - 1]! + gap - 1e-6) break;
      const base = prev.offsets[prev.offsets.length - 1]! + gap;
      const merged: Block = {
        nodes: [...prev.nodes, ...cur.nodes],
        offsets: [...prev.offsets, ...cur.offsets.map((o) => o + base)],
        pos: 0,
      };
      merged.pos = merged.nodes.reduce((acc, n, i) => acc + n.desired - merged.offsets[i]!, 0) / merged.nodes.length;
      blocks.splice(blocks.length - 2, 2, merged);
    }
  }
  for (const block of blocks) block.nodes.forEach((n, i) => (n.x = block.pos + block.offsets[i]!));

  // Mantém dentro da placa: empurra da esquerda para a direita e depois de volta.
  const lo = (n: PlacedNode) => min + n.half - GATE_HALF_SPAN / 3;
  const hi = (n: PlacedNode) => max - n.half + GATE_HALF_SPAN / 3;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    n.x = Math.max(n.x, lo(n), i > 0 ? nodes[i - 1]!.x + sep(nodes[i - 1]!, n) : -Infinity);
  }
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i]!;
    n.x = Math.min(n.x, hi(n), i < nodes.length - 1 ? nodes[i + 1]!.x - sep(n, nodes[i + 1]!) : Infinity);
  }
}

export function layoutLevel(level: LevelDef): BoardLayout {
  const gatesById = new Map(level.gates.map((g) => [g.id, g]));
  const order = topoOrder(level);

  // Consumidores de cada nó (quem recebe o sinal dele).
  const consumers = new Map<string, string[]>();
  for (const gate of level.gates) {
    for (const src of gate.in) consumers.set(src, [...(consumers.get(src) ?? []), gate.id]);
  }
  if (gatesById.has(level.output)) consumers.set(level.output, [...(consumers.get(level.output) ?? []), LAMP_ID]);

  // Camadas de cima para baixo: lâmpada = 0, cada porta logo abaixo do consumidor mais baixo.
  const layer = new Map<string, number>([[LAMP_ID, 0]]);
  for (const gate of [...order].reverse()) {
    const cs = consumers.get(gate.id) ?? [];
    layer.set(gate.id, cs.length ? 1 + Math.max(...cs.map((c) => layer.get(c) ?? 0)) : 1);
  }
  const gateLayers = Math.max(1, ...level.gates.map((g) => layer.get(g.id)!));
  const inputLayer = gateLayers + 1;
  for (const input of level.inputs) layer.set(input.id, inputLayer);

  // y de cada camada.
  const layerY: number[] = [LAMP_Y];
  const spacing = gateLayers > 1 ? Math.min(GATE_LAYER_MAX_SPACING, (GATE_LAYER_BOTTOM - GATE_LAYER_TOP) / (gateLayers - 1)) : 0;
  const firstY = (GATE_LAYER_TOP + GATE_LAYER_BOTTOM) / 2 - (spacing * (gateLayers - 1)) / 2;
  for (let k = 1; k <= gateLayers; k++) layerY.push(firstY + spacing * (k - 1));
  layerY.push(SWITCH_Y);

  // Arestas e cadeias com nós fictícios nas camadas atravessadas.
  interface EdgeInfo {
    id: string;
    from: string;
    to: string;
    slot: number;
    chain: ChainNode[]; // de baixo (fonte) para cima (destino)
  }
  const edges: EdgeInfo[] = [];
  const addEdge = (from: string, to: string, slot: number) => {
    const id = `${from}>${to}:${slot}`;
    const s = layer.get(from)!;
    const t = layer.get(to)!;
    const chain: ChainNode[] = [{ key: from, layer: s }];
    for (let k = s - 1; k > t; k--) chain.push({ key: `${id}@${k}`, layer: k });
    chain.push({ key: to, layer: t });
    edges.push({ id, from, to, slot, chain });
  };
  for (const gate of level.gates) gate.in.forEach((src, slot) => addEdge(src, gate.id, slot));
  if (gatesById.has(level.output)) addEdge(level.output, LAMP_ID, 0);

  // Posições horizontais.
  const xOf = new Map<string, number>();
  const inputsOrdered = inputOrder(level, gatesById);
  const inSpacing = Math.min(SWITCH_MAX_SPACING, (BOARD_W - 2 * SIDE_MARGIN) / Math.max(1, inputsOrdered.length));
  inputsOrdered.forEach((id, i) => xOf.set(id, BOARD_W / 2 + (i - (inputsOrdered.length - 1) / 2) * inSpacing));

  const predecessorsAt = new Map<string, string[]>(); // nó -> nós na camada de baixo que o alimentam
  for (const e of edges) {
    for (let i = 1; i < e.chain.length; i++) {
      const key = e.chain[i]!.key;
      predecessorsAt.set(key, [...(predecessorsAt.get(key) ?? []), e.chain[i - 1]!.key]);
    }
  }
  const dummiesByLayer = new Map<number, string[]>();
  for (const e of edges) {
    for (const node of e.chain.slice(1, -1)) dummiesByLayer.set(node.layer, [...(dummiesByLayer.get(node.layer) ?? []), node.key]);
  }

  for (let k = gateLayers; k >= 1; k--) {
    const nodes: PlacedNode[] = [];
    for (const gate of level.gates) {
      if (layer.get(gate.id) !== k) continue;
      const preds = predecessorsAt.get(gate.id) ?? [];
      const override = level.layout?.x?.[gate.id];
      const desired =
        override ?? (preds.length ? preds.reduce((acc, p) => acc + xOf.get(p)!, 0) / preds.length : BOARD_W / 2);
      nodes.push({ key: gate.id, half: GATE_HALF_SPAN, desired, x: desired });
    }
    for (const key of dummiesByLayer.get(k) ?? []) {
      const desired = xOf.get(predecessorsAt.get(key)![0]!)!;
      nodes.push({ key, half: TRACE_HALF_SPAN, desired, x: desired });
    }
    nodes.sort((a, b) => a.desired - b.desired || (a.half === b.half ? a.key.localeCompare(b.key) : b.half - a.half));
    resolveOverlaps(nodes);
    for (const n of nodes) xOf.set(n.key, n.x);
  }
  xOf.set(LAMP_ID, LAMP_X);

  // Pinos das portas: a fonte mais à esquerda vai no pino da esquerda.
  const gates: LaidGate[] = level.gates.map((gate) => {
    const x = xOf.get(gate.id)!;
    const y = layerY[layer.get(gate.id)!]!;
    const incoming = edges.filter((e) => e.to === gate.id);
    incoming.sort((a, b) => xOf.get(a.chain[a.chain.length - 2]!.key)! - xOf.get(b.chain[b.chain.length - 2]!.key)! || a.slot - b.slot);
    const n = incoming.length;
    const inPins = incoming.map((_, i) => ({ x: n === 1 ? x : x + (i === 0 ? -GATE_PIN_OFFSET : GATE_PIN_OFFSET), y: y + GATE_PIN_REACH }));
    return {
      id: gate.id,
      type: gate.type,
      layer: layer.get(gate.id)!,
      x,
      y,
      outPin: { x, y: y - GATE_PIN_REACH },
      inPins,
      inEdges: incoming.map((e) => e.id),
    };
  });
  const gateById = new Map(gates.map((g) => [g.id, g]));

  const inputs: LaidInput[] = level.inputs.map((input) => {
    const x = xOf.get(input.id)!;
    return { id: input.id, index: inputsOrdered.indexOf(input.id), x, y: SWITCH_Y, pin: { x, y: SWITCH_PIN_Y } };
  });

  // Limites verticais dos canais entre camadas.
  const bandTop = (k: number) => (k === inputLayer ? SWITCH_PIN_Y : layerY[k]! - GATE_PIN_REACH);
  const bandBottom = (k: number) => (k === 0 ? LAMP_PIN_Y : layerY[k]! + GATE_PIN_REACH);

  // Ponto de saída (topo) e de entrada (base) de cada nó da cadeia.
  const exitPoint = (node: ChainNode): Point => ({ x: xOf.get(node.key)!, y: bandTop(node.layer) });
  const entryPoint = (node: ChainNode, edge: EdgeInfo): Point => {
    if (node.key === LAMP_ID) return { x: LAMP_X, y: LAMP_PIN_Y };
    const gate = gateById.get(node.key);
    if (gate) return gate.inPins[gate.inEdges.indexOf(edge.id)]!;
    return { x: xOf.get(node.key)!, y: bandBottom(node.layer) };
  };

  // Um trecho por canal para cada aresta; o roteador escolhe as faixas de cada canal.
  const byChannel = new Map<number, ChannelSegment[]>();
  const pieces = new Map<string, Point[][]>();
  for (const e of edges) {
    pieces.set(e.id, []);
    for (let i = 0; i < e.chain.length - 1; i++) {
      const lower = e.chain[i]!;
      const upper = e.chain[i + 1]!;
      const seg: ChannelSegment = { edgeId: e.id, index: i, from: exitPoint(lower), to: entryPoint(upper, e), points: [] };
      byChannel.set(upper.layer, [...(byChannel.get(upper.layer) ?? []), seg]);
    }
  }
  for (const [channel, segs] of byChannel) {
    routeChannel(segs, bandBottom(channel), bandTop(channel + 1));
    for (const seg of segs) pieces.get(seg.edgeId)![seg.index] = seg.points;
  }

  const routed: RoutedEdge[] = edges.map((e) => {
    const points = simplify(pieces.get(e.id)!.flat());
    return { id: e.id, from: e.from, to: e.to, slot: e.slot, points, length: polylineLength(points) };
  });

  return {
    width: BOARD_W,
    height: BOARD_H,
    lamp: { x: LAMP_X, y: LAMP_Y, pin: { x: LAMP_X, y: LAMP_PIN_Y } },
    inputs,
    gates,
    edges: routed,
    junctions: findJunctions(routed),
    layerY,
  };
}

/** Onde trilhas que saem do mesmo pino deixam de seguir juntas. */
function findJunctions(edges: RoutedEdge[]): Point[] {
  const bySource = new Map<string, RoutedEdge[]>();
  for (const e of edges) bySource.set(e.from, [...(bySource.get(e.from) ?? []), e]);
  const junctions: Point[] = [];
  for (const group of bySource.values()) {
    if (group.length < 2) continue;
    const start = group[0]!.points[0]!;
    const departY = Math.max(
      ...group.map((e) => {
        const p1 = e.points[1];
        return p1 && Math.abs(p1.x - start.x) < 0.5 ? p1.y : start.y;
      }),
    );
    junctions.push({ x: start.x, y: departY });
  }
  return junctions;
}
