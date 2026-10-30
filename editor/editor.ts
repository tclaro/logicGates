import '../src/ui/styles.css';
import './editor.css';
import { evaluate } from '../src/core/circuit';
import { GATE_ARITY, GATE_TYPES } from '../src/core/logic';
import type { Bit, GateType, LevelDef } from '../src/core/types';
import { validateLevel } from '../src/core/validator';
import { allowedGatesFor } from '../src/levels/chapters';
import { LEVELS } from '../src/levels';
import { Stage } from '../src/render/Stage';
import { h } from '../src/ui/dom';

const panel = document.getElementById('panel')!;
const stage = new Stage();
await stage.init(document.getElementById('stage')!);

const clone = (l: LevelDef): LevelDef => JSON.parse(JSON.stringify(l));
const blank = (id: number): LevelDef => ({
  id,
  inputs: [
    { id: 'a', initial: 0 },
    { id: 'b', initial: 0 },
  ],
  gates: [{ id: 'g1', type: 'AND', in: ['a', 'b'] }],
  output: 'g1',
});

let level: LevelDef = (() => {
  const id = Number(location.hash.slice(1));
  const found = LEVELS.find((l) => l.id === id);
  return found ? clone(found) : clone(LEVELS[0] ?? blank(1));
})();
let status = '';

function nextInputId(): string {
  for (const c of 'abcdefghij') if (!level.inputs.some((i) => i.id === c)) return c;
  return `i${level.inputs.length + 1}`;
}

function nextGateId(): string {
  let n = level.gates.length + 1;
  while (level.gates.some((g) => g.id === `g${n}`)) n++;
  return `g${n}`;
}

/** Remove referências a um nó apagado e ajustes de layout órfãos. */
function prune(removed: string): void {
  for (const g of level.gates) g.in = g.in.map((src) => (src === removed ? '' : src));
  if (level.output === removed) level.output = level.gates[0]?.id ?? '';
  if (level.layout?.x) delete level.layout.x[removed];
  if (level.layout?.order) level.layout.order = level.layout.order.filter((id) => id !== removed);
}

function cleanLayout(): void {
  if (level.layout?.x && !Object.keys(level.layout.x).length) delete level.layout.x;
  if (level.layout?.order && !level.layout.order.length) delete level.layout.order;
  if (level.layout && !Object.keys(level.layout).length) delete level.layout;
}

function change(): void {
  cleanLayout();
  location.hash = String(level.id);
  render();
}

function renderPreview(ok: boolean): void {
  if (!ok) {
    stage.clear();
    return;
  }
  try {
    stage.show(
      level,
      {
        onGateDrag: (id, x) => {
          level.layout = { ...level.layout, x: { ...level.layout?.x, [id]: x } };
          change();
        },
        onToggle: () => renderStatus(),
      },
      { editable: true },
    );
  } catch (e) {
    stage.clear();
    status = `Erro no layout: ${e instanceof Error ? e.message : String(e)}`;
  }
}

let statusEl: HTMLElement | null = null;

function renderStatus(): void {
  if (!statusEl || !stage.board) return;
  const values = evaluate(level, stage.board.inputState);
  statusEl.textContent = `Lâmpada (lógica): ${values[level.output] ? 'ACESA' : 'apagada'}`;
}

