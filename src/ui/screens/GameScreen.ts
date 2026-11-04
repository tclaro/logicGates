import { GATE_ARITY, GATE_TYPES } from '../../core/logic';
import type { Bit, GateType, LevelDef, Point, UltimateLevelDef } from '../../core/types';
import { fits, isComplete, isSolution, remainingPieces } from '../../core/ultimate';
import { t } from '../../i18n/i18n';
import type { Board } from '../../render/Board';
import { gateSvg } from '../../render/gateShapes';
import type { Stage } from '../../render/Stage';
import { h, iconButton, ICONS, toggleButton } from '../dom';
import { GatePopover } from '../GatePopover';
import type { Screen } from './Screen';

export interface GameHooks {
  isLast: boolean;
  /** Modo Expert: a energia fica escondida até o aluno tocar em "Ativar", com 3 vidas por fase. */
  expert?: boolean;
  /** Modo Expert: fase onde a partida recomeça depois do fim de jogo. */
  retryLevel?: number;
  /** Modo normal: ao concluir a última fase, convida para o modo Expert quem nunca o jogou. */
  suggestExpert?: boolean;
  /** Modo Ultimate: chaves fixas e o jogador monta o circuito com as peças da bandeja. */
  ultimate?: boolean;
  sound: boolean;
  music: boolean;
  onSound(on: boolean): void;
  onMusic(on: boolean): void;
  onMenu(): void;
  onGlossary(): void;
  onNext(): void;
  onLevels(): void;
  /** Devolve true quando esta vitória liberou um modo novo. */
  onWin(): boolean | void;
  onToggle(value: Bit): void;
  onLampOn(): void;
  onRestart(): void;
  onActivate?(): void;
  onBurn?(livesLeft: number): void;
  onGameOver?(): void;
  onRetry?(): void;
  /** Modo Ultimate: uma peça entrou ou saiu de um encaixe. */
  onPlace?(): void;
}

const HUD_HEIGHT = 58;
const ACTION_BAR_HEIGHT = 64;
/** Modo Ultimate: altura da bandeja de peças (mais a linha do Ativar, quando a energia é escondida). */
const TRAY_HEIGHT = 92;
/** Distância que o dedo precisa andar para um toque na peça virar arrasto. */
const DRAG_THRESHOLD = 8;
export const MAX_LIVES = 3;

const BULB_SVG =
  '<svg viewBox="0 0 24 32" aria-hidden="true"><path class="glass" d="M12 2a9 9 0 0 0-5.2 16.4c1 .8 1.7 2 1.7 3.3V23h7v-1.3c0-1.3.7-2.5 1.7-3.3A9 9 0 0 0 12 2z"/><path class="filament" d="M9 14l1.5-2.5 1.5 2.5 1.5-2.5L15 14"/><rect class="base" x="8.5" y="24" width="7" height="2.4" rx="1"/><rect class="base" x="9.2" y="27.2" width="5.6" height="2.4" rx="1"/></svg>';

