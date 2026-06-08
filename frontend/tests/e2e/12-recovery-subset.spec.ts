import { test, expect } from '@playwright/test';
import { resetGuest, loadDashboard, openChat, sendChat, expectNoCarnivalLeak } from './helpers';

// Bug B regression: asking for a SUBSET of recovery items must produce a card
// with only those items — not the full 4-item preset. The user's original
// complaint: "I only asked for spa and smoothie, why is cabana siesta there?"
test('book_recovery_item shows only the requested items', async ({ page }) => {
  await resetGuest(page);
  await loadDashboard(page);
  await openChat(page);
  await sendChat(page, 'Book the hydration boost and a green smoothie');

  // Card should contain the two requested items
  await expect(page.getByText(/vitamin boost/i).first()).toBeVisible({ timeout: 8000 });
  await expect(page.getByText(/green smoothie/i).first()).toBeVisible({ timeout: 5000 });

  // The response card itself MUST NOT include "Cabana siesta" — but it is OK
  // for the suggested-follow-up chips below the card to mention it
  // ("Add the cabana siesta" is a fine UX nudge). Use the data-testid on the
  // RecoveryMenuCard root to scope precisely.
  const card = page.locator('[data-testid="recovery-menu-card"]').first();
  await expect(card).toBeVisible({ timeout: 4000 });
  await expect(card).toHaveAttribute('data-subset', 'true');
  const cardText = (await card.innerText()).toLowerCase();
  expect(cardText).not.toContain('cabana siesta');
  expect(cardText).not.toContain('late breakfast at horizon steakhouse');
  await expectNoCarnivalLeak(page, 'recovery subset');
});
