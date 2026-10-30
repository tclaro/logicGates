import type { Bit, LevelDef } from '../../core/types';
import { t } from '../../i18n/i18n';
import type { Board } from '../../render/Board';
import type { Stage } from '../../render/Stage';
import { h, iconButton, ICONS, toggleButton } from '../dom';
import { GatePopover } from '../GatePopover';
import type { Screen } from './Screen';

export interface GameHooks {
  isLast: boolean;
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
}

const HUD_HEIGHT = 58;

/** Tela de jogo: HUD em HTML por cima da placa desenhada no Pixi. */
export class GameScreen implements Screen {
  readonly el: HTMLElement;
  board!: Board;
  won = false;
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
    this.el = h(
      'section',
      { class: 'screen game-screen' },
      h(
        'header',
        { class: 'hud' },
        h('div', { class: 'hud-group' }, iconButton('restart', t('game.restart'), () => this.restart()), iconButton('book', t('game.glossary'), hooks.onGlossary)),
        h('h1', { class: 'hud-title', 'data-testid': 'level-title', text: t('game.level', { level: level.id }) }),
        h('div', { class: 'hud-group' }, this.audioBtn, iconButton('home', t('game.menu'), hooks.onMenu)),
      ),
      this.audioPanel,
      tip.startsWith('[') ? null : h('p', { class: 'hud-tip', text: tip }),
      this.victory,
    );
  }

  mount(): void {
    this.stage.insets = { top: HUD_HEIGHT, bottom: 0 };
    this.board = this.stage.show(this.level, {
      onToggle: (_, value) => {
        this.hooks.onToggle(value);
      },
      onGateTap: (id) => this.openPopover(id),
      onLampChange: (on) => {
        if (!on || this.won) return;
        // Só vale se a lógica também diz que acendeu (um pico passageiro não conta).
        if (this.board.logicalValues()[this.level.output] !== 1) return;
        this.win();
      },
    });
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

  restart(): void {
    window.clearTimeout(this.winTimer);
    this.closePopover();
    this.won = false;
    this.victory.classList.add('hidden');
    this.board.reset();
    this.hooks.onRestart();
  }

  private win(): void {
    this.won = true;
    this.board.locked = true;
    this.board.celebrate();
    this.closePopover();
    this.hooks.onLampOn();
    this.hooks.onWin();
    this.winTimer = window.setTimeout(() => this.showVictory(), 1100);
  }

  private showVictory(): void {
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
    if (e.key === 'Escape') {
      this.closePopover();
      this.setAudioPanel(false);
    }
    else if (e.key === 'r' || e.key === 'R') this.restart();
    else if (/^[1-9]$/.test(e.key)) {
      const input = this.board.layout.inputs.find((i) => i.index === Number(e.key) - 1);
      if (input) this.board.toggle(input.id);
    }
  }
}
