import { Container, Rectangle, Sprite, Texture, TilingSprite, type FederatedPointerEvent } from 'pixi.js';
import { evaluate, initialInputs } from '../core/circuit';
import type { Bit, InputState, LevelDef, Point } from '../core/types';
import { layoutLevel, type BoardLayout } from '../layout/autoLayout';
import { BOARD_H, BOARD_W } from '../layout/geometry';
import type { GameTextures } from './assets';
import { GateView } from './GateView';
import { LampView } from './LampView';
import { Propagation } from './Propagation';
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
}

export interface BoardOptions {
  /** Permite arrastar portas na horizontal (editor). */
  editable?: boolean;
}

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
  readonly layout: BoardLayout;
  private readonly prop: Propagation;
  private readonly traces: TraceLayer;
  private readonly gateViews = new Map<string, GateView>();
  private readonly switchViews = new Map<string, SwitchView>();
  private readonly lamp: LampView;
  private inputs: InputState;
  private dirty = true;
  private dragging: { view: GateView; dx: number } | null = null;
  /** Quando true, as chaves não respondem (ex.: depois da vitória). */
  locked = false;

  constructor(
    readonly level: LevelDef,
    textures: GameTextures,
    private readonly callbacks: BoardCallbacks = {},
    options: BoardOptions = {},
  ) {
    super();
    this.layout = layoutLevel(level);
    this.inputs = initialInputs(level);

    const bg = textures.board
      ? new TilingSprite({ texture: textures.board, width: BOARD_W, height: BOARD_H })
      : new Sprite(proceduralBoard(level.id));
    bg.width = BOARD_W;
    bg.height = BOARD_H;
    this.addChild(bg);

    this.prop = new Propagation(level, this.layout.edges, this.inputs);
    this.prop.onLampChange = (v) => {
      this.lamp.setOn(v === 1);
      this.callbacks.onLampChange?.(v === 1);
    };
    this.prop.onGateChange = (id, v) => {
      this.gateViews.get(id)?.setActive(v === 1);
      this.callbacks.onGateChange?.(id, v);
    };

    this.traces = new TraceLayer(this.layout, textures.glow);
    this.addChild(this.traces);

    this.lamp = new LampView(textures);
    this.lamp.x = this.layout.lamp.x;
    this.addChild(this.lamp);

    for (const g of this.layout.gates) {
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
    return evaluate(this.level, this.inputs);
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
    if (this.locked || !(inputId in this.inputs)) return;
    const value: Bit = this.inputs[inputId] === 1 ? 0 : 1;
    this.inputs[inputId] = value;
    this.switchViews.get(inputId)!.setValue(value);
    this.prop.setInput(inputId, value);
    this.dirty = true;
    this.callbacks.onToggle?.(inputId, value);
  }

  /** Volta as chaves ao estado inicial, sem animação. */
  reset(): void {
    this.inputs = initialInputs(this.level);
    this.prop.reset(this.level, this.inputs);
    for (const [id, view] of this.switchViews) view.setValue(this.inputs[id]!, false);
    for (const [id, view] of this.gateViews) view.setActive(this.prop.nodeValue(id) === 1);
    this.lamp.setOn(this.prop.lampValue === 1);
    this.locked = false;
    this.dirty = true;
  }

  celebrate(): void {
    this.lamp.celebrate();
  }

  update(dt: number): void {
    const wasAnimating = this.prop.animating;
    this.prop.update(dt);
    if (wasAnimating || this.dirty) {
      this.traces.redraw(this.prop);
      this.dirty = false;
    }
    this.traces.animate(this.prop, dt);
    this.lamp.update(dt);
    for (const v of this.gateViews.values()) v.update(dt);
    for (const v of this.switchViews.values()) v.update(dt);
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
