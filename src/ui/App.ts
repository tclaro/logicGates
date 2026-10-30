import { audio } from '../audio/AudioManager';
import type { GateType } from '../core/types';
import { introGateFor } from '../levels/chapters';
import { getLevel, LEVELS } from '../levels';
import type { Stage } from '../render/Stage';
import { highestUnlocked, isUnlocked, loadProgress, markCompleted, markIntroSeen, saveProgress, type Progress } from '../storage/progress';
import { GameScreen } from './screens/GameScreen';
import { GlossaryScreen } from './screens/GlossaryScreen';
import { IntroScreen } from './screens/IntroScreen';
import { LevelSelectScreen } from './screens/LevelSelectScreen';
import { MenuScreen } from './screens/MenuScreen';
import type { Screen } from './screens/Screen';

/** Navegação entre telas e regras de progresso. */
export class App {
  progress: Progress = loadProgress();
  private base: Screen | null = null;
  private readonly overlays: Screen[] = [];

  constructor(
    readonly stage: Stage,
    private readonly root: HTMLElement,
  ) {
    audio.setSound(this.progress.sound);
    audio.setMusic(this.progress.music);
    audio.installUnlock();
    root.addEventListener('click', (e) => {
      if ((e.target as Element).closest('button')) audio.play('ui_click');
    });
  }

  get total(): number {
    return LEVELS.length;
  }

  get game(): GameScreen | null {
    return this.base instanceof GameScreen ? this.base : null;
  }

  private setProgress(p: Progress): void {
    this.progress = p;
    saveProgress(p);
  }

  private show(screen: Screen): void {
    while (this.overlays.length) this.closeOverlay();
    this.base?.destroy?.();
    this.base?.el.remove();
    this.base = screen;
    this.root.append(screen.el);
    screen.mount?.();
    screen.el.querySelector<HTMLElement>('h1, button')?.focus({ preventScroll: true });
  }

  private openOverlay(screen: Screen): void {
    screen.el.classList.add('overlay');
    this.overlays.push(screen);
    this.root.append(screen.el);
    screen.mount?.();
  }

  private closeOverlay(): void {
    const top = this.overlays.pop();
    top?.destroy?.();
    top?.el.remove();
  }

  /** Próxima fase a jogar: a primeira não concluída, ou null se todas foram. */
  nextLevel(): number | null {
    const done = new Set(this.progress.completed);
    return LEVELS.find((l) => !done.has(l.id))?.id ?? null;
  }

  showMenu(): void {
    this.show(
      new MenuScreen({
        nextLevel: this.nextLevel(),
        hasProgress: this.progress.completed.length > 0,
        sound: this.progress.sound,
        music: this.progress.music,
        onPlay: () => this.startLevel(this.nextLevel() ?? 1),
        onLevels: () => this.showLevels(),
        onGlossary: () => this.openGlossary(),
        onSound: (on) => {
          audio.setSound(on);
          this.setProgress({ ...this.progress, sound: on });
        },
        onMusic: (on) => {
          audio.setMusic(on);
          this.setProgress({ ...this.progress, music: on });
        },
      }),
    );
  }

  showLevels(): void {
    this.show(
      new LevelSelectScreen({
        total: this.total,
        completed: new Set(this.progress.completed),
        highestUnlocked: highestUnlocked(this.progress, this.total),
        onPick: (id) => this.startLevel(id),
        onBack: () => this.showMenu(),
      }),
    );
  }

  openGlossary(): void {
    this.openOverlay(
      new GlossaryScreen({
        seen: new Set(this.progress.seenIntros),
        onOpen: (gate) => this.openOverlay(new IntroScreen({ gate, onDone: () => this.closeOverlay() })),
        onBack: () => this.closeOverlay(),
      }),
    );
  }

  /** Começa uma fase, passando antes pela apresentação da porta nova, se houver. */
  startLevel(id: number): void {
    if (!isUnlocked(this.progress, id, this.total)) return;
    const gate = introGateFor(id);
    if (gate) this.showIntro(gate, id);
    else this.playLevel(id);
  }

  showIntro(gate: GateType, levelId: number): void {
    this.setProgress(markIntroSeen(this.progress, gate));
    this.show(new IntroScreen({ gate, levelId, onDone: () => this.playLevel(levelId), onClick: () => audio.play('switch') }));
  }

  playLevel(id: number): void {
    const level = getLevel(id);
    if (!level) return;
    const isLast = id === this.total;
    this.show(
      new GameScreen(this.stage, level, {
        isLast,
        onMenu: () => this.showMenu(),
        onGlossary: () => this.openGlossary(),
        onNext: () => this.startLevel(id + 1),
        onLevels: () => this.showLevels(),
        onWin: () => {
          this.setProgress(markCompleted(this.progress, id));
          audio.play('win');
        },
        onLampOn: () => audio.play('lamp_on'),
        onToggle: (value) => audio.play(value ? 'energize' : 'switch'),
        onRestart: () => {},
      }),
    );
  }
}
