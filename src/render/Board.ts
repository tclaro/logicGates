import { Container, Rectangle, Sprite, Texture, TilingSprite, type FederatedPointerEvent } from 'pixi.js';
import { evaluate, initialInputs } from '../core/circuit';
import type { Bit, GateType, InputState, LevelDef, Point } from '../core/types';
import { CLOCK_TICKS } from '../core/ultimate';
import { layoutLevel, type BoardLayout } from '../layout/autoLayout';
import { BOARD_H, BOARD_W } from '../layout/geometry';
import type { GameTextures } from './assets';
import { GateView } from './GateView';
import { LampView } from './LampView';
import { Propagation } from './Propagation';
import { SlotView } from './SlotView';
import { SwitchView } from './SwitchView';
import { drawBoardCanvas } from './textures';
import { TraceLayer } from './TraceLayer';

export interface BoardCallbacks {
  onToggle?(inputId: string, value: Bit): void;
  onGateTap?(gateId: string): void;
  /** A lâmpada acendeu ou apagou visualmente (depois da animação). */
  onLampChange?(on: boolean): void;
  onGateChange?(gateId: string, value: Bit): void;
  /** Editor: porta arrastada para uma nova posição horizontal. */
  onGateDrag?(gateId: string, x: number): void;
  /** Energia escondida: a energia ligada por activate() terminou de correr. */
  onActivated?(lampOn: boolean): void;
  /** Fase de montagem: toque num encaixe. */
  onSlotTap?(slotId: string): void;
}

export interface BoardOptions {
  /** Permite arrastar portas na horizontal (editor). */
  editable?: boolean;
  /** Energia escondida até activate() (fases médias e parte das difíceis). */
  hidden?: boolean;
  /** Fase de montagem: portas que começam como encaixes vazios. */
  slots?: readonly string[];
  /** Fase de montagem: as chaves não respondem ao toque. */
  fixedInputs?: boolean;
  /** Fase de montagem: chave que alterna sozinha durante a ativação. */
  clock?: string;
}

/** Tempo que a lâmpada fica à mostra em cada estado da chave automática. */
const CLOCK_HOLD = 0.7;

const boardTextureCache = new Map<number, Texture>();

function proceduralBoard(seed: number): Texture {
  let t = boardTextureCache.get(seed);
  if (!t) {
    t = Texture.from(drawBoardCanvas(seed));
    boardTextureCache.set(seed, t);
  }
  return t;
}

/** Placa de uma fase: desenha o circuito, recebe toques e anima a energia. */
export class Board extends Container {
  /** A fase em jogo; na fase de montagem é uma cópia, com o tipo das peças colocadas nos encaixes. */
  readonly level: LevelDef;
  readonly layout: BoardLayout;
  private readonly prop: Propagation;
  private readonly traces: TraceLayer;
  private readonly gateViews = new Map<string, GateView>();
  private readonly switchViews = new Map<string, SwitchView>();
  private readonly slotViews = new Map<string, SlotView>();
  /** Encaixes ainda sem peça. */
  private readonly empty: Set<string>;
  private readonly fixedInputs: boolean;
  private readonly clock: string | null;
  /** Ativação com chave automática em andamento: alternâncias restantes e tempo no estado atual. */
  private cycle: { ticks: number; hold: number } | null = null;
  private readonly lamp: LampView;
  private inputs: InputState;
  private dirty = true;
  private dragging: { view: GateView; dx: number } | null = null;
  /** Quando true, as chaves não respondem (ex.: depois da vitória). */
  locked = false;
  /** Energia escondida: a energia da última ativação está à mostra (até mexer numa chave). */
  revealed = false;
  private readonly hidden: boolean;
  private energizing = false;

