import { expect, test, type Page } from '@playwright/test';

type Bit = 0 | 1;
type Difficulty = 'easy' | 'medium' | 'hard';
interface GameState {
  level: number;
  inputs: Record<string, Bit>;
  lampOn: boolean;
  animating: boolean;
  won: boolean;
  lives: number | null;
  energy: number | null;
  slots: Record<string, string | null>;
}

declare global {
  interface Window {
    __game: {
      pointOf(id: string): { x: number; y: number } | null;
      solution(levelId: number): Bit[] | null;
      ultimateSolution(levelId: number): Record<string, string> | null;
      difficulty(levelId: number): Difficulty | null;
      trayClear(): boolean;
      levels: number;
      state(): GameState | null;
    };
  }
}

const state = (page: Page) => page.evaluate(() => window.__game?.state() ?? null);

async function waitForBoard(page: Page, level: number): Promise<void> {
  await expect.poll(async () => (await state(page))?.level).toBe(level);
}

/** Toca numa chave ou porta da placa, pelo centro calculado no jogo. */
async function tap(page: Page, id: string): Promise<void> {
  const p = await page.evaluate((nodeId) => window.__game.pointOf(nodeId), id);
  expect(p, `posição de ${id}`).not.toBeNull();
  await page.mouse.click(p!.x, p!.y);
}

/** Alterna as chaves que diferem da solução mais próxima. */
async function solve(page: Page, level: number): Promise<void> {
  const best = await page.evaluate((id) => window.__game.solution(id), level);
  const s = (await state(page))!;
  const ids = Object.keys(s.inputs).sort();
  for (const [i, id] of ids.entries()) {
    if (s.inputs[id] !== best![i]) await tap(page, id);
  }
}

/** Monta a solução do solver tocando na peça e depois no encaixe. */
async function assemble(page: Page, level: number): Promise<void> {
  const fill = await page.evaluate((id) => window.__game.ultimateSolution(id), level);
  for (const [slot, piece] of Object.entries(fill!)) {
    // Com estoque sobrando a peça continua escolhida depois de encaixar; tocar de novo a desmarcaria.
    const btn = page.getByTestId(`piece-${piece}`);
    if ((await btn.getAttribute('aria-pressed')) !== 'true') await btn.click();
    await tap(page, slot);
  }
  await expect.poll(async () => (await state(page))!.slots).toEqual(fill);
}

/** Resolve qualquer fase conforme a dificuldade, ativando quando a energia é escondida. */
async function win(page: Page, level: number): Promise<void> {
  const difficulty = await page.evaluate((id) => window.__game.difficulty(id), level);
  if (difficulty === 'hard') await assemble(page, level);
  else await solve(page, level);
  if (await page.getByTestId('activate').count()) await page.getByTestId('activate').click();
  await expect.poll(async () => (await state(page))!.won, { timeout: 10000, message: `fase ${level}` }).toBe(true);
}

async function seedProgress(page: Page, completed: number[], seenIntros: string[] = []): Promise<void> {
  await page.addInitScript(
    ([c, s]) => localStorage.setItem('portas-logicas:progress', JSON.stringify({ version: 2, completed: c, seenIntros: s, sound: false, music: false })),
    [completed, seenIntros] as const,
  );
}

const ALL_GATES = ['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR', 'XNOR'];
const upTo = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

test('primeira jogada: introdução, fase 1, vitória e progresso salvo', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('play').click();
  await expect(page.getByRole('heading', { name: /AND/ })).toBeVisible();
  await expect(page.locator('.truth-table tr.current')).toHaveCount(1);
  await page.getByRole('button', { name: 'Começar fase 1' }).click();
  await waitForBoard(page, 1);
  await expect(page.getByTestId('level-title')).toHaveText('Fase 1');
  await expect(page.getByTestId('difficulty')).toHaveText('Fácil');

  await tap(page, 'b');
  expect((await state(page))!.inputs).toEqual({ a: 1, b: 1 });
  // A lâmpada só acende depois que a energia percorre as trilhas.
  expect((await state(page))!.lampOn).toBe(false);
  await expect.poll(async () => (await state(page))!.won, { timeout: 5000 }).toBe(true);
  await expect(page.getByTestId('next')).toBeVisible();

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('portas-logicas:progress')!));
  expect(saved).toMatchObject({ version: 2, completed: [1], seenIntros: ['AND'] });

  // Fase 2 apresenta o OR antes de começar.
  await page.getByTestId('next').click();
  await expect(page.getByRole('heading', { name: /OR/ })).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('play')).toHaveText(/Continuar — fase 2/);
});

