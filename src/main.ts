import './ui/styles.css';
import { audio } from './audio/AudioManager';
import { solve } from './core/solver';
import { getLevel } from './levels';
import { Stage } from './render/Stage';
import { App } from './ui/App';

const stage = new Stage();
await stage.init(document.getElementById('stage')!);
const app = new App(stage, document.getElementById('ui')!);
void audio.load();

// Em desenvolvimento, ?level=N abre direto uma fase.
const params = new URLSearchParams(location.search);
const direct = Number(params.get('level'));
if (import.meta.env.DEV && direct && getLevel(direct)) app.playLevel(direct);
else app.showMenu();

if (import.meta.env.DEV) {
  // Ganchos para os testes de ponta a ponta.
  Object.assign(window, {
    __game: {
      app,
      stage,
      /** Ponto de tela (clientX/clientY) do centro de uma chave ou porta. */
      pointOf(id: string) {
        const p = stage.board?.anchorOf(id);
        return p ? stage.toClient(p) : null;
      },
      solution(levelId: number) {
        return solve(getLevel(levelId)!).best;
      },
      state() {
        const board = stage.board;
        return board
          ? { level: board.level.id, inputs: board.inputState, lampOn: board.lampOn, animating: board.animating, won: app.game?.won ?? false }
          : null;
      },
    },
  });
}