  constructor(
    level: LevelDef,
    textures: GameTextures,
    private readonly callbacks: BoardCallbacks = {},
    options: BoardOptions = {},
  ) {
    super();
    // As peças mudam o tipo das portas; a fase original fica intacta.
    this.level = options.slots ? structuredClone(level) : level;
    this.layout = layoutLevel(level);
    this.inputs = initialInputs(level);
    this.hidden = options.hidden ?? false;
    this.empty = new Set(options.slots ?? []);
    this.fixedInputs = options.fixedInputs ?? false;
    this.clock = options.clock ?? null;

    const bg = textures.board
      ? new TilingSprite({ texture: textures.board, width: BOARD_W, height: BOARD_H })
      : new Sprite(proceduralBoard(level.id));
    bg.width = BOARD_W;
    bg.height = BOARD_H;
    this.addChild(bg);

    this.prop = new Propagation(this.level, this.layout.edges, this.inputs, { empty: this.empty });
    this.prop.onLampChange = (v) => {
      // Com a chave automática, a lâmpada só mostra o estado já assentado (sem piscar na transição).
      if (!this.cycle) this.lamp.setOn(v === 1);
      this.callbacks.onLampChange?.(v === 1);
    };
    this.prop.onGateChange = (id, v) => {
      this.gateViews.get(id)?.setActive(v === 1);
      this.callbacks.onGateChange?.(id, v);
    };
    if (this.hidden) this.prop.blackout();

    this.traces = new TraceLayer(this.layout, textures.glow);
    this.addChild(this.traces);

    this.lamp = new LampView(textures);
    this.lamp.x = this.layout.lamp.x;
    this.addChild(this.lamp);

    for (const g of this.layout.gates) {
      if (this.empty.has(g.id)) {
        const slot = new SlotView(g.id, this.level.gates.find((gate) => gate.id === g.id)!.in.length);
        slot.position.set(g.x, g.y);
        slot.on('pointertap', () => this.callbacks.onSlotTap?.(g.id));
        this.slotViews.set(g.id, slot);
        this.addChild(slot);
        continue;
      }
      const view = new GateView(g.id, g.type);
      view.position.set(g.x, g.y);
      view.setActive(this.prop.nodeValue(g.id) === 1);
      view.eventMode = 'static';
      view.cursor = options.editable ? 'ew-resize' : 'help';
      view.on('pointertap', () => {
        if (!this.dragging) this.callbacks.onGateTap?.(g.id);
      });
      if (options.editable) view.on('pointerdown', (e: FederatedPointerEvent) => this.startDrag(view, e));
      this.gateViews.set(g.id, view);
      this.addChild(view);
    }

    for (const input of this.layout.inputs) {
      const view = new SwitchView(input.id, textures);
      view.x = input.x;
      view.setValue(this.inputs[input.id]!, false);
      view.on('pointertap', () => this.toggle(input.id));
      if (this.fixedInputs) view.setFixed();
      if (input.id === this.clock) view.markClock();
      this.switchViews.set(input.id, view);
      this.addChild(view);
    }

    if (options.editable) {
      this.eventMode = 'static';
      this.hitArea = new Rectangle(0, 0, BOARD_W, BOARD_H);
      this.on('globalpointermove', (e: FederatedPointerEvent) => this.moveDrag(e));
      this.on('pointerup', () => this.endDrag());
      this.on('pointerupoutside', () => this.endDrag());
    }
    this.traces.redraw(this.prop);
  }

  get inputState(): InputState {
    return { ...this.inputs };
  }

  /** Valor lógico (instantâneo) de cada nó. */
  logicalValues(): Record<string, Bit> {
    return evaluate(this.level, this.inputs, undefined, this.empty);
  }

  /** Fase de montagem: peça em cada encaixe (null = vazio). */
  get slotFill(): Record<string, GateType | null> {
    return Object.fromEntries([...this.slotViews].map(([id, view]) => [id, view.filled]));
  }

  /**
   * Fase de montagem: põe uma peça no encaixe ou o esvazia. Com a energia visível, a mudança
   * corre pelas trilhas; com ela escondida, mexer depois de uma ativação apaga a placa.
   */
  setSlot(slotId: string, type: GateType | null): void {
    const slot = this.slotViews.get(slotId);
    if (!slot || this.locked) return;
    const view = slot.setPiece(type);
    if (view) this.gateViews.set(slotId, view);
    else this.gateViews.delete(slotId);
    if (type) this.empty.delete(slotId);
    else this.empty.add(slotId);
    this.prop.setGate(slotId, type, !this.hidden);
    if (this.hidden && this.revealed) this.darken();
    this.dirty = true;
  }

  /** Encaixe sob um ponto da placa, se houver. */
  slotAt(p: Point): string | null {
    for (const [id, view] of this.slotViews) {
      if (Math.abs(p.x - view.x) <= 75 && Math.abs(p.y - view.y) <= 85) return id;
    }
    return null;
  }

  /** Destaca os encaixes com esse número de entradas (null tira o destaque). */
  hintSlots(arity: number | null): void {
    for (const view of this.slotViews.values()) view.setHint(arity !== null && view.arity === arity);
  }

  get lampOn(): boolean {
    return this.prop.lampValue === 1;
  }

  get animating(): boolean {
    return this.prop.animating;
  }

  /** Valores que chegaram visualmente aos pinos da porta, na ordem de `gate.in`. */
  gateInputsVisual(gateId: string): Bit[] {
    return this.prop.gateInputs(gateId);
  }

  toggle(inputId: string): void {
    if (this.locked || this.fixedInputs || !(inputId in this.inputs)) return;
    const value: Bit = this.inputs[inputId] === 1 ? 0 : 1;
    this.inputs[inputId] = value;
    this.switchViews.get(inputId)!.setValue(value);
    if (!this.hidden) this.prop.setInput(inputId, value);
    else if (this.revealed) this.darken();
    this.dirty = true;
    this.callbacks.onToggle?.(inputId, value);
  }

