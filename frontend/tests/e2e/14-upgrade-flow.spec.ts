import { test, expect } from '@playwright/test';
import { resetGuest, loadDashboard, openChat, sendChat, expectNoCarnivalLeak } from './helpers';

// Bug D + E regression:
// - Generic "upgrade my drink package" → 2 picker cards (no hallucinated tier)
// - Tapping "Give me the $500 package" → drink_package card shows real
//   charged amount + credit + new folio balance (not $0.00 / $0.00).
test('drink package upgrade flow — picker then real charge', async ({ page }) => {
  await resetGuest(page);
  await loadDashboard(page);
  await openChat(page);

  // Step 1: generic upgrade → 2 picker cards
  await sendChat(page, 'Upgrade my drink package');

  // Both real tiers should appear as picker cards
  await expect(page.getByText(/\$150.*\$175.*credit/i).first()).toBeVisible({ timeout: 8000 });
  await expect(page.getByText(/\$250.*\$300.*credit/i).first()).toBeVisible({ timeout: 2000 });

  // The hallucinated tier name should never appear
  const body = (await page.locator('body').innerText()).toLowerCase();
  expect(body).not.toContain('premium_unlimited');
  expect(body).not.toContain("isn't ringing any bells");

  // Step 2: tap "Lock it in" on the Premium ($250) card
  // There are two "Lock it in" buttons (one per tier). Find the one inside
  // the Premium card and click it.
  const lockButtons = page.getByRole('button', { name: /lock it in/i });
  await expect(lockButtons.first()).toBeVisible({ timeout: 3000 });
  // Pick the second (the Premium card is rendered second in the array)
  await lockButtons.nth(1).click();

  // After Marina processes, a `drink_package` card should appear with real charges
  await expect(page.getByText(/\$250\.00/).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/\$300\.00/).first()).toBeVisible({ timeout: 4000 });
  // Card should also show a "Charged" and "Credit loaded" label
  await expect(page.getByText(/charged/i).first()).toBeVisible({ timeout: 2000 });
  await expect(page.getByText(/credit loaded/i).first()).toBeVisible({ timeout: 2000 });

  await expectNoCarnivalLeak(page, 'drink package upgrade');
});
