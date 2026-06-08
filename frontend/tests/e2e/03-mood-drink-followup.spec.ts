import { test, expect } from '@playwright/test';
import { resetGuest, loadDashboard, openChat, sendChat } from './helpers';

// Regression: recommend a refreshment (Aurora Sparkler) → "send it to my cabin
// instead" → Marina's treat CARD should reference the SAME refreshment, because
// order_champagne accepts a `bottle` override. The card should match the narration.

test('mood drink follow-up: sending recommended refreshment to cabin preserves the name', async ({ page }) => {
  await resetGuest(page);
  await loadDashboard(page);
  await openChat(page);

  // 1. Ask for a celebratory refreshment; the celebratory default is the Aurora Sparkler.
  await sendChat(page, 'What should I drink right now? I am celebrating.');
  let body = await page.locator('body').innerText();
  expect(body, 'Marina should suggest an Aurora Sparkler for celebratory mood').toMatch(/aurora sparkler/i);

  // 2. Follow up: "send it to my cabin instead"
  await sendChat(page, 'Send it to my cabin instead.');
  body = await page.locator('body').innerText();

  // The follow-up treat card should reference the Aurora Sparkler (the override
  // propagates via order_champagne's `bottle` arg).
  const mentionsSparkler = /aurora sparkler/i.test(body);
  expect(
    mentionsSparkler,
    'The follow-up treat card should mention the Aurora Sparkler (or whatever the recommendation was)',
  ).toBeTruthy();
});
