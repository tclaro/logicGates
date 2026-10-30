import { applyGate, GATE_ARITY } from '../../core/logic';
import type { Bit, GateType } from '../../core/types';
import { GATE_NOTATIONS, t } from '../../i18n/i18n';
import { gateSvg } from '../../render/gateShapes';
import { lampImageUrls } from '../../render/assets';
import { h, ICONS } from '../dom';
import { TruthTableView } from '../TruthTable';
import type { Screen } from './Screen';

export interface IntroOptions {
  gate: GateType;
  /** Fase que começa ao fechar; sem ela, a tela funciona como página do glossário. */
  levelId?: number;
  onDone: () => void;
  onClick?: () => void;
}

/** Apresentação de uma porta: símbolo, explicação, demonstração, tabela verdade e notações. */
export class IntroScreen implements Screen {
  readonly el: HTMLElement;
  private readonly inputs: Bit[];
  private readonly table: TruthTableView;
  private readonly demo: HTMLElement;
  private readonly lamp: HTMLImageElement;
  private readonly buttons: HTMLButtonElement[] = [];
  private lampUrls = { off: '', on: '' };

  constructor(private readonly opts: IntroOptions) {
    const { gate } = opts;
    const arity = GATE_ARITY[gate];
    this.inputs = arity === 1 ? [1] : [1, 0];
    this.table = new TruthTableView(gate);
    this.lamp = h('img', { class: 'demo-lamp', alt: '' });

    this.demo = h('div', { class: `demo arity-${arity}` }, this.lamp, h('div', { class: 'demo-circuit', html: this.demoSvg(gate) }));
    const switches = h('div', { class: 'demo-switches' });
    for (let i = 0; i < arity; i++) {
      const btn = h('button', {
        class: 'demo-switch',
        'aria-label': `${['A', 'B'][i]}`,
        onclick: () => {
          this.inputs[i] = this.inputs[i] === 1 ? 0 : 1;
          opts.onClick?.();
          this.refresh();
        },
      });
      this.buttons.push(btn);
      switches.append(btn);
    }
    this.demo.append(switches);

    const action = opts.levelId
      ? h('button', { class: 'btn primary big', onclick: opts.onDone, html: `${t('intro.start', { level: opts.levelId })} ${ICONS.next}` })
      : h('button', { class: 'btn big', onclick: opts.onDone, html: `${ICONS.back} ${t('intro.back')}` });

    this.el = h(
      'section',
      { class: 'screen intro-screen' },
      h(
        'div',
        { class: 'intro-card' },
        h('p', { class: 'eyebrow', text: opts.levelId ? t('intro.newGate') : t('glossary.title') }),
        h('h1', { class: 'intro-title' }, gate, h('span', { class: 'intro-name', text: ` · ${t(`gate.${gate}.name`)}` })),
        h('div', { class: 'intro-symbol draw', html: gateSvg(gate, { className: 'gate-svg big' }) }),
        h('p', { class: 'intro-summary', text: t(`gate.${gate}.summary`) }),
        h('p', { class: 'intro-analogy', text: t(`gate.${gate}.analogy`) }),
        h('h2', { text: t('intro.try') }),
        h('p', { class: 'muted small', text: t('intro.tryHint') }),
        this.demo,
        h('h2', { text: t('intro.table') }),
        this.table.el,
        h('h2', { text: t('intro.notation') }),
        h('div', { class: 'chips' }, ...GATE_NOTATIONS[gate].map((n) => h('code', { class: 'chip', text: n }))),
        h('div', { class: 'intro-actions' }, action),
      ),
    );
    void lampImageUrls().then((urls) => {
      this.lampUrls = urls;
      this.refresh();
    });
    this.refresh();
  }

  private demoSvg(gate: GateType): string {
    // Fios em SVG ao redor do símbolo (mesmo sistema de coordenadas do gateSvg, deslocado).
    const wires =
      GATE_ARITY[gate] === 1
        ? '<path class="wire w-in0" d="M150 192 V262"/>'
        : '<path class="wire w-in0" d="M125 192 V206 L80 240 V262"/><path class="wire w-in1" d="M175 192 V206 L220 240 V262"/>';
    return `<svg viewBox="0 0 300 262" class="demo-svg" aria-hidden="true">
      <path class="wire w-out" d="M150 48 V0"/>${wires}
      <g transform="translate(150 120)">${gateSvg(gate, { className: 'demo-gate' }).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</g>
    </svg>`;
  }

  private refresh(): void {
    const out = applyGate(this.opts.gate, this.inputs);
    this.inputs.forEach((v, i) => {
      this.buttons[i]!.textContent = String(v);
      this.buttons[i]!.classList.toggle('on', v === 1);
      this.demo.querySelector(`.w-in${i}`)?.classList.toggle('lit', v === 1);
    });
    this.demo.querySelector('.w-out')?.classList.toggle('lit', out === 1);
    this.demo.classList.toggle('lamp-on', out === 1);
    if (this.lampUrls.on) this.lamp.src = out === 1 ? this.lampUrls.on : this.lampUrls.off;
    this.table.highlight(this.inputs);
  }
}
