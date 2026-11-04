import { t } from '../../i18n/i18n';
import { lampImageUrls } from '../../render/assets';
import { h, ICONS, toggleButton } from '../dom';
import type { Screen } from './Screen';

export interface MenuActions {
  /** Próxima fase a jogar, ou null se todas foram concluídas. */
  nextLevel: number | null;
  hasProgress: boolean;
  sound: boolean;
  music: boolean;
  expert: { unlocked: boolean; best: number; unlockLevel: number };
  /** Modo Ultimate: liberado pela fase `unlockLevel` do Expert; `next` é null com tudo concluído. */
  ultimate: { unlocked: boolean; next: number | null; started: boolean; unlockLevel: number };
  onPlay(): void;
  onExpert(): void;
  onUltimate(): void;
  onLevels(): void;
  onGlossary(): void;
  onSound(on: boolean): void;
  onMusic(on: boolean): void;
}

export class MenuScreen implements Screen {
  readonly el: HTMLElement;

  constructor(a: MenuActions) {
    const lamp = h('img', { class: 'menu-lamp', alt: '' });
    void lampImageUrls().then((urls) => (lamp.src = urls.on));
    // Tocar num modo bloqueado explica o que ele é e como liberá-lo.
    const notice = h('p', { class: 'menu-notice', role: 'status', 'data-testid': 'menu-notice', hidden: true });
    const explain = (text: string) => {
      notice.textContent = text;
      notice.hidden = false;
    };

    this.el = h(
      'section',
      { class: 'screen menu-screen' },
      h(
        'div',
        { class: 'menu-hero' },
        h('div', { class: 'menu-lamp-wrap' }, lamp),
        h('h1', { class: 'menu-title', text: t('app.title') }),
        h('p', { class: 'menu-subtitle', text: a.nextLevel === null ? t('menu.allDone') : t('app.subtitle') }),
      ),
      h(
        'nav',
        { class: 'menu-buttons' },
        h(
          'div',
          { class: 'menu-row' },
          beginnerButton(a),
          h('button', { class: 'btn big', html: `${ICONS.grid} ${t('menu.levels')}`, onclick: a.onLevels }),
        ),
        expertButton(a, explain),
        ultimateButton(a, explain),
        notice,
        h('button', { class: 'btn big', html: `${ICONS.book} ${t('menu.glossary')}`, onclick: a.onGlossary }),
      ),
      h('div', { class: 'menu-toggles' }, toggleButton('sound', t('menu.sound'), a.sound, a.onSound), toggleButton('music', t('menu.music'), a.music, a.onMusic)),
    );
  }
}

function beginnerButton(a: MenuActions): HTMLButtonElement {
  const detail = a.nextLevel === null ? t('menu.beginnerDone') : a.hasProgress ? t('menu.continue', { level: a.nextLevel }) : t('menu.beginnerNew');
  return h(
    'button',
    { class: 'btn primary big mode-btn', 'data-testid': 'play', onclick: a.nextLevel === null ? a.onLevels : a.onPlay },
    h('span', { class: 'mode-icon', html: ICONS.unlock }),
    h('span', { class: 'mode-text' }, h('span', { text: t('menu.beginner') }), h('small', { text: detail })),
  );
}

interface ModeButton {
  testId: string;
  className: string;
  icon: string;
  title: string;
  detail: string;
  locked: boolean;
  lockedText: string;
  onOpen(): void;
}

/** Botão de modo com título e detalhe; bloqueado, continua tocável para explicar como liberar. */
function modeButton(m: ModeButton, explain: (text: string) => void): HTMLButtonElement {
  return h(
    'button',
    {
      class: `btn big expert-btn ${m.className} ${m.locked ? 'locked' : ''}`.trim(),
      'data-testid': m.testId,
      'aria-disabled': m.locked ? 'true' : null,
      onclick: () => (m.locked ? explain(m.lockedText) : m.onOpen()),
    },
    h('span', { class: 'expert-icon', html: m.locked ? ICONS.lock : m.icon }),
    h('span', { class: 'expert-text' }, h('span', { text: m.title }), h('small', { text: m.detail })),
  );
}

function expertButton(a: MenuActions, explain: (text: string) => void): HTMLButtonElement {
  const { unlocked, best, unlockLevel } = a.expert;
  return modeButton(
    {
      testId: 'expert',
      className: '',
      icon: ICONS.bolt,
      title: t('menu.expert'),
      detail: !unlocked ? t('menu.expertLocked', { level: unlockLevel }) : best ? t('menu.expertBest', { level: best }) : t('menu.expertNew'),
      locked: !unlocked,
      lockedText: t('menu.lockedExpert', { level: unlockLevel }),
      onOpen: a.onExpert,
    },
    explain,
  );
}

function ultimateButton(a: MenuActions, explain: (text: string) => void): HTMLButtonElement {
  const { unlocked, next, started, unlockLevel } = a.ultimate;
  const detail = !unlocked
    ? t('menu.ultimateLocked', { level: unlockLevel })
    : next === null
      ? t('menu.beginnerDone')
      : started
        ? t('menu.continue', { level: next })
        : t('menu.ultimateNew');
  return modeButton(
    {
      testId: 'ultimate',
      className: 'ultimate-btn',
      icon: ICONS.chip,
      title: t('menu.ultimate'),
      detail,
      locked: !unlocked,
      lockedText: a.expert.unlocked
        ? t('menu.lockedUltimate', { level: unlockLevel })
        : t('menu.lockedUltimateNoExpert', { level: unlockLevel, expert: a.expert.unlockLevel }),
      onOpen: a.onUltimate,
    },
    explain,
  );
}