/** Tela de jogo: HUD em HTML por cima da placa desenhada no Pixi. */
export class GameScreen implements Screen {
  readonly el: HTMLElement;
  board!: Board;
  won = false;
  /** Modo Expert: lâmpadas de vida que ainda não queimaram. */
  lives = MAX_LIVES;
  private readonly expert: boolean;
  /** Modo Ultimate: a fase com encaixes e peças. */
  private readonly ultimate: UltimateLevelDef | null;
  /** Energia escondida até "Ativar", com vidas (Expert e parte das fases Ultimate). */
  private readonly hidden: boolean;
  private readonly trayButtons = new Map<GateType, HTMLButtonElement>();
  private readonly noticeEl: HTMLElement | null = null;
  private noticeTimer = 0;
  /** Peça escolhida na bandeja, esperando o toque num encaixe. */
  private selected: GateType | null = null;
  private drag: { type: GateType; start: Point; ghost: HTMLElement | null } | null = null;
  /** O clique que o navegador dispara ao fim de um arrasto não deve selecionar a peça. */
  private suppressClick = false;
  private readonly livesEl: HTMLElement | null = null;
  private readonly activateBtn: HTMLButtonElement | null = null;
  private popover: GatePopover | null = null;
  private popoverFrame = 0;
  private winTimer = 0;
  /** Esta vitória liberou um modo novo (Expert no modo normal, Ultimate no Expert). */
  private modeUnlocked = false;
  private readonly victory: HTMLElement;
  private readonly audioBtn: HTMLButtonElement;
  private readonly audioPanel: HTMLElement;
  private sound: boolean;
  private music: boolean;
  private readonly onKey = (e: KeyboardEvent) => this.handleKey(e);
  /**
   * Toque no HUD ou em outra tela fecha o balão; toques na placa não fecham,
   * para o aluno ver a linha da tabela mudar enquanto mexe nas chaves.
   * O painel de som fecha com qualquer toque fora dele.
   */
  private readonly onPointerDown = (e: PointerEvent) => {
    const target = e.target as Node;
    if (!this.audioPanel.hidden && !this.audioPanel.contains(target) && !this.audioBtn.contains(target)) this.setAudioPanel(false);
    if (this.popover && !this.popover.el.contains(target) && target !== this.stage.app.canvas) this.closePopover();
  };

  constructor(
    private readonly stage: Stage,
    readonly level: LevelDef,
    private readonly hooks: GameHooks,
  ) {
    const tipKey = hooks.ultimate ? `ultimate.tip.${level.id}` : `game.tip.${level.id}`;
    const tip = t(tipKey);
    this.expert = hooks.expert ?? false;
    this.ultimate = hooks.ultimate ? (level as UltimateLevelDef) : null;
    this.hidden = this.expert || (this.ultimate?.hidden ?? false);
    this.sound = hooks.sound;
    this.music = hooks.music;
    this.victory = h('div', { class: 'victory hidden', role: 'dialog' });
    this.audioBtn = iconButton('sound', t('game.audio'), () => this.setAudioPanel(this.audioPanel.hidden === true));
    this.audioBtn.setAttribute('aria-expanded', 'false');
    this.audioPanel = h(
      'div',
      { class: 'audio-panel', role: 'group', 'aria-label': t('game.audio'), hidden: true },
      toggleButton('sound', t('menu.sound'), hooks.sound, (on) => {
        this.sound = on;
        this.updateAudioIcon();
        hooks.onSound(on);
      }),
      toggleButton('music', t('menu.music'), hooks.music, (on) => {
        this.music = on;
        this.updateAudioIcon();
        hooks.onMusic(on);
      }),
    );
    this.updateAudioIcon();
    if (this.hidden) {
      this.livesEl = h('div', { class: 'lives', role: 'img', 'data-testid': 'lives' });
      for (let i = 0; i < MAX_LIVES; i++) this.livesEl.append(h('span', { class: 'life', html: BULB_SVG }));
      this.activateBtn = h('button', { class: 'btn primary big activate-btn', 'data-testid': 'activate', onclick: () => this.activate() });
      this.renderLives();
    }
    this.el = h(
      'section',
      { class: 'screen game-screen' },
      h(
        'header',
        { class: 'hud' },
        h('div', { class: 'hud-group' }, iconButton('restart', t('game.restart'), () => this.restart()), iconButton('book', t('game.glossary'), hooks.onGlossary)),
        h(
          'h1',
          { class: 'hud-title', 'data-testid': 'level-title' },
          this.expert ? h('span', { class: 'hud-mode', text: t('expert.mode') }) : null,
          this.ultimate ? h('span', { class: 'hud-mode', text: t('ultimate.mode') }) : null,
          t('game.level', { level: level.id }),
        ),
        h('div', { class: 'hud-group' }, this.audioBtn, iconButton('home', t('game.menu'), hooks.onMenu)),
      ),
      this.audioPanel,
      this.expert || tip.startsWith('[') ? null : h('p', { class: `hud-tip ${this.hidden ? 'below-lives' : ''}`.trim(), text: tip }),
      this.livesEl,
      this.ultimate ? (this.noticeEl = h('p', { class: 'ultimate-notice', role: 'status', hidden: true })) : null,
      this.ultimate
        ? h('div', { class: `action-bar ultimate-bar ${this.hidden ? 'with-activate' : ''}`.trim() }, this.buildTray(this.ultimate), this.activateBtn)
        : this.expert
          ? h('div', { class: 'action-bar' }, this.activateBtn)
          : null,
      this.victory,
    );
  }

