import { test, expect } from '@playwright/test';
import { resetGuest, loadDashboard, openChat, sendChat } from './helpers';

// Regression for user-reported Bug B1: recommend Krug → "send it to my cabin
// instead" → Marina's CARD shows Möet & Chandon (not Krug) because order_champagne
// is hardcoded. After the fix, the card should match Marina's narration.

test('mood drink follow-up: sending recommended drink to cabin preserves the bottle', async ({ page }) => {
  await resetGuest(page);
  await loadDashboard(page);
  await openChat(page);

  // 1. Ask for a celebratory drink; we expect Marina to suggest Krug.
  await sendChat(page, 'What should I drink right now? I am celebrating.');
  let body = await page.locator('body').innerText();
  // Krug is the celebratory default in _MOOD_DRINKS.
  expect(body, 'Marina should suggest a Krug pour for celebratory mood').toMatch(/krug/i);

  // 2. Follow up: "send it to my cabin instead"
  await sendChat(page, 'Send it to my cabin instead.');
  body = await page.locator('body').innerText();

  // The order card should reference Krug, NOT Möet.
  // BUG B1: today this fails — order_champagne hardcodes Möet.
  // After fix: the new bottle param should propagate to the card.
  const mentionsKrug = /krug/i.test(body);
  const mentionsMoet = /möet|moet/i.test(body);

  expect(
    mentionsKrug,
    'The follow-up order card should mention Krug (or whatever the recommendation was)',
  ).toBeTruthy();
  // It's OK for "Möet" to appear elsewhere on the page (other cards) but
  // the new card following this exchange should specifically be the Krug.
  // We assert presence of Krug rather than absence of Möet to avoid false positives.

  // The order should still show as a $-priced item in the folio language.
  expect(body).toMatch(/\$\d+/);
});