test('menu: um único Jogar, ao lado de Fases, sem os modos antigos', async ({ page }) => {
  await page.goto('/');
  const play = page.getByTestId('play');
  await expect(play).toContainText('Jogar');
  await expect(play).toContainText('Comece pela fase 1');
  await expect(page.getByText(/Expert|Ultimate|Iniciante/)).toHaveCount(0);
  const levels = page.getByRole('button', { name: 'Fases' });
  // Espera a animação de entrada da tela terminar antes de medir.
  await expect.poll(async () => Math.abs((await play.boundingBox())!.y - (await levels.boundingBox())!.y)).toBeLessThan(1);
  const a = (await play.boundingBox())!;
  const b = (await levels.boundingBox())!;
  expect(a.x + a.width).toBeLessThanOrEqual(b.x);
});

test('progresso dos modos antigos continua na primeira fase que falta', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'portas-logicas:progress',
      JSON.stringify({ version: 1, completed: Array.from({ length: 36 }, (_, i) => i + 1), seenIntros: ['AND', 'OR'], sound: false, music: false, expertBest: 0, ultimateCompleted: [] }),
    ),
  );
  await page.goto('/');
  // A fase 3 é média: no modo antigo ela só tinha sido jogada com a energia à vista.
  await expect(page.getByTestId('play')).toHaveText(/Continuar — fase 3/);
  await page.getByRole('button', { name: 'Fases' }).click();
  await expect(page.locator('[data-level="2"]')).toHaveClass(/done/);
  await expect(page.locator('[data-level="3"]')).not.toHaveClass(/done/);
  await expect(page.locator('[data-level="50"]')).toBeEnabled();
});

test('rótulo da dificuldade no canto superior esquerdo, nas três dificuldades', async ({ page }) => {
  for (const [level, text] of [
    [1, 'Fácil'],
    [3, 'Médio'],
    [6, 'Difícil'],
  ] as const) {
    await page.goto(`/?level=${level}`);
    await waitForBoard(page, level);
    const label = page.getByTestId('difficulty');
    await expect(label).toHaveText(text);
    const box = (await label.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.x + box.width, `fase ${level}: rótulo à esquerda`).toBeLessThan(viewport.width / 2);
    expect(box.y, `fase ${level}: rótulo no alto`).toBeLessThan(viewport.height / 4);
    // A dica, quando existe, não cobre o rótulo.
    const tip = page.locator('.hud-tip');
    if (await tip.count()) expect((await tip.boundingBox())!.y).toBeGreaterThanOrEqual(box.y + box.height);
  }
});

test('reiniciar volta as chaves ao estado inicial', async ({ page }) => {
  await seedProgress(page, upTo(6), ['AND', 'OR', 'NOT']);
  await page.goto('/');
  await page.getByRole('button', { name: 'Fases' }).click();
  // Fase 7: AND(AND(a, b), OR(c, d)), fácil.
  await page.locator('[data-level="7"]').click();
  await waitForBoard(page, 7);
  const initial = (await state(page))!.inputs;
  await tap(page, 'a');
  await tap(page, 'c');
  expect((await state(page))!.inputs).not.toEqual(initial);
  await page.getByRole('button', { name: 'Reiniciar fase' }).click();
  expect((await state(page))!.inputs).toEqual(initial);
  await page.keyboard.press('1');
  expect((await state(page))!.inputs).not.toEqual(initial);
  await page.keyboard.press('r');
  expect((await state(page))!.inputs).toEqual(initial);

  // Com o cartão de vitória aberto, os botões do topo continuam clicáveis.
  await solve(page, 7);
  await expect(page.getByTestId('next')).toBeVisible();
  await page.getByRole('button', { name: 'Reiniciar fase' }).click();
  await expect(page.getByTestId('next')).toBeHidden();
  expect((await state(page))!.inputs).toEqual(initial);
  await solve(page, 7);
  await expect(page.getByTestId('next')).toBeVisible();
  await page.getByRole('button', { name: 'Som e música' }).click();
  await expect(page.getByRole('group', { name: 'Som e música' })).toBeVisible();
  await page.getByRole('button', { name: 'Glossário' }).click();
  await expect(page.locator('.glossary-grid')).toBeVisible();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await page.getByRole('button', { name: 'Menu principal' }).click();
  await expect(page.getByTestId('play')).toBeVisible();
});

