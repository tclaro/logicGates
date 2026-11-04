import './ui/styles.css';
import { audio } from './audio/AudioManager';
import { solve } from './core/solver';
import { solveUltimate } from './core/ultimate';
import { getLevel, getUltimateLevel, ULTIMATE_LEVELS } from './levels';
import { Stage } from './render/Stage';
import { App } from './ui/App';

const stage = new Stage();
await stage.init(document.getElementById('stage')!);
const app = new App(stage, document.getElementById('ui')!);
void audio.load();

// Em desenvolvimento, ?level=N abre direto uma fase.
const params = new URLSearchParams(location.search);
const direct = Number(params.get('level'));
const directUltimate = Number(params.get('ultimate'));
if (import.meta.env.DEV && direct && getLevel(direct)) app.playLevel(direct);
else if (import.meta.env.DEV && directUltimate && getUltimateLevel(directUltimate)) app.playUltimate(directUltimate);
else app.showMenu();

if (import.meta.env.DEV) {
  // Ganchos para os testes de ponta a ponta.
  Object.assign(window, {
    __game: {
      app,
      stage,
      audio,
      /** Ponto de tela (clientX/clientY) do centro de uma chave ou porta. */
      pointOf(id: string) {
        const p = stage.board?.anchorOf(id);
        return p ? stage.toClient(p) : null;
      },
      solution(levelId: number) {
        return solve(getLevel(levelId)!).best;
      },
      ultimateLevels: ULTIMATE_LEVELS.length,
      /** Uma montagem que resolve a fase do Ultimate: peça por encaixe. */
      ultimateSolution(levelId: number) {
        return solveUltimate(getUltimateLevel(levelId)!)[0] ?? null;
      },
      state() {
        const board = stage.board;
        return board
          ? { level: board.level.id, inputs: board.inputState, lampOn: board.lampOn, animating: board.animating, won: app.game?.won ?? false, lives: app.game?.usesLives ? app.game.lives : null, slots: board.slotFill }
          : null;
      },
    },
  });
}