  /** Bandeja do Ultimate: um botão por tipo de peça, com quantas ainda restam. */
  private buildTray(level: UltimateLevelDef): HTMLElement {
    const tray = h('div', { class: 'tray', role: 'toolbar', 'aria-label': t('ultimate.tray') });
    for (const type of GATE_TYPES) {
      if (!level.pieces[type]) continue;
      const btn = h('button', {
        class: 'piece',
        'data-testid': `piece-${type}`,
        'aria-pressed': 'false',
        html: `${gateSvg(type, { className: 'piece-svg' })}<span class="piece-count"></span>`,
        onclick: () => {
          if (this.suppressClick) this.suppressClick = false;
          else this.selectPiece(this.selected === type ? null : type);
        },
      });
      btn.addEventListener('pointerdown', (e) => this.pieceDown(type, btn, e));
      btn.addEventListener('pointermove', (e) => this.pieceMove(e));
      btn.addEventListener('pointerup', (e) => this.pieceUp(e));
      btn.addEventListener('pointercancel', () => this.endDrag());
      this.trayButtons.set(type, btn);
      tray.append(btn);
    }
    return tray;
  }

  mount(): void {
    const bottom = this.ultimate ? TRAY_HEIGHT + (this.hidden ? ACTION_BAR_HEIGHT : 0) : this.expert ? ACTION_BAR_HEIGHT : 0;
    this.stage.insets = { top: HUD_HEIGHT, bottom };
    this.board = this.stage.show(
      this.level,
      {
        onToggle: (_, value) => {
          this.hooks.onToggle(value);
          this.updateActivate();
        },
        onGateTap: (id) => this.openPopover(id),
        onSlotTap: (id) => this.tapSlot(id),
        onActivated: (lampOn) => this.activated(lampOn),
        onLampChange: (on) => {
          // Com a energia escondida quem decide é o fim da ativação, não a lâmpada.
          if (!on || this.won || this.hidden) return;
          this.checkLiveWin();
        },
      },
      { hidden: this.hidden, slots: this.ultimate?.slots, fixedInputs: this.ultimate !== null, clock: this.ultimate?.clock },
    );
    this.refreshTray();
    this.updateActivate();
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('pointerdown', this.onPointerDown, true);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('pointerdown', this.onPointerDown, true);
    window.clearTimeout(this.winTimer);
    window.clearTimeout(this.noticeTimer);
    this.endDrag();
    this.closePopover();
    this.stage.clear();
  }

  /** A fase tem lâmpadas de vida (energia escondida até "Ativar"). */
  get usesLives(): boolean {
    return this.hidden;
  }

  /** Energia visível: vence quando a lâmpada acende e a lógica confirma (um pico passageiro não conta). */
  private checkLiveWin(): void {
    if (this.won || this.hidden || !this.board.lampOn) return;
    if (this.ultimate ? !isSolution(this.ultimate, this.board.slotFill) : this.board.logicalValues()[this.level.output] !== 1) return;
    this.win();
  }

  private selectPiece(type: GateType | null): void {
    if (type && (remainingPieces(this.ultimate!, this.board.slotFill)[type] ?? 0) <= 0) type = null;
    this.selected = type;
    for (const [piece, btn] of this.trayButtons) {
      btn.classList.toggle('selected', piece === type);
      btn.setAttribute('aria-pressed', String(piece === type));
    }
    this.board.hintSlots(type ? GATE_ARITY[type] : null);
  }