function render(): void {
  const result = validateLevel(level, { allowedGates: allowedGatesFor(level.id) });
  const nodeIds = [...level.inputs.map((i) => i.id), ...level.gates.map((g) => g.id)];

  const levelPicker = h(
    'select',
    {
      onchange: (e: Event) => {
        const id = Number((e.target as HTMLSelectElement).value);
        level = clone(LEVELS.find((l) => l.id === id)!);
        status = '';
        change();
      },
    },
    ...LEVELS.map((l) => h('option', { value: l.id, selected: l.id === level.id, text: `Fase ${l.id}` })),
  );

  const inputs = h(
    'div',
    { class: 'rows' },
    ...level.inputs.map((input) =>
      h(
        'div',
        { class: 'row' },
        h('code', { text: input.id }),
        h('button', {
          class: `bit ${input.initial ? 'on' : ''}`,
          text: `inicial: ${input.initial}`,
          onclick: () => {
            input.initial = (input.initial ? 0 : 1) as Bit;
            change();
          },
        }),
        h('button', {
          class: 'danger',
          text: 'remover',
          onclick: () => {
            level.inputs = level.inputs.filter((i) => i !== input);
            prune(input.id);
            change();
          },
        }),
      ),
    ),
    h('button', {
      text: '+ Chave',
      onclick: () => {
        level.inputs.push({ id: nextInputId(), initial: 0 });
        change();
      },
    }),
  );

  const gates = h(
    'div',
    { class: 'rows' },
    ...level.gates.map((gate) => {
      const typeSel = h(
        'select',
        {
          onchange: (e: Event) => {
            gate.type = (e.target as HTMLSelectElement).value as GateType;
            const arity = GATE_ARITY[gate.type];
            gate.in = Array.from({ length: arity }, (_, i) => gate.in[i] ?? '');
            change();
          },
        },
        ...GATE_TYPES.map((t) => h('option', { value: t, selected: t === gate.type, text: t })),
      );
      const srcSels = gate.in.map((src, i) =>
        h(
          'select',
          {
            class: src ? '' : 'missing',
            onchange: (e: Event) => {
              gate.in[i] = (e.target as HTMLSelectElement).value;
              change();
            },
          },
          h('option', { value: '', text: '—' }),
          ...nodeIds.filter((id) => id !== gate.id).map((id) => h('option', { value: id, selected: id === src, text: id })),
        ),
      );
      return h(
        'div',
        { class: 'row' },
        h('code', { text: gate.id }),
        typeSel,
        ...srcSels,
        h('button', {
          class: 'danger',
          text: '×',
          title: 'remover',
          onclick: () => {
            level.gates = level.gates.filter((g) => g !== gate);
            prune(gate.id);
            change();
          },
        }),
      );
    }),
    h('button', {
      text: '+ Porta',
      onclick: () => {
        level.gates.push({ id: nextGateId(), type: 'AND', in: ['', ''] });
        change();
      },
    }),
  );

  const outputSel = h(
    'select',
    {
      onchange: (e: Event) => {
        level.output = (e.target as HTMLSelectElement).value;
        change();
      },
    },
    ...level.gates.map((g) => h('option', { value: g.id, selected: g.id === level.output, text: g.id })),
  );

  const json = h('textarea', { class: 'json', spellcheck: 'false' });
  json.value = JSON.stringify(level, null, 2);

  const s = result.stats;
  statusEl = h('p', { class: 'muted' });
  panel.replaceChildren(
    h('h1', { text: 'Editor de fases' }),
    h(
      'section',
      {},
      h('div', { class: 'row' }, levelPicker, h('label', { text: 'id' }), h('input', {
        type: 'number',
        min: 1,
        max: 99,
        value: level.id,
        onchange: (e: Event) => {
          level.id = Number((e.target as HTMLInputElement).value);
          change();
        },
      })),
      h('div', { class: 'row' }, h('button', {
        text: 'Nova fase',
        onclick: () => {
          level = blank(Math.max(0, ...LEVELS.map((l) => l.id)) + 1);
          change();
        },
      }), h('button', {
        text: 'Desfazer alterações',
        onclick: () => {
          const saved = LEVELS.find((l) => l.id === level.id);
          if (saved) level = clone(saved);
          change();
        },
      })),
    ),
    h('h2', { text: 'Chaves' }),
    inputs,
    h('h2', { text: 'Portas' }),
    gates,
    h('div', { class: 'row' }, h('label', { text: 'Saída (lâmpada):' }), outputSel),
    h('h2', { text: 'Layout' }),
    h('p', { class: 'muted small', text: 'Arraste uma porta na prévia para fixar a posição horizontal.' }),
    h('div', { class: 'row' }, h('label', { text: 'Ordem das chaves' }), h('input', {
      type: 'text',
      value: level.layout?.order?.join(',') ?? '',
      placeholder: 'automática (ex.: b,a,c)',
      onchange: (e: Event) => {
        const order = (e.target as HTMLInputElement).value.split(',').map((x) => x.trim()).filter(Boolean);
        level.layout = { ...level.layout, order };
        change();
      },
    })),
    h('button', {
      text: 'Layout automático',
      onclick: () => {
        delete level.layout;
        change();
      },
    }),
    h('h2', { text: 'Validação' }),
    h(
      'div',
      { class: `validation ${result.ok ? 'ok' : 'bad'}` },
      result.ok ? h('strong', { text: '✓ Fase válida' }) : h('strong', { text: '✗ Problemas' }),
      h('ul', {}, ...result.errors.map((e) => h('li', { text: e }))),
      s
        ? h(
            'p',
            { class: 'stats' },
            `${s.inputs} chaves · ${s.gates} portas · profundidade ${s.depth} · fan-out ${s.maxFanout} · `,
            h('strong', { text: `mínimo de cliques ${s.minClicks}` }),
            ` · ${s.solutions} soluções · ${s.trapInputs} armadilhas`,
          )
        : null,
    ),
    statusEl,
    h(
      'div',
      { class: 'row' },
      h('button', { text: 'Reiniciar chaves', onclick: () => (stage.board?.reset(), renderStatus()) }),
      h('button', { class: 'primary', text: `Salvar ${String(level.id).padStart(2, '0')}.json`, onclick: () => void save(result.ok) }),
    ),
    status ? h('p', { class: 'status', text: status }) : '',
    h('h2', { text: 'JSON' }),
    json,
    h('button', {
      text: 'Aplicar JSON',
      onclick: () => {
        try {
          level = JSON.parse(json.value) as LevelDef;
          status = '';
        } catch (e) {
          status = `JSON inválido: ${e instanceof Error ? e.message : String(e)}`;
        }
        change();
      },
    }),
  );
  renderPreview(result.ok);
  renderStatus();
}

async function save(valid: boolean): Promise<void> {
  if (!valid && !confirm('A fase tem problemas de validação. Salvar mesmo assim?')) return;
  const exists = LEVELS.some((l) => l.id === level.id);
  if (exists && !confirm(`Sobrescrever a fase ${level.id}?`)) return;
  try {
    const res = await fetch('/__levels/save', { method: 'POST', body: JSON.stringify(level) });
    const body = (await res.json()) as { ok: boolean; file?: string; error?: string };
    status = body.ok ? `Salvo em ${body.file}` : `Erro: ${body.error}`;
  } catch (e) {
    status = `Erro ao salvar: ${e instanceof Error ? e.message : String(e)}`;
  }
  render();
}

render();
