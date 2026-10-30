import { Application } from 'pixi.js';
import type { LevelDef, Point } from '../core/types';
import { BOARD_H, BOARD_W } from '../layout/geometry';
import { loadTextures, type GameTextures } from './assets';
import { Board, type BoardCallbacks, type BoardOptions } from './Board';

/** Aplicação Pixi única; mostra uma placa por vez, ajustada à área disponível. */
export class Stage {
  readonly app = new Application();
  private textures!: GameTextures;
  private host!: HTMLElement;
  private observer?: ResizeObserver;
  board: Board | null = null;
  /** Espaço reservado (em px de CSS) no topo e na base para o HUD. */
  insets = { top: 0, bottom: 0 };

  async init(host: HTMLElement): Promise<void> {
    this.host = host;
    await this.app.init({
      resizeTo: host,
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      preference: 'webgl',
    });
    host.appendChild(this.app.canvas);
    this.textures = await loadTextures();
    this.app.ticker.add((ticker) => this.board?.update(Math.min(ticker.deltaMS / 1000, 0.05)));
    this.observer = new ResizeObserver(() => this.fit());
    this.observer.observe(host);
  }

  show(level: LevelDef, callbacks: BoardCallbacks = {}, options: BoardOptions = {}): Board {
    this.clear();
    this.board = new Board(level, this.textures, callbacks, options);
    this.app.stage.addChild(this.board);
    this.fit();
    return this.board;
  }

  clear(): void {
    if (!this.board) return;
    this.app.stage.removeChild(this.board);
    this.board.destroy({ children: true });
    this.board = null;
  }

  /** Escala a placa para caber na área visível, centralizada. */
  fit(): void {
    if (!this.board) return;
    this.app.resize();
    const w = this.host.clientWidth;
    const h = this.host.clientHeight - this.insets.top - this.insets.bottom;
    const scale = Math.min(w / BOARD_W, h / BOARD_H);
    this.board.scale.set(scale);
    this.board.position.set((w - BOARD_W * scale) / 2, this.insets.top + (h - BOARD_H * scale) / 2);
    // O HUD em HTML usa a posição da placa para ficar alinhado a ela em telas largas.
    const root = document.documentElement.style;
    root.setProperty('--board-w', `${BOARD_W * scale}px`);
    root.setProperty('--board-top', `${this.board.y}px`);
  }

  /** Converte um ponto da placa para coordenadas da janela (clientX/clientY). */
  toClient(p: Point): Point {
    if (!this.board) return p;
    const global = this.board.toGlobal(p);
    const rect = this.app.canvas.getBoundingClientRect();
    return { x: rect.left + global.x, y: rect.top + global.y };
  }

  /** Tamanho de uma unidade da placa em px de CSS. */
  get scale(): number {
    return this.board?.scale.x ?? 1;
  }
}
