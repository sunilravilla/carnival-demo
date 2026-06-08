import { test, expect } from '@playwright/test';
import { resetGuest, loadDashboard, expectNoCarnivalLeak } from './helpers';

// Catch: any Virgin-only dashboard section that fails to render, throws,
// or leaks Carnival residue.

test.beforeEach(async ({ page }) => {
  await resetGuest(page);
});

test('dashboard renders every Marenova-only section without errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`console.error: ${msg.text()}`);
  });

  await loadDashboard(page);

  // Hero
  await expect(page.getByText(/welcome back/i)).toBeVisible();
  // Marenova Aurora ship label
  await expect(page.getByText('Marenova Aurora').first()).toBeVisible();
  // Tonight's Look section
  await expect(page.getByText(/starlight deck party/i).first()).toBeVisible();
  // Shake for a Treat CTA
  await expect(page.getByRole('button', { name: /press for a treat/i })).toBeVisible();
  // Now Playing at the Starlight Lounge section
  await expect(page.getByText(/starlight lounge/i).first()).toBeVisible();
  // ReservationWidget — either has entries or empty state
  await expect(page.getByText(/today's reservations|your reservations|no reservations/i).first()).toBeVisible();
  // FolioWidget / Onboard Account
  await expect(page.getByText(/onboard account|folio/i).first()).toBeVisible();
  // QuickActions has at least one chip visible
  await expect(page.getByText(/quick actions/i)).toBeVisible();

  // No console errors after settle
  await page.waitForTimeout(1500);
  expect(consoleErrors, `Console errors on dashboard: ${consoleErrors.join('\n')}`).toEqual([]);
});

test('dashboard contains zero Carnival residue strings', async ({ page }) => {
  await loadDashboard(page);
  await page.waitForTimeout(800);
  await expectNoCarnivalLeak(page, 'dashboard');
});

test('switching to Aurora Grand Suite guest shows the gold perks card', async ({ page }) => {
  await loadDashboard(page, '9999999998');
  // Should show Aurora Grand Suite tier badge somewhere
  await expect(page.getByText(/aurora grand suite/i).first()).toBeVisible();
  // Perks card should mention the Aurora Deck
  await expect(page.getByText(/aurora deck/i).first()).toBeVisible();
});