test('no jogo, o som se configura e o botão de menu volta ao menu principal', async ({ page }) => {
  await seedProgress(page, [1], ['AND']);
  await page.goto('/');
  await page.getByRole('button', { name: 'Fases' }).click();
  await page.locator('[data-level="1"]').click();
  await page.getByRole('button', { name: 'Começar fase 1' }).click();
  await waitForBoard(page, 1);

  const audioBtn = page.getByRole('button', { name: 'Som e música' });
  const panel = page.getByRole('group', { name: 'Som e música' });
  await audioBtn.click();
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Efeitos sonoros' })).toHaveAttribute('aria-pressed', 'false');
  await panel.getByRole('button', { name: 'Efeitos sonoros' }).click();
  await panel.getByRole('button', { name: 'Música' }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('portas-logicas:progress')!));
  expect([saved.sound, saved.music]).toEqual([true, true]);
  // Um toque na placa fecha o painel.
  await tap(page, 'a');
  await expect(panel).toBeHidden();

  await page.getByRole('button', { name: 'Menu principal' }).click();
  await expect(page.getByTestId('play')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Efeitos sonoros' })).toHaveAttribute('aria-pressed', 'true');
});

test('fase média: energia escondida, vidas e fim de jogo recomeçando a mesma fase', async ({ page }) => {
  await seedProgress(page, [1, 2], ['AND', 'OR']);
  await page.goto('/');
  await page.getByTestId('play').click();
  await waitForBoard(page, 3);
  await expect(page.getByTestId('level-title')).toHaveText('Fase 3');
  await expect(page.getByTestId('difficulty')).toHaveText('Médio');
  await expect(page.locator('.hud-tip')).toContainText('Ativar');
  await expect(page.getByTestId('activate')).toHaveText(/Ativar/);
  const lit = page.locator('.life:not(.burnt)');
  await expect(lit).toHaveCount(3);

  // Fase 3: AND(OR(a, b), c) com a=0, b=0, c=1. Ligar a não acende nada até ativar.
  await tap(page, 'a');
  await page.waitForTimeout(800);
  expect((await state(page))!.lampOn).toBe(false);
  await tap(page, 'a');

  const activate = page.getByTestId('activate');
  for (let left = 2; left >= 0; left--) {
    await activate.click();
    await expect(lit).toHaveCount(left, { timeout: 5000 });
    if (left > 0) {
      // Depois do erro é preciso mudar alguma chave antes de ativar de novo.
      await expect(activate).toBeDisabled();
      await expect(page.getByText('Mude alguma chave')).toBeVisible();
      // Continua errado: primeiro c=0, depois b=1 com c=0.
      await tap(page, left === 2 ? 'c' : 'b');
      await expect(activate).toBeEnabled();
    }
  }
  await expect(page.getByTestId('retry')).toHaveText(/Tentar de novo/);
  await page.getByTestId('retry').click();
  await waitForBoard(page, 3);
  await expect(lit).toHaveCount(3);

  await tap(page, 'a');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(page))!.won, { timeout: 5000 }).toBe(true);
  await expect(page.getByTestId('win-text')).toHaveText('Você resolveu a fase 3.');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('portas-logicas:progress')!));
  expect(saved.completed).toEqual([1, 2, 3]);
  // A próxima fase apresenta o NOT.
  await page.getByTestId('next').click();
  await expect(page.getByRole('heading', { name: /NOT/ })).toBeVisible();
});

