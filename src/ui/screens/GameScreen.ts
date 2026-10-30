import type { Bit, LevelDef } from '../../core/types';
import { t } from '../../i18n/i18n';
import type { Board } from '../../render/Board';
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
  sound: boolean;
  music: boolean;
  onSound(on: boolean): void;
  onMusic(on: boolean): void;
  onMenu(): void;
  onGlossary(): void;
  onNext(): void;
  onLevels(): void;
  onWin(): void;
  onToggle(value: Bit): void;
  onLampOn(): void;
  onRestart(): void;
  onActivate?(): void;
  onBurn?(livesLeft: number): void;
  onGameOver?(): void;
  onRetry?(): void;
}

const HUD_HEIGHT = 58;
const ACTION_BAR_HEIGHT = 64;
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
  private readonly livesEl: HTMLElement | null = null;
  private readonly activateBtn: HTMLButtonElement | null = null;
  private popover: GatePopover | null = null;
  private popoverFrame = 0;
  private winTimer = 0;
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
    const tipKey = `game.tip.${level.id}`;
    const tip = t(tipKey);
    this.expert = hooks.expert ?? false;
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
    if (this.expert) {
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
          t('game.level', { level: level.id }),
        ),
        h('div', { class: 'hud-group' }, this.audioBtn, iconButton('home', t('game.menu'), hooks.onMenu)),
      ),
      this.audioPanel,
      this.expert || tip.startsWith('[') ? null : h('p', { class: 'hud-tip', text: tip }),
      this.livesEl,
      this.expert ? h('div', { class: 'action-bar' }, this.activateBtn) : null,
      this.victory,
    );
  }

  mount(): void {
    this.stage.insets = { top: HUD_HEIGHT, bottom: this.expert ? ACTION_BAR_HEIGHT : 0 };
    this.board = this.stage.show(
      this.level,
      {
        onToggle: (_, value) => {
          this.hooks.onToggle(value);
          this.updateActivate();
        },
        onGateTap: (id) => this.openPopover(id),
        onActivated: (lampOn) => this.activated(lampOn),
        onLampChange: (on) => {
          // No Expert quem decide é o fim da ativação, não a lâmpada.
          if (!on || this.won || this.expert) return;
          // Só vale se a lógica também diz que acendeu (um pico passageiro não conta).
          if (this.board.logicalValues()[this.level.output] !== 1) return;
          this.win();
        },
      },
      { hidden: this.expert },
    );
    this.updateActivate();
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('pointerdown', this.onPointerDown, true);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('pointerdown', this.onPointerDown, true);
    window.clearTimeout(this.winTimer);
    this.closePopover();
    this.stage.clear();
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
    if (!this.expert || this.won || this.lives === 0 || this.board.revealed) return;
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
    const canActivate = !this.won && this.lives > 0 && !this.board.revealed;
    const waiting = !canActivate && !this.won && this.lives > 0 && !this.board.animating;
    btn.disabled = !canActivate;
    btn.classList.toggle('waiting', waiting);
    btn.innerHTML = waiting ? t('expert.hint') : `${ICONS.bolt} ${t('expert.activate')}`;
  }

  restart(): void {
    if (this.expert && this.lives === 0) return;
    window.clearTimeout(this.winTimer);
    this.closePopover();
    this.won = false;
    this.victory.classList.add('hidden');
    this.board.reset();
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
    this.hooks.onWin();
    this.winTimer = window.setTimeout(() => this.showVictory(), 1100);
  }

  private showVictory(): void {
    if (this.expert) {
      this.showExpertVictory();
      return;
    }
    const last = this.hooks.isLast;
    this.victory.replaceChildren(
      h(
        'div',
        { class: 'victory-card' },
        h('h2', { text: last ? t('win.final.title') : t('win.title') }),
        h('p', { text: last ? t('win.final.text', { count: this.level.id }) : t('win.text', { level: this.level.id }) }),
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
    this.showCard();
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
    this.showCard();
  }

  private showGameOver(): void {
    const level = this.hooks.retryLevel ?? 1;
    this.victory.replaceChildren(
      h(
        'div',
        { class: 'victory-card game-over' },
        h('h2', { text: t('expert.over.title') }),
        h('p', { text: t('expert.over.text', { level }) }),
        h(
          'div',
          { class: 'victory-actions' },
          h('button', { class: 'btn primary big', 'data-testid': 'retry', html: `${ICONS.restart} ${t('expert.over.retry', { level })}`, onclick: () => this.hooks.onRetry?.() }),
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
    // No Expert a tabela aparece sem a linha atual, que entregaria a energia escondida.
    if (this.expert) return;
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
    if (e.key === 'Enter' && this.expert && !(e.target instanceof HTMLButtonElement)) this.activate();
    else if (e.key === 'Escape') {
      this.closePopover();
      this.setAudioPanel(false);
    } else if (e.key === 'r' || e.key === 'R') this.restart();
    else if (/^[1-9]$/.test(e.key)) {
      const input = this.board.layout.inputs.find((i) => i.index === Number(e.key) - 1);
      if (input) this.board.toggle(input.id);
    }
  }
}
