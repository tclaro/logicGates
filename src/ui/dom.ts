type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | EventListener | null | undefined>;

/** Cria um elemento: atributos `on*` viram eventos, `html` vira innerHTML e `text`, textContent. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'html') el.innerHTML = String(value);
    else if (key === 'text') el.textContent = String(value);
    else if (key === 'class') el.className = String(value);
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  menu: svg('<path d="M4 6h16M4 12h16M4 18h16"/>'),
  restart: svg('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'),
  book: svg('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/><path d="M9 7h6"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  check: svg('<path d="M5 12l5 5 9-10"/>'),
  play: svg('<path d="M7 4l13 8-13 8z" fill="currentColor"/>'),
  grid: svg('<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>'),
  sound: svg('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/>'),
  soundOff: svg('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/>'),
  home: svg('<path d="M4 11l8-7 8 7"/><path d="M6 10v10h4v-6h4v6h4V10"/>'),
  music: svg('<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>'),
  next: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
};

export function iconButton(icon: keyof typeof ICONS, label: string, onClick: () => void, extraClass = ''): HTMLButtonElement {
  return h('button', { class: `icon-btn ${extraClass}`.trim(), 'aria-label': label, title: label, html: ICONS[icon], onclick: onClick });
}

/** Botão liga/desliga com ícone e texto (som, música). */
export function toggleButton(icon: keyof typeof ICONS, label: string, value: boolean, onChange: (on: boolean) => void): HTMLButtonElement {
  const btn = h('button', { class: `toggle ${value ? 'on' : ''}`.trim(), 'aria-pressed': String(value), html: `${ICONS[icon]}<span>${label}</span>` });
  btn.addEventListener('click', () => {
    const on = !btn.classList.contains('on');
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
    onChange(on);
  });
  return btn;
}
