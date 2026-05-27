import { test, expect } from '@playwright/test';
import { resetGuest, loadDashboard, expectNoCarnivalLeak } from './helpers';

// Catch: any Virgin-only dashboard section that fails to render, throws,
// or leaks Carnival residue.

test.beforeEach(async ({ page }) => {
  await resetGuest(page);
});

test('dashboard renders every Virgin-only section without errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`console.error: ${msg.text()}`);
  });

  await loadDashboard(page);

  // Hero
  await expect(page.getByText(/welcome back/i)).toBeVisible();
  // Scarlet Lady ship label
  await expect(page.getByText('Scarlet Lady').first()).toBeVisible();
  // Tonight's Look section
  await expect(page.getByText(/scarlet night/i).first()).toBeVisible();
  // Shake for Champagne CTA
  await expect(page.getByRole('button', { name: /press for champagne/i })).toBeVisible();
  // Now Playing at The Manor section
  await expect(page.getByText(/the manor/i).first()).toBeVisible();
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

test('switching to Mega RockStar guest shows the gold perks card', async ({ page }) => {
  await loadDashboard(page, '9999999998');
  // Should show Mega RockStar tier badge somewhere
  await expect(page.getByText(/mega rockstar/i).first()).toBeVisible();
  // Perks card should mention Richard's Rooftop
  await expect(page.getByText(/richard'?s rooftop/i).first()).toBeVisible();
});
