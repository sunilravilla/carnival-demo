import { Page, expect, Locator } from '@playwright/test';

// Forbidden cross-brand residue for the Marenova demo. Anywhere in the visible
// UI = demo killer. Blocks BOTH Carnival residue (from the original template)
// AND Virgin residue (this branch was cut from virgin-voyages).
// NOTE: 'Marina' is intentionally NOT listed — it is the Marenova concierge's name.
export const CARNIVAL_LEAK_STRINGS = [
  // ── Carnival residue ──
  'Carnival',
  'Celebration',
  'Cucina',
  'Fahrenheit',
  'Big Chicken',
  "Guy's Burger",
  'Punchliner',
  'Limelight Lounge',
  'Liquid Lounge',
  'CHEERS!',
  'Cozumel',
  'Cloud 9',
  'VIFP Gold',
  'VIFP Platinum',
  // ── Virgin residue ──
  'Virgin',
  'Scarlet Lady',
  'Scarlet Night',
  'The Manor',
  'Branson',
  'RockStar',
  'Bar Tab',
  'Möet',
  'Sailor App',
  'Persephone',
  'Pink Agave',
  'Gunbae',
  'Extra Virgin',
  'Razzle Dazzle',
  'Bimini',
  'Redemption Spa',
];

// Reset primary guest so each spec starts clean (no duplicate-guards).
export async function resetGuest(page: Page, phone = '9999999990') {
  const apiBase = process.env.API_BASE_URL || 'http://localhost:8000';
  await page.request.post(`${apiBase}/api/guest/reset`, {
    data: { phone },
    headers: { 'Content-Type': 'application/json' },
  });
  await page.request.post(`${apiBase}/api/guest/lookup`, {
    data: { identifier: phone },
    headers: { 'Content-Type': 'application/json' },
  });
}

// Load the dashboard for a specific demo guest via the QR fast-path.
export async function loadDashboard(page: Page, phone = '9999999990') {
  await page.goto(`/?phone=${phone}`);
  // Wait for the dashboard hero to render — it's the canonical "loaded" marker.
  await expect(page.getByText('Welcome back')).toBeVisible({ timeout: 15_000 });
}

// Open the Marina chat panel by tapping the floating bubble.
export async function openChat(page: Page) {
  const bubble = page.locator('[title^="Chat with"]');
  await bubble.click();
  // Wait for the chat header (Marenova Aurora title) to be visible.
  await expect(page.getByText('Marenova Aurora', { exact: false })).toBeVisible({ timeout: 5_000 });
}

// Send a message in the open chat, wait for Marina to finish responding.
// Strategy: send, then wait for the input field to be re-enabled (the
// ChatInterface disables it while isProcessing is true and re-enables once
// the SSE stream completes). Much more reliable than whole-body polling.
export async function sendChat(page: Page, message: string) {
  const input = page.getByPlaceholder('Ask Marina…');
  await input.click();
  await input.fill(message);
  await input.press('Enter');
  // First, wait for the input to become disabled (the request is in flight).
  // It might already be disabled by the time we look; race the disable check
  // with a short timeout — either branch is fine.
  await Promise.race([
    input.evaluate((el: HTMLInputElement) => new Promise<void>((resolve) => {
      if (el.disabled) return resolve();
      const obs = new MutationObserver(() => {
        if (el.disabled) { obs.disconnect(); resolve(); }
      });
      obs.observe(el, { attributes: true, attributeFilter: ['disabled'] });
    })),
    page.waitForTimeout(800),
  ]);
  // Then wait for the input to become enabled again — Marina's done.
  await page.waitForFunction(
    () => {
      const i = document.querySelector('input[placeholder="Ask Marina…"]') as HTMLInputElement | null;
      return !!i && !i.disabled;
    },
    null,
    { timeout: 60_000 },
  );
  // Tiny settle so streaming animation finishes painting.
  await page.waitForTimeout(400);
}

// Scan the visible page body text for forbidden Carnival residue.
export async function expectNoCarnivalLeak(page: Page, where = 'page') {
  const body = await page.locator('body').innerText();
  const leaks = CARNIVAL_LEAK_STRINGS.filter((s) =>
    body.toLowerCase().includes(s.toLowerCase()),
  );
  if (leaks.length > 0) {
    // Provide actionable error
    throw new Error(`Carnival leak detected in ${where}: ${leaks.join(', ')}`);
  }
}

// Convenience: get text content for an element if present.
export async function textOrEmpty(loc: Locator): Promise<string> {
  if ((await loc.count()) === 0) return '';
  return (await loc.first().innerText()).trim();
}
