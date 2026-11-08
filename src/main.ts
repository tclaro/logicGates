import './ui/styles.css';
import { audio } from './audio/AudioManager';
import { solve } from './core/solver';
import type { UltimateLevelDef } from './core/types';
import { solveUltimate } from './core/ultimate';
import { CAMPAIGN, getCampaignLevel } from './levels';
import { Stage } from './render/Stage';
import { App } from './ui/App';

const stage = new Stage();
await stage.init(document.getElementById('stage')!);
const app = new App(stage, document.getElementById('ui')!);
void audio.load();

// Em desenvolvimento, ?level=N abre direto uma fase da campanha.
const params = new URLSearchParams(location.search);
const direct = Number(params.get('level'));
if (import.meta.env.DEV && direct && getCampaignLevel(direct)) app.playLevel(direct);
else app.showMenu();

if (import.meta.env.DEV) {
  // Ganchos para os testes de ponta a ponta.
  Object.assign(window, {
    __game: {
      app,
      stage,
      audio,
      levels: CAMPAIGN.length,
      difficulty(levelId: number) {
        return getCampaignLevel(levelId)?.difficulty ?? null;
      },
      /** Ponto de tela (clientX/clientY) do centro de uma chave ou porta. */
      pointOf(id: string) {
        const p = stage.board?.anchorOf(id);
        return p ? stage.toClient(p) : null;
      },
      /** Fases fácil e média: os valores das chaves (em ordem de id) que acendem a lâmpada. */
      solution(levelId: number) {
        return solve(getCampaignLevel(levelId)!.def).best;
      },
      /** Fase difícil: uma montagem que resolve a fase, peça por encaixe. */
      ultimateSolution(levelId: number) {
        return solveUltimate(getCampaignLevel(levelId)!.def as UltimateLevelDef)[0] ?? null;
      },
      /** Fase difícil: a bandeja de peças não cobre nenhum elemento do circuito. */
      trayClear() {
        return app.game?.trayIsClear() ?? true;
      },
      state() {
        const board = stage.board;
        return board
          ? { level: board.level.id, inputs: board.inputState, lampOn: board.lampOn, animating: board.animating, won: app.game?.won ?? false, lives: app.game?.lives ?? null, energy: app.game?.energyLeft ?? null, slots: board.slotFill }
          : null;
      },
    },
  });
}
