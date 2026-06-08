import { test, expect } from '@playwright/test';
import { resetGuest, loadDashboard, openChat, sendChat } from './helpers';

// Regression for user-reported Bug B5: asking for a SPECIFIC recovery item
// ("book hydration drip and smoothie") triggers the FULL recovery menu card
// again. After fix: should fire a single book_spa_treatment + recovery item
// without re-issuing the menu.

test('asking for specific recovery items does NOT re-show the full menu', async ({ page }) => {
  await resetGuest(page);
  await loadDashboard(page);
  await openChat(page);

  // Specific items only — should NOT trigger the full menu macro.
  await sendChat(page, 'Book just the hydration boost — nothing else from the Morning Reset menu.');

  const body = await page.locator('body').innerText();

  // Should see a spa-booking confirmation
  expect(body).toMatch(/hydration|serenity spa/i);

  // The full Morning Reset menu has multiple items. A response containing ALL of:
  //   "Hydration & vitamin boost"
  //   "Green smoothie"
  //   "Late breakfast"
  //   "Cabana siesta"
  // means the full menu was returned again, not a single booking.
  const fullMenuItems = ['vitamin boost', 'green smoothie', 'late breakfast', 'cabana siesta'];
  const hits = fullMenuItems.filter((s) => body.toLowerCase().includes(s));

  expect(
    hits.length,
    `Asked for ONE item but response includes ${hits.length} recovery menu items (${hits.join(', ')}) — full menu was re-shown`,
  ).toBeLessThan(3);
});