  /** Volta as chaves ao estado inicial e esvazia os encaixes, sem animação. */
  reset(): void {
    this.cycle = null;
    for (const [id, slot] of this.slotViews) {
      slot.setPiece(null);
      this.gateViews.delete(id);
      this.empty.add(id);
      this.prop.setGate(id, null, false);
    }
    this.inputs = initialInputs(this.level);
    this.prop.reset(this.level, this.inputs);
    for (const [id, view] of this.switchViews) view.setValue(this.inputs[id]!, false);
    for (const [id, view] of this.gateViews) view.setActive(this.prop.nodeValue(id) === 1);
    this.lamp.setOn(this.prop.lampValue === 1);
    this.locked = false;
    this.energizing = false;
    this.dirty = true;
    if (this.hidden) this.darken();
  }

  /** Energia escondida: liga a energia com as chaves atuais; onActivated avisa quando ela terminar de correr. */
  activate(): void {
    if (!this.hidden || this.locked || this.energizing) return;
    this.darken();
    this.prop.energize(this.inputs);
    if (this.clock) this.cycle = { ticks: CLOCK_TICKS, hold: 0 };
    this.revealed = true;
    this.energizing = true;
    this.locked = true;
    this.dirty = true;
  }

  /** Apaga trilhas, portas e lâmpada, mantendo as chaves como estão. */
  private darken(): void {
    this.prop.blackout();
    for (const view of this.gateViews.values()) view.setActive(false);
    this.lamp.setOn(false);
    this.revealed = false;
    this.dirty = true;
  }

  celebrate(): void {
    this.lamp.celebrate();
  }

  update(dt: number): void {
    const wasAnimating = this.prop.animating;
    this.prop.update(dt);
    if (this.energizing && !this.prop.animating) this.settle(dt);
    if (wasAnimating || this.dirty) {
      this.traces.redraw(this.prop);
      this.dirty = false;
    }
    this.traces.animate(this.prop, dt);
    this.lamp.update(dt);
    for (const v of this.gateViews.values()) v.update(dt);
    for (const v of this.switchViews.values()) v.update(dt);
    for (const v of this.slotViews.values()) v.update(dt);
  }

  /**
   * A energia assentou depois de uma ativação. Com chave automática, a lâmpada precisa
   * aguentar acesa a cada alternância; no primeiro estado apagado, a ativação termina.
   */
  private settle(dt: number): void {
    const cycle = this.cycle;
    if (cycle) {
      this.lamp.setOn(this.lampOn);
      if (this.lampOn && cycle.ticks > 0) {
        cycle.hold += dt;
        if (cycle.hold >= CLOCK_HOLD) {
          cycle.ticks--;
          cycle.hold = 0;
          this.tick(this.clock!);
        }
        return;
      }
    }
    this.cycle = null;
    this.energizing = false;
    this.locked = false;
    this.callbacks.onActivated?.(this.lampOn);
  }

  /** A chave automática muda sozinha e a energia corre a partir dela. */
  private tick(inputId: string): void {
    const value: Bit = this.inputs[inputId] === 1 ? 0 : 1;
    this.inputs[inputId] = value;
    this.switchViews.get(inputId)!.setValue(value);
    this.prop.setInput(inputId, value);
    this.dirty = true;
  }

  /** Centro de uma chave ou porta em coordenadas da placa. */
  anchorOf(id: string): Point | null {
    const sw = this.layout.inputs.find((i) => i.id === id);
    if (sw) return { x: sw.x, y: sw.y };
    const g = this.layout.gates.find((gate) => gate.id === id);
    return g ? { x: g.x, y: g.y } : null;
  }

  private startDrag(view: GateView, e: FederatedPointerEvent): void {
    const local = this.toLocal(e.global);
    this.dragging = { view, dx: view.x - local.x };
  }

  private moveDrag(e: FederatedPointerEvent): void {
    if (!this.dragging) return;
    const local = this.toLocal(e.global);
    this.dragging.view.x = Math.max(60, Math.min(BOARD_W - 60, local.x + this.dragging.dx));
  }

  private endDrag(): void {
    if (!this.dragging) return;
    const { view } = this.dragging;
    const original = this.layout.gates.find((g) => g.id === view.gateId)!;
    if (Math.abs(view.x - original.x) <= 2) {
      this.dragging = null;
      return;
    }
    // Deixa o pointertap que vem logo depois ignorar este toque.
    setTimeout(() => (this.dragging = null), 0);
    this.callbacks.onGateDrag?.(view.gateId, Math.round(view.x));
  }
}
