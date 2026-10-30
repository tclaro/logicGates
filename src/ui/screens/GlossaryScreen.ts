import type { GateType } from '../../core/types';
import { t } from '../../i18n/i18n';
import { gatesInIntroOrder } from '../../levels/chapters';
import { gateSvg } from '../../render/gateShapes';
import { h, iconButton } from '../dom';
import type { Screen } from './Screen';

export interface GlossaryOptions {
  seen: ReadonlySet<GateType>;
  onOpen(gate: GateType): void;
  onBack(): void;
}

export class GlossaryScreen implements Screen {
  readonly el: HTMLElement;

  constructor(o: GlossaryOptions) {
    const list = h('div', { class: 'glossary-grid' });
    for (const gate of gatesInIntroOrder()) {
      const seen = o.seen.has(gate);
      list.append(
        h(
          'button',
          { class: `glossary-item ${seen ? '' : 'locked'}`, disabled: !seen, 'data-gate': gate, onclick: () => o.onOpen(gate) },
          h('span', { class: 'glossary-symbol', html: gateSvg(gate, { className: 'gate-svg small', label: false }) }),
          h('span', { class: 'glossary-name', text: seen ? gate : '???' }),
          h('span', { class: 'glossary-sub', text: seen ? t(`gate.${gate}.name`) : t('glossary.locked') }),
        ),
      );
    }
    this.el = h(
      'section',
      { class: 'screen list-screen' },
      h('header', { class: 'screen-header' }, iconButton('back', t('common.back'), o.onBack), h('h1', { text: t('glossary.title') })),
      o.seen.size ? null : h('p', { class: 'muted center', text: t('glossary.empty') }),
      list,
    );
  }
}