test('fase fácil: barra de energia, vidas que passam de fase e fim de jogo na mesma fase', async ({ page }) => {
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('portas-logicas:progress')!));
  const lit = page.locator('.life:not(.burnt)');
  const energy = page.getByTestId('energy');
  const start = async () => {
    await page.getByTestId('play').click();
    await page.getByRole('button', { name: 'Começar fase 1' }).click();
    await waitForBoard(page, 1);
  };
  await page.goto('/');
  await start();
  // Fase 1: AND(a, b) com a=1, b=0. Mínimo de 1 clique, então a barra tem 2.
  await expect(lit).toHaveCount(3);
  await expect(energy).toHaveAttribute('aria-valuenow', '2');
  await tap(page, 'a');
  await expect(energy).toHaveAttribute('aria-valuenow', '1');
  await tap(page, 'a');
  // A barra zerou sem acender a lâmpada: uma lâmpada estoura e a barra enche de novo.
  await expect(lit).toHaveCount(2);
  await expect(energy).toHaveAttribute('aria-valuenow', '2');
  expect((await saved()).lives).toBe(2);

  for (let i = 0; i < 4; i++) await tap(page, 'a');
  await expect(lit).toHaveCount(0);
  await expect(page.getByTestId('retry')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.game-over')).toContainText('recomeça desta mesma fase');
  expect((await saved()).lives).toBe(3);
  await page.getByTestId('retry').click();
  await waitForBoard(page, 1);
  await expect(lit).toHaveCount(3);
  await expect(energy).toHaveAttribute('aria-valuenow', '2');

  // Perde uma lâmpada; sair e voltar não renova as vidas nem enche a barra.
  await tap(page, 'a');
  await tap(page, 'a');
  await expect(lit).toHaveCount(2);
  await tap(page, 'a');
  await expect(energy).toHaveAttribute('aria-valuenow', '1');
  await page.reload();
  await start();
  await expect(lit).toHaveCount(2);
  await expect(energy).toHaveAttribute('aria-valuenow', '1');

  // O toque que zera a barra mas acende a lâmpada não queima vida.
  await tap(page, 'b');
  await expect.poll(async () => (await state(page))!.won, { timeout: 5000 }).toBe(true);
  await expect(lit).toHaveCount(2);

  // Passar de fase não renova as lâmpadas; a barra da fase nova vem cheia.
  await page.getByTestId('next').click();
  await page.getByRole('button', { name: 'Começar fase 2' }).click();
  await waitForBoard(page, 2);
  await expect(lit).toHaveCount(2);
  await expect(energy).toHaveAttribute('aria-valuenow', '2');
  expect(await saved()).toMatchObject({ lives: 2, completed: [1] });
});

test('tocar numa porta mostra a tabela verdade com a linha atual', async ({ page }) => {
  await page.goto('/?level=7');
  await waitForBoard(page, 7);
  // Fase 7: AND(AND(a, b), OR(c, d)) com c=0, d=0. O OR (g2) recebe 0 e 0.
  await tap(page, 'g2');
  const popover = page.locator('.popover');
  await expect(popover).toBeVisible();
  await expect(popover.locator('strong')).toHaveText('OR');
  await expect(popover.locator('tr.current td')).toHaveText(['0', '0', '0']);
  await tap(page, 'c');
  // A linha muda quando a energia chega à porta.
  await expect(popover.locator('tr.current td')).toHaveText(['1', '0', '1'], { timeout: 3000 });
  await page.keyboard.press('Escape');
  await expect(popover).toHaveCount(0);
});

test('fases bloqueadas não abrem, mostram a dificuldade e o glossário mostra só portas vistas', async ({ page }) => {
  await seedProgress(page, [1], ['AND']);
  await page.goto('/');
  await page.getByRole('button', { name: 'Fases' }).click();
  await expect(page.locator('[data-level="2"]')).toBeEnabled();
  await expect(page.locator('[data-level="3"]')).toBeDisabled();
  await expect(page.locator('[data-level="51"]')).toBeDisabled();
  await expect(page.locator('[data-level="3"]')).toHaveAttribute('data-difficulty', 'medium');
  await expect(page.locator('[data-level="6"]')).toHaveAttribute('aria-label', 'Fase 6 bloqueada, Difícil');
  await expect(page.locator('[data-level="4"]')).toHaveAttribute('aria-label', 'Fase 4 bloqueada, Fácil. Nova porta: NOT');
  await page.getByRole('button', { name: 'Voltar' }).click();
  await page.getByRole('button', { name: 'Glossário' }).click();
  await expect(page.locator('[data-gate="AND"]')).toBeEnabled();
  await expect(page.locator('[data-gate="OR"]')).toBeDisabled();
  await page.locator('[data-gate="AND"]').click();
  await expect(page.locator('.intro-screen .chip').first()).toHaveText('A · B');
});