  /** Contadores da bandeja; uma peça esgotada deixa de estar escolhida. */
  private refreshTray(): void {
    if (!this.ultimate) return;
    const left = remainingPieces(this.ultimate, this.board.slotFill);
    for (const [type, btn] of this.trayButtons) {
      const n = left[type] ?? 0;
      btn.querySelector('.piece-count')!.textContent = `×${n}`;
      btn.disabled = n <= 0;
      btn.setAttribute('aria-label', t('ultimate.piece', { gate: type, count: n }));
    }
    if (this.selected && (left[this.selected] ?? 0) <= 0) this.selectPiece(null);
  }

  /** Toque num encaixe: põe a peça escolhida ou, sem escolha, devolve a peça à bandeja. */
  private tapSlot(slotId: string): void {
    if (this.won || this.board.locked) return;
    if (this.selected) {
      this.place(slotId, this.selected);
      return;
    }
    if (this.board.slotFill[slotId]) {
      this.board.setSlot(slotId, null);
      this.placed();
    } else this.notice(t('ultimate.pick'));
  }

  private place(slotId: string, type: GateType): void {
    if (this.won || this.board.locked) return;
    const fill = this.board.slotFill;
    if (fill[slotId] === type) return;
    if (!fits(this.level, slotId, type)) {
      this.notice(t(GATE_ARITY[type] === 1 ? 'ultimate.noFit1' : 'ultimate.noFit2', { gate: type }));
      return;
    }
    if ((remainingPieces(this.ultimate!, fill)[type] ?? 0) <= 0) return;
    this.board.setSlot(slotId, type);
    this.placed();
  }

  private placed(): void {
    this.hooks.onPlace?.();
    this.refreshTray();
    this.updateActivate();
    this.checkLiveWin();
  }

