import { GATE_ARITY, GATE_TYPES } from '../../core/logic';
import type { Bit, GateType, LevelDef, Point, UltimateLevelDef } from '../../core/types';
import { fits, isComplete, isSolution, remainingPieces } from '../../core/ultimate';
import { t } from '../../i18n/i18n';
import type { Difficulty } from '../../levels/campaign';
import { isLeftStripFree, leftClearance } from '../../layout/clearance';
import { MAX_LIVES } from '../../storage/progress';
import type { Board } from '../../render/Board';
import { gateSvg } from '../../render/gateShapes';
import type { Stage } from '../../render/Stage';
import { h, iconButton, ICONS, toggleButton } from '../dom';
import { GatePopover } from '../GatePopover';
import type { Screen } from './Screen';

export interface GameHooks {
  /**
   * Médio: a energia fica escondida até o aluno tocar em "Ativar", com 3 vidas.
   * Difícil: chaves fixas e o jogador monta o circuito com as peças da bandeja.
   */
  difficulty: Difficulty;
  isLast: boolean;
  /** Total de fases, para o texto da vitória final. */
  total: number;
  /** Lâmpadas de vida que o jogador traz das fases anteriores. */
  lives: number;
  /** Barra de energia: gasta a cada toque numa chave (fácil) ou peça encaixada (difícil sem "Ativar"). */
  energy?: { capacity: number; left: number };
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
  /** Uma lâmpada de vida queimou (a última leva ao fim de jogo). */
  onLifeLost(): void;
  /** A barra de energia mudou. */
  onEnergy?(left: number): void;
  onGameOver?(): void;
  onRetry?(): void;
  /** Fase difícil: uma peça entrou ou saiu de um encaixe. */
  onPlace?(): void;
}

const HUD_HEIGHT = 58;
const ACTION_BAR_HEIGHT = 64;
/** Espaço (px) entre a bandeja de peças e o que estiver em volta dela. */
const TRAY_GAP = 8;
/** Formas da bandeja, em ordem de preferência: [duas colunas, peças menores]. */
const TRAY_SHAPES: [boolean, boolean][] = [
  [false, false],
  [true, false],
  [false, true],
  [true, true],
];
/** Distância que o dedo precisa andar para um toque na peça virar arrasto. */
const DRAG_THRESHOLD = 8;

const BULB_SVG =
  '<svg viewBox="0 0 24 32" aria-hidden="true"><path class="glass" d="M12 2a9 9 0 0 0-5.2 16.4c1 .8 1.7 2 1.7 3.3V23h7v-1.3c0-1.3.7-2.5 1.7-3.3A9 9 0 0 0 12 2z"/><path class="filament" d="M9 14l1.5-2.5 1.5 2.5 1.5-2.5L15 14"/><rect class="base" x="8.5" y="24" width="7" height="2.4" rx="1"/><rect class="base" x="9.2" y="27.2" width="5.6" height="2.4" rx="1"/></svg>';