test('fase difícil: arrastar a peça até o encaixe, com energia visível', async ({ page }) => {
  await seedProgress(page, upTo(5), ['AND', 'OR', 'NOT']);
  await page.goto('/');
  await page.getByTestId('play').click();
  await waitForBoard(page, 6);
  await expect(page.getByTestId('level-title')).toHaveText('Fase 6');
  await expect(page.getByTestId('difficulty')).toHaveText('Difícil');
  await expect(page.locator('.hud-tip')).toContainText('encaixe');
  // Chaves fixas: tocar nelas não muda nada.
  const before = (await state(page))!.inputs;
  await tap(page, 'a');
  expect((await state(page))!.inputs).toEqual(before);

  // Peça errada primeiro: a lâmpada não acende e a peça volta à bandeja com um toque.
  const piece = (await page.getByTestId('piece-AND').boundingBox())!;
  const slot = (await page.evaluate(() => window.__game.pointOf('g1')))!;
  await page.mouse.move(piece.x + piece.width / 2, piece.y + piece.height / 2);
  await page.mouse.down();
  await page.mouse.move(slot.x, slot.y, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => (await state(page))!.slots).toEqual({ g1: 'AND' });
  await expect(page.getByTestId('piece-AND')).toBeDisabled();
  await page.waitForTimeout(800);
  expect((await state(page))!.won).toBe(false);
  await tap(page, 'g1');
  await expect.poll(async () => (await state(page))!.slots).toEqual({ g1: null });

  // Sem "Ativar", a barra de energia gasta a cada peça encaixada: 1 encaixe → 2 jogadas.
  // Devolver a peça à bandeja não gasta; a segunda peça errada zera a barra e estoura uma lâmpada.
  const energy = page.getByTestId('energy');
  const lit = page.locator('.life:not(.burnt)');
  await expect(energy).toHaveAttribute('aria-valuenow', '1');
  await page.getByTestId('piece-AND').click();
  await tap(page, 'g1');
  await expect(lit).toHaveCount(2);
  await expect(energy).toHaveAttribute('aria-valuenow', '2');
  await tap(page, 'g1');
  await expect.poll(async () => (await state(page))!.slots).toEqual({ g1: null });

  await assemble(page, 6);
  await expect.poll(async () => (await state(page))!.won, { timeout: 5000 }).toBe(true);
  await expect(page.getByTestId('win-text')).toHaveText('Você montou o circuito da fase 6.');
  await expect(lit).toHaveCount(2);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('portas-logicas:progress')!));
  expect(saved.completed).toEqual(upTo(6));
  await page.getByTestId('next').click();
  await waitForBoard(page, 7);
  await expect(page.getByTestId('difficulty')).toHaveText('Fácil');
});

test('fase difícil: chave automática, erro queima vida e acerto vence', async ({ page }) => {
  await seedProgress(page, upTo(21), ALL_GATES);
  await page.goto('/');
  await page.getByTestId('play').click();
  // Fase 22: OR(a, NOT a) com a chave a alternando sozinha.
  await waitForBoard(page, 22);
  await expect(page.getByTestId('difficulty')).toHaveText('Difícil');
  const activate = page.getByTestId('activate');
  await expect(activate).toHaveText('Preencha todos os encaixes');
  await expect(activate).toBeDisabled();
  await page.getByTestId('piece-NOT').click();
  await tap(page, 'g1');
  await page.getByTestId('piece-AND').click();
  await tap(page, 'g2');
  await expect(activate).toBeEnabled();
  await activate.click();
  await expect.poll(async () => (await state(page))!.lives, { timeout: 8000 }).toBe(2);
  await expect(activate).toHaveText('Troque alguma peça para tentar de novo');

  // OR no lugar do AND: a lâmpada aguenta a chave alternando e a fase é vencida.
  await page.getByTestId('piece-OR').click();
  await tap(page, 'g2');
  await expect.poll(async () => (await state(page))!.slots).toEqual({ g1: 'NOT', g2: 'OR' });
  await activate.click();
  const seen = new Set<number>();
  await expect
    .poll(
      async () => {
        const s = (await state(page))!;
        seen.add(s.inputs.a!);
        return s.won;
      },
      { timeout: 10000, intervals: [100] },
    )
    .toBe(true);
  expect([...seen].sort()).toEqual([0, 1]);
  expect((await state(page))!.lives).toBe(2);
});