  private notice(text: string): void {
    const el = this.noticeEl;
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    window.clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => (el.hidden = true), 2600);
  }

  private pieceDown(type: GateType, btn: HTMLButtonElement, e: PointerEvent): void {
    if (this.won || this.board.locked || e.button !== 0) return;
    btn.setPointerCapture(e.pointerId);
    this.drag = { type, start: { x: e.clientX, y: e.clientY }, ghost: null };
  }

  private pieceMove(e: PointerEvent): void {
    const drag = this.drag;
    if (!drag) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.start.x, e.clientY - drag.start.y) < DRAG_THRESHOLD) return;
      const size = 120 * this.stage.scale;
      drag.ghost = h('div', { class: 'piece-ghost', html: gateSvg(drag.type, { className: 'piece-svg' }) });
      drag.ghost.style.width = `${size}px`;
      drag.ghost.style.height = `${(size * 4) / 3}px`;
      document.body.append(drag.ghost);
      this.board.hintSlots(GATE_ARITY[drag.type]);
    }
    drag.ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
  }

  private pieceUp(e: PointerEvent): void {
    const drag = this.drag;
    if (!drag?.ghost) {
      this.drag = null;
      return;
    }
    this.suppressClick = true;
    // O clique sintético só vem quando o dedo é solto sobre o próprio botão.
    window.setTimeout(() => (this.suppressClick = false), 0);
    const slot = this.board.slotAt(this.stage.toBoard({ x: e.clientX, y: e.clientY }));
    this.endDrag();
    if (slot) this.place(slot, drag.type);
  }

  private endDrag(): void {
    this.drag?.ghost?.remove();
    this.drag = null;
    if (this.board) this.board.hintSlots(this.selected ? GATE_ARITY[this.selected] : null);
  }

  private setAudioPanel(open: boolean): void {
    this.audioPanel.hidden = !open;
    this.audioBtn.setAttribute('aria-expanded', String(open));
    this.audioBtn.classList.toggle('active', open);
  }

  /** Com efeitos e música desligados, o botão mostra o alto-falante riscado. */
  private updateAudioIcon(): void {
    this.audioBtn.innerHTML = this.sound || this.music ? ICONS.sound : ICONS.soundOff;
  }

  /** Modo Expert: o aluno confirma as chaves e a energia corre. */
  activate(): void {
    if (!this.hidden || this.won || this.lives === 0 || this.board.revealed) return;
    if (this.ultimate && !isComplete(this.ultimate, this.board.slotFill)) return;
    this.selectPiece(null);
    this.closePopover();
    this.board.activate();
    this.hooks.onActivate?.();
    this.updateActivate();
  }

  private activated(lampOn: boolean): void {
    if (lampOn) {
      this.win();
      return;
    }
    this.lives--;
    this.renderLives();
    this.hooks.onBurn?.(this.lives);
    if (this.lives === 0) {
      this.board.locked = true;
      this.hooks.onGameOver?.();
      this.winTimer = window.setTimeout(() => this.showGameOver(), 1100);
    }
    this.updateActivate();
  }

  private renderLives(): void {
    if (!this.livesEl) return;
    [...this.livesEl.children].forEach((el, i) => el.classList.toggle('burnt', i >= this.lives));
    this.livesEl.setAttribute('aria-label', t('expert.lives', { count: this.lives }));
  }

  /**
   * "Ativar" só vale com a placa apagada: depois de um erro, é preciso mudar alguma
   * chave, e o próprio botão diz isso (um aviso solto cobriria as chaves).
   */
  private updateActivate(): void {
    const btn = this.activateBtn;
    if (!btn) return;
    const incomplete = this.ultimate !== null && !isComplete(this.ultimate, this.board.slotFill);
    const canActivate = !this.won && this.lives > 0 && !this.board.revealed && !incomplete;
    const waiting = !canActivate && !this.won && this.lives > 0 && !this.board.animating;
    btn.disabled = !canActivate;
    btn.classList.toggle('waiting', waiting);
    const hint = this.board.revealed ? t(this.ultimate ? 'ultimate.hint' : 'expert.hint') : t('ultimate.fill');
    btn.innerHTML = waiting ? hint : `${ICONS.bolt} ${t('expert.activate')}`;
  }

  restart(): void {
    if (this.hidden && this.lives === 0) return;
    window.clearTimeout(this.winTimer);
    this.closePopover();
    this.won = false;
    this.victory.classList.add('hidden');
    this.board.reset();
    this.selectPiece(null);
    this.refreshTray();
    this.updateActivate();
    this.hooks.onRestart();
  }

  private win(): void {
    this.won = true;
    this.board.locked = true;
    this.board.celebrate();
    this.closePopover();
    this.updateActivate();
    this.hooks.onLampOn();
    this.modeUnlocked = this.hooks.onWin() === true;
    this.winTimer = window.setTimeout(() => this.showVictory(), 1100);
  }

  private showVictory(): void {
    if (this.expert) {
      this.showExpertVictory();
      return;
    }
    const last = this.hooks.isLast;
    const u = this.ultimate !== null;
    const finalText = u
      ? t('ultimate.final.text', { count: this.level.id })
      : this.hooks.suggestExpert
        ? t('win.final.suggestExpert')
        : t('win.final.text', { count: this.level.id });
    const title = last ? t(u ? 'ultimate.final.title' : 'win.final.title') : t('win.title');
    this.victory.replaceChildren(
      h(
        'div',
        { class: 'victory-card' },
        h('h2', { text: title }),
        h('p', { 'data-testid': 'win-text', text: last ? finalText : t(u ? 'ultimate.win.text' : 'win.text', { level: this.level.id }) }),
        h(
          'div',
          { class: 'victory-actions' },
          last
            ? h('button', { class: 'btn primary big', html: `${ICONS.grid} ${t('win.levels')}`, onclick: this.hooks.onLevels })
            : h('button', { class: 'btn primary big', 'data-testid': 'next', html: `${t('win.next')} ${ICONS.next}`, onclick: this.hooks.onNext }),
          h('button', { class: 'btn', html: `${ICONS.restart} ${t('win.replay')}`, onclick: () => this.restart() }),
        ),
      ),
    );
    if (this.modeUnlocked) this.victory.prepend(this.unlockRibbon('expert'));
    this.showCard();
  }

  /** Faixa diagonal sobre a placa anunciando que um modo novo ficou disponível no menu. */
  private unlockRibbon(mode: 'expert' | 'ultimate'): HTMLElement {
    return h(
      'div',
      { class: 'unlock-ribbon-wrap' },
      h(
        'div',
        { class: 'unlock-ribbon', role: 'status', 'data-testid': `${mode}-unlocked` },
        h('strong', { html: `${ICONS.bolt} ${t(`${mode}.unlocked.title`)} ${ICONS.bolt}` }),
        h('small', { text: t('expert.unlocked.text') }),
      ),
    );
  }

  private showExpertVictory(): void {
    const last = this.hooks.isLast;
    this.victory.replaceChildren(
      h(
        'div',
        { class: 'victory-card' },
        h('h2', { text: last ? t('expert.final.title') : t('win.title') }),
        h('p', { text: last ? t('expert.final.text', { count: this.level.id }) : t('expert.win.text', { level: this.level.id }) }),
        h(
          'div',
          { class: 'victory-actions' },
          last
            ? h('button', { class: 'btn primary big', html: `${ICONS.home} ${t('expert.over.menu')}`, onclick: this.hooks.onMenu })
            : h('button', { class: 'btn primary big', 'data-testid': 'next', html: `${t('win.next')} ${ICONS.next}`, onclick: this.hooks.onNext }),
        ),
      ),
    );
    if (this.modeUnlocked) this.victory.prepend(this.unlockRibbon('ultimate'));
    this.showCard();
  }

  private showGameOver(): void {
    const level = this.hooks.retryLevel ?? 1;
    const u = this.ultimate !== null;
    this.victory.replaceChildren(
      h(
        'div',
        { class: 'victory-card game-over' },
        h('h2', { text: t('expert.over.title') }),
        h('p', { text: u ? t('ultimate.over.text') : t('expert.over.text', { level }) }),
        h(
          'div',
          { class: 'victory-actions' },
          h('button', {
            class: 'btn primary big',
            'data-testid': 'retry',
            html: `${ICONS.restart} ${u ? t('ultimate.over.retry') : t('expert.over.retry', { level })}`,
            onclick: () => this.hooks.onRetry?.(),
          }),
          h('button', { class: 'btn', html: `${ICONS.home} ${t('expert.over.menu')}`, onclick: this.hooks.onMenu }),
        ),
      ),
    );
    this.showCard();
  }

  private showCard(): void {
    this.victory.classList.remove('hidden');
    (this.victory.querySelector('.btn.primary') as HTMLButtonElement | null)?.focus();
  }

  /** Entradas da porta na ordem visual dos pinos (A = esquerda). */
  private visualInputs(gateId: string): Bit[] {
    const gate = this.board.layout.gates.find((g) => g.id === gateId)!;
    const bySlot = this.board.gateInputsVisual(gateId);
    return gate.inEdges.map((edgeId) => bySlot[this.board.layout.edges.find((e) => e.id === edgeId)!.slot] ?? 0);
  }

  private openPopover(gateId: string): void {
    this.closePopover();
    const gate = this.board.layout.gates.find((g) => g.id === gateId);
    if (!gate) return;
    const pop = new GatePopover(gateId, gate.type, () => this.closePopover());
    this.popover = pop;
    this.el.append(pop.el);
    const anchor = this.stage.toClient({ x: gate.x, y: gate.y });
    pop.place(anchor, 80 * this.stage.scale + 12);
    // Com a energia escondida a tabela aparece sem a linha atual, que a entregaria.
    if (this.hidden) return;
    const tick = () => {
      pop.update(this.visualInputs(gateId));
      this.popoverFrame = requestAnimationFrame(tick);
    };
    tick();
  }

  private closePopover(): void {
    cancelAnimationFrame(this.popoverFrame);
    this.popover?.el.remove();
    this.popover = null;
  }

  private handleKey(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Enter' && this.hidden && !(e.target instanceof HTMLButtonElement)) this.activate();
    else if (e.key === 'Escape') {
      this.closePopover();
      if (this.ultimate) this.selectPiece(null);
      this.setAudioPanel(false);
    } else if (e.key === 'r' || e.key === 'R') this.restart();
    else if (/^[1-9]$/.test(e.key)) {
      const input = this.board.layout.inputs.find((i) => i.index === Number(e.key) - 1);
      if (input) this.board.toggle(input.id);
    }
  }
}