/** Tela de jogo: HUD em HTML por cima da placa desenhada no Pixi. */
export class GameScreen implements Screen {
  readonly el: HTMLElement;
  board!: Board;
  won = false;
  /** Lâmpadas de vida que ainda não queimaram; passam de uma fase para a outra. */
  lives: number;
  /** Barra de energia (jogadas que restam antes de queimar uma lâmpada), quando a fase tem uma. */
  private readonly energy: { capacity: number; left: number } | null;
  private readonly energyEl: HTMLElement | null = null;
  private readonly expert: boolean;
  /** Fase difícil: a fase com encaixes e peças. */
  private readonly ultimate: UltimateLevelDef | null;
  /** Energia escondida até "Ativar", com vidas (fases médias e parte das difíceis). */
  private readonly hidden: boolean;
  private readonly trayButtons = new Map<GateType, HTMLButtonElement>();
  /** Fase difícil: bandeja na lateral esquerda, por cima da placa onde não cobre nada. */
  private readonly trayEl: HTMLElement | null = null;
  /** Fase difícil: menor x ocupado em cada linha da placa, para posicionar a bandeja. */
  private clearance: Float32Array | null = null;
  private readonly noticeEl: HTMLElement | null = null;
  private noticeTimer = 0;
  /** Peça escolhida na bandeja, esperando o toque num encaixe. */
  private selected: GateType | null = null;
  private drag: { type: GateType; start: Point; ghost: HTMLElement | null } | null = null;
  /** O clique que o navegador dispara ao fim de um arrasto não deve selecionar a peça. */
  private suppressClick = false;
  private readonly livesEl: HTMLElement;
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
  private readonly difficultyEl: HTMLElement;
  private readonly tipEl: HTMLElement | null = null;
  private tipFrame = 0;
  /** Reposiciona a bandeja e a dica depois que a placa se ajusta ao novo tamanho da janela. */
  private readonly onResize = () => {
    cancelAnimationFrame(this.tipFrame);
    this.tipFrame = requestAnimationFrame(() => this.placeOverlays());
  };
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
    const tip = t(`game.tip.${level.id}`);
    this.expert = hooks.difficulty === 'medium';
    this.ultimate = hooks.difficulty === 'hard' ? (level as UltimateLevelDef) : null;
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
    this.lives = hooks.lives;
    this.energy = hooks.energy ? { ...hooks.energy } : null;
    if (this.energy) {
      this.energyEl = h(
        'div',
        { class: 'energy', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': String(this.energy.capacity), 'data-testid': 'energy' },
        h('span', { class: 'energy-fill' }),
      );
    }
    const lifeRow = h('div', { class: 'life-row', role: 'img' });
    for (let i = 0; i < MAX_LIVES; i++) lifeRow.append(h('span', { class: 'life', html: BULB_SVG }));
    this.livesEl = h('div', { class: 'lives', 'data-testid': 'lives' }, lifeRow, this.energyEl);
    this.renderLives();
    this.renderEnergy();
    if (this.hidden) this.activateBtn = h('button', { class: 'btn primary big activate-btn', 'data-testid': 'activate', onclick: () => this.activate() });
    this.difficultyEl = h('div', { class: `difficulty-label diff-${hooks.difficulty}`, 'data-testid': 'difficulty', text: t(`difficulty.${hooks.difficulty}`) });
    if (!tip.startsWith('[')) this.tipEl = h('p', { class: 'hud-tip', text: tip });
    if (this.ultimate) this.trayEl = this.buildTray(this.ultimate);
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
      this.difficultyEl,
      this.tipEl,
      this.livesEl,
      this.ultimate ? (this.noticeEl = h('p', { class: 'ultimate-notice', role: 'status', hidden: true })) : null,
      this.trayEl,
      this.hidden ? h('div', { class: 'action-bar' }, this.activateBtn) : null,
      this.victory,
    );
  }

  /** Bandeja da fase difícil: um botão por tipo de peça, com quantas ainda restam. */
  private buildTray(level: UltimateLevelDef): HTMLElement {
    const tray = h('div', { class: 'tray', role: 'toolbar', 'aria-orientation': 'vertical', 'aria-label': t('tray.label'), 'data-testid': 'tray' });
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
    this.stage.insets = { top: HUD_HEIGHT, bottom: this.hidden ? ACTION_BAR_HEIGHT : 0 };
    this.board = this.stage.show(
      this.level,
      {
        onToggle: (_, value) => {
          this.hooks.onToggle(value);
          this.spendEnergy();
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
    window.addEventListener('resize', this.onResize);
    if (this.ultimate) this.clearance = leftClearance(this.board.layout);
    this.placeOverlays();
  }

  private placeOverlays(): void {
    this.placeTray();
    this.placeTip();
  }

  /**
   * Bandeja na lateral esquerda, logo abaixo do rótulo da dificuldade. Com margem larga ao
   * lado da placa (computador) ela fica na margem; senão, por cima da placa, na primeira altura em
   * que não cobre nenhum elemento do circuito. Se uma coluna não couber, tenta duas,
   * e depois as mesmas formas com peças menores.
   */
  private placeTray(): void {
    const tray = this.trayEl;
    const clearance = this.clearance;
    if (!tray || !clearance) return;
    const screen = this.el.getBoundingClientRect();
    const origin = this.stage.toClient({ x: 0, y: 0 });
    const scale = this.stage.scale;
    const minTop = this.difficultyEl.getBoundingClientRect().bottom + TRAY_GAP;
    const maxBottom = (this.el.querySelector('.action-bar')?.getBoundingClientRect().top ?? screen.bottom) - TRAY_GAP;
    const toBoardY = (clientY: number) => (clientY - origin.y) / scale;
    const put = (left: number, top: number) => {
      tray.style.left = `${left - screen.left}px`;
      tray.style.top = `${top - screen.top}px`;
    };
    for (const [twoCols, compact] of TRAY_SHAPES) {
      tray.classList.toggle('two-cols', twoCols);
      tray.classList.toggle('compact', compact);
      const { width, height } = tray.getBoundingClientRect();
      // Só usa a margem quando ela é larga de verdade; numa faixa estreita (tablet em pé)
      // a bandeja ficaria colada na borda da tela, solta da placa.
      const outside = origin.x >= 2 * (width + TRAY_GAP);
      const left = outside ? origin.x - width - TRAY_GAP : Math.max(TRAY_GAP, origin.x + TRAY_GAP);
      const right = (left + width - origin.x) / scale;
      for (let top = minTop; top + height <= maxBottom; top += 4) {
        if (outside || isLeftStripFree(clearance, right, toBoardY(top), toBoardY(top + height))) {
          put(left, top);
          return;
        }
      }
    }
    // Tela pequena demais para qualquer espaço livre: uma coluna compacta logo abaixo do rótulo.
    tray.classList.remove('two-cols');
    tray.classList.add('compact');
    put(Math.max(TRAY_GAP, origin.x + TRAY_GAP), minTop);
  }

  /** A bandeja está numa posição que não cobre nenhum elemento do circuito (usado nos testes). */
  trayIsClear(): boolean {
    if (!this.trayEl || !this.clearance) return true;
    const r = this.trayEl.getBoundingClientRect();
    const origin = this.stage.toClient({ x: 0, y: 0 });
    const scale = this.stage.scale;
    return isLeftStripFree(this.clearance, (r.right - origin.x) / scale, (r.top - origin.y) / scale, (r.bottom - origin.y) / scale);
  }

  /**
   * A dica fica logo abaixo do HUD quando cabe antes do rótulo da dificuldade e das
   * vidas (placa mais baixa, sobra espaço em cima); senão, desce para baixo deles.
   * Se ela cair ao lado da bandeja de peças, estreita para não cobri-la.
   */
  private placeTip(): void {
    const tip = this.tipEl;
    if (!tip) return;
    tip.style.top = tip.style.left = tip.style.width = tip.style.transform = '';
    this.tipBelowBadges(tip);
    const tray = this.trayEl?.getBoundingClientRect();
    const r = tip.getBoundingClientRect();
    if (!tray || tray.right <= r.left || tray.bottom <= r.top || tray.top >= r.bottom) return;
    const left = tray.right + TRAY_GAP;
    tip.style.transform = 'none';
    tip.style.left = `${left - this.el.getBoundingClientRect().left}px`;
    tip.style.width = `${r.right - left}px`;
    tip.style.top = '';
    this.tipBelowBadges(tip);
  }

  private tipBelowBadges(tip: HTMLElement): void {
    const badges = [this.difficultyEl, this.livesEl].map((el) => el.getBoundingClientRect());
    const natural = tip.getBoundingClientRect();
    if (natural.bottom + 6 <= Math.min(...badges.map((b) => b.top))) return;
    const top = Math.max(...badges.map((b) => b.bottom)) + 8 - this.el.getBoundingClientRect().top;
    tip.style.top = `${top}px`;
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('pointerdown', this.onPointerDown, true);
    window.removeEventListener('resize', this.onResize);
    cancelAnimationFrame(this.tipFrame);
    window.clearTimeout(this.winTimer);
    window.clearTimeout(this.noticeTimer);
    this.endDrag();
    this.closePopover();
    this.stage.clear();
  }

  /** Jogadas que restam na barra de energia (null nas fases sem barra). */
  get energyLeft(): number | null {
    return this.energy?.left ?? null;
  }

  /**
   * Cada jogada (toque numa chave ou peça encaixada) gasta um ponto da barra. Quando ela
   * zera, uma lâmpada de vida estoura e a barra enche de novo, a menos que essa jogada
   * tenha resolvido a fase.
   */
  private spendEnergy(): void {
    const energy = this.energy;
    if (!energy || this.won || this.lives === 0) return;
    energy.left = Math.max(0, energy.left - 1);
    const solved = this.ultimate ? isSolution(this.ultimate, this.board.slotFill) : this.board.logicalValues()[this.level.output] === 1;
    if (energy.left === 0 && !solved) {
      this.loseLife();
      if (this.lives === 0) {
        this.renderEnergy();
        return;
      }
      energy.left = energy.capacity;
      this.energyEl?.classList.remove('refill');
      void this.energyEl?.offsetWidth;
      this.energyEl?.classList.add('refill');
    }
    this.renderEnergy();
    this.hooks.onEnergy?.(energy.left);
  }

  private renderEnergy(): void {
    const energy = this.energy;
    const el = this.energyEl;
    if (!energy || !el) return;
    const ratio = energy.left / energy.capacity;
    (el.firstElementChild as HTMLElement).style.width = `${ratio * 100}%`;
    el.classList.toggle('low', ratio <= 1 / 3);
    el.setAttribute('aria-valuenow', String(energy.left));
    el.setAttribute('aria-label', t('game.energy', { left: energy.left, capacity: energy.capacity }));
  }

  /** Uma lâmpada de vida estoura; sem nenhuma, a fase trava e vem o fim de jogo. */
  private loseLife(): void {
    this.lives--;
    this.renderLives();
    this.hooks.onBurn?.(this.lives);
    this.hooks.onLifeLost();
    if (this.lives === 0) {
      this.board.locked = true;
      this.closePopover();
      this.hooks.onGameOver?.();
      this.winTimer = window.setTimeout(() => this.showGameOver(), 1100);
    }
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
      btn.setAttribute('aria-label', t('tray.piece', { gate: type, count: n }));
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
    } else this.notice(t('tray.pick'));
  }

  private place(slotId: string, type: GateType): void {
    if (this.won || this.board.locked) return;
    const fill = this.board.slotFill;
    if (fill[slotId] === type) return;
    if (!fits(this.level, slotId, type)) {
      this.notice(t(GATE_ARITY[type] === 1 ? 'tray.noFit1' : 'tray.noFit2', { gate: type }));
      return;
    }
    if ((remainingPieces(this.ultimate!, fill)[type] ?? 0) <= 0) return;
    this.board.setSlot(slotId, type);
    // Só encaixar gasta energia; devolver a peça à bandeja é de graça.
    this.spendEnergy();
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

  /** Energia escondida: o aluno confirma as chaves e a energia corre. */
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
    this.loseLife();
    this.updateActivate();
  }

  private renderLives(): void {
    this.livesEl.querySelectorAll('.life').forEach((el, i) => el.classList.toggle('burnt', i >= this.lives));
    this.livesEl.querySelector('.life-row')!.setAttribute('aria-label', t('game.lives', { count: this.lives }));
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
    const hint = this.board.revealed ? t(this.ultimate ? 'game.hint.hard' : 'game.hint.medium') : t('game.fill');
    btn.innerHTML = waiting ? hint : `${ICONS.bolt} ${t('game.activate')}`;
  }

  restart(): void {
    if (this.lives === 0) return;
    // Reiniciar no meio da fase não enche a barra; jogar de novo uma fase vencida, sim.
    if (this.won && this.energy) {
      this.energy.left = this.energy.capacity;
      this.renderEnergy();
      this.hooks.onEnergy?.(this.energy.left);
    }
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
    this.hooks.onWin();
    this.winTimer = window.setTimeout(() => this.showVictory(), 1100);
  }

  private showVictory(): void {
    const last = this.hooks.isLast;
    const text = last
      ? t('win.final.text', { count: this.hooks.total })
      : t(this.ultimate ? 'win.text.hard' : 'win.text', { level: this.level.id });
    this.victory.replaceChildren(
      h(
        'div',
        { class: 'victory-card' },
        h('h2', { text: last ? t('win.final.title') : t('win.title') }),
        h('p', { 'data-testid': 'win-text', text }),
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

  private showGameOver(): void {
    this.victory.replaceChildren(
      h(
        'div',
        { class: 'victory-card game-over' },
        h('h2', { text: t('over.title') }),
        h('p', { text: t(this.ultimate ? 'over.text.hard' : 'over.text') }),
        h(
          'div',
          { class: 'victory-actions' },
          h('button', {
            class: 'btn primary big',
            'data-testid': 'retry',
            html: `${ICONS.restart} ${t('over.retry')}`,
            onclick: () => this.hooks.onRetry?.(),
          }),
          h('button', { class: 'btn', html: `${ICONS.home} ${t('game.menu')}`, onclick: this.hooks.onMenu }),
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