test('bandeja na lateral esquerda não cobre o circuito nem o HUD, em vários tamanhos de tela', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await page.waitForFunction(() => window.__game !== undefined);
  const total = await page.evaluate(() => window.__game.levels);
  const hard: number[] = [];
  for (let id = 1; id <= total; id++) if ((await page.evaluate((n) => window.__game.difficulty(n), id)) === 'hard') hard.push(id);
  expect(hard.length).toBe(15);

  const overlap = (a: DOMRectLike, b: DOMRectLike) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  for (const size of [
    { width: 412, height: 915 },
    { width: 360, height: 640 },
    { width: 1280, height: 720 },
    { width: 800, height: 600 },
    // Tablets: iPad Pro 13 em pé e deitado, iPad Air e iPad mini.
    { width: 1032, height: 1376 },
    { width: 1376, height: 1032 },
    { width: 820, height: 1180 },
    { width: 768, height: 1024 },
  ]) {
    await page.setViewportSize(size);
    for (const level of hard) {
      const where = `fase ${level} em ${size.width}x${size.height}`;
      await page.goto(`/?level=${level}`);
      await waitForBoard(page, level);
      const tray = (await page.getByTestId('tray').boundingBox())!;
      expect(tray.x, `${where}: bandeja à esquerda`).toBeLessThan(size.width / 3);
      expect(tray.x, `${where}: bandeja dentro da tela`).toBeGreaterThanOrEqual(0);
      expect(tray.y + tray.height, `${where}: bandeja dentro da tela`).toBeLessThanOrEqual(size.height);
      expect(await page.evaluate(() => window.__game.trayClear()), `${where}: bandeja cobre o circuito`).toBe(true);
      // Fora da placa, só numa margem larga: numa faixa estreita ela ficaria solta, colada na borda da tela.
      const boardLeft = await page.evaluate(() => (innerWidth - parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--board-w'))) / 2);
      if (tray.x + tray.width <= boardLeft) expect(boardLeft, `${where}: margem estreita demais para a bandeja`).toBeGreaterThanOrEqual(2 * tray.width);
      for (const sel of ['.hud', '[data-testid="difficulty"]', '.lives', '.action-bar', '.hud-tip']) {
        const other = page.locator(sel);
        if (!(await other.count())) continue;
        expect(overlap(tray, (await other.boundingBox())!), `${where}: bandeja cobre ${sel}`).toBe(false);
      }
    }
  }
});

interface DOMRectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

test('última fase encerra a campanha', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game !== undefined);
  const total = await page.evaluate(() => window.__game.levels);
  await seedProgress(page, upTo(total - 1), ALL_GATES);
  await page.goto('/');
  await page.getByTestId('play').click();
  await waitForBoard(page, total);
  await win(page, total);
  await expect(page.getByTestId('win-text')).toHaveText(`Completou todas as ${total} fases.`);
  await page.getByRole('button', { name: 'Menu principal' }).click();
  await expect(page.getByTestId('play')).toContainText('Todas concluídas');
});

test('todas as fases da campanha podem ser vencidas', async ({ page }) => {
  test.setTimeout(480_000);
  await page.goto('/');
  await page.waitForFunction(() => window.__game !== undefined);
  const total = await page.evaluate(() => window.__game.levels);
  expect(total).toBe(51);
  for (let level = 1; level <= total; level++) {
    await page.goto(`/?level=${level}`);
    await waitForBoard(page, level);
    expect((await state(page))!.lampOn, `fase ${level} começa apagada`).toBe(false);
    await win(page, level);
  }
});
