import { expect, test, type Page } from '@playwright/test';

type Bit = 0 | 1;
interface GameState {
  level: number;
  inputs: Record<string, Bit>;
  lampOn: boolean;
  animating: boolean;
  won: boolean;
}

declare global {
  interface Window {
    __game: {
      pointOf(id: string): { x: number; y: number } | null;
      solution(levelId: number): Bit[] | null;
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

async function seedProgress(page: Page, completed: number[], seenIntros: string[] = []): Promise<void> {
  await page.addInitScript(
    ([c, s]) => localStorage.setItem('portas-logicas:progress', JSON.stringify({ version: 1, completed: c, seenIntros: s, sound: false, music: false })),
    [completed, seenIntros] as const,
  );
}

test('primeira jogada: introdução, fase 1, vitória e progresso salvo', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('play').click();
  await expect(page.getByRole('heading', { name: /AND/ })).toBeVisible();
  await expect(page.locator('.truth-table tr.current')).toHaveCount(1);
  await page.getByRole('button', { name: 'Começar fase 1' }).click();
  await waitForBoard(page, 1);
  await expect(page.getByTestId('level-title')).toHaveText('Fase 1');

  await tap(page, 'b');
  expect((await state(page))!.inputs).toEqual({ a: 1, b: 1 });
  // A lâmpada só acende depois que a energia percorre as trilhas.
  expect((await state(page))!.lampOn).toBe(false);
  await expect.poll(async () => (await state(page))!.won, { timeout: 5000 }).toBe(true);
  await expect(page.getByTestId('next')).toBeVisible();

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('portas-logicas:progress')!));
  expect(saved.completed).toEqual([1]);
  expect(saved.seenIntros).toEqual(['AND']);

  // Fase 2 apresenta o OR antes de começar.
  await page.getByTestId('next').click();
  await expect(page.getByRole('heading', { name: /OR/ })).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('play')).toHaveText(/Continuar — fase 2/);
});

test('reiniciar volta as chaves ao estado inicial', async ({ page }) => {
  await seedProgress(page, [1, 2], ['AND', 'OR']);
  await page.goto('/');
  await page.getByRole('button', { name: 'Fases' }).click();
  await page.locator('[data-level="3"]').click();
  await waitForBoard(page, 3);
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
});

test('no jogo, o som se configura e o botão de menu volta ao menu principal', async ({ page }) => {
  await seedProgress(page, [1, 2], ['AND', 'OR']);
  await page.goto('/');
  await page.getByRole('button', { name: 'Fases' }).click();
  await page.locator('[data-level="3"]').click();
  await waitForBoard(page, 3);

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

test('tocar numa porta mostra a tabela verdade com a linha atual', async ({ page }) => {
  await seedProgress(page, [1, 2], ['AND', 'OR']);
  await page.goto('/');
  await page.getByRole('button', { name: 'Fases' }).click();
  await page.locator('[data-level="3"]').click();
  await waitForBoard(page, 3);
  // Fase 3: AND(OR(a, b), c) com a=0, b=0, c=1. O OR (g1) recebe 0 e 0.
  await tap(page, 'g1');
  const popover = page.locator('.popover');
  await expect(popover).toBeVisible();
  await expect(popover.locator('strong')).toHaveText('OR');
  await expect(popover.locator('tr.current td')).toHaveText(['0', '0', '0']);
  await tap(page, 'a');
  // A linha muda quando a energia chega à porta.
  await expect(popover.locator('tr.current td')).toHaveText(['1', '0', '1'], { timeout: 3000 });
  await page.keyboard.press('Escape');
  await expect(popover).toHaveCount(0);
});

test('fases bloqueadas não abrem e o glossário mostra só portas vistas', async ({ page }) => {
  await seedProgress(page, [1], ['AND']);
  await page.goto('/');
  await page.getByRole('button', { name: 'Fases' }).click();
  await expect(page.locator('[data-level="2"]')).toBeEnabled();
  await expect(page.locator('[data-level="3"]')).toBeDisabled();
  await expect(page.locator('[data-level="36"]')).toBeDisabled();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await page.getByRole('button', { name: 'Glossário' }).click();
  await expect(page.locator('[data-gate="AND"]')).toBeEnabled();
  await expect(page.locator('[data-gate="OR"]')).toBeDisabled();
  await page.locator('[data-gate="AND"]').click();
  await expect(page.locator('.intro-screen .chip').first()).toHaveText('A · B');
});

test('todas as 36 fases podem ser vencidas pela solução do solver', async ({ page }) => {
  test.setTimeout(240_000);
  for (let level = 1; level <= 36; level++) {
    await page.goto(`/?level=${level}`);
    await waitForBoard(page, level);
    expect((await state(page))!.lampOn, `fase ${level} começa apagada`).toBe(false);
    await solve(page, level);
    await expect.poll(async () => (await state(page))!.won, { timeout: 8000, message: `fase ${level}` }).toBe(true);
  }
});
