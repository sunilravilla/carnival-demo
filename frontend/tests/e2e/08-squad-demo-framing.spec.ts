import { test, expect } from '@playwright/test';
import { resetGuest, loadDashboard, openChat, sendChat } from './helpers';

// Regression for user-reported Bug B3: create_squad_event narrates and
// renders mock invitees ("Lisa P., Marcus T., ...") as if they're real
// people the user knows. After fix: card should clearly frame them as
// "Suggested · tap to invite" or similar demo-aware copy.

test('squad event makes it clear the invitee names are sample / demo data', async ({ page }) => {
  await resetGuest(page);
  await loadDashboard(page);
  await openChat(page);

  await sendChat(page, 'Create a Scarlet Night squad event for 4 of us.');
  const body = await page.locator('body').innerText();

  // The card should exist
  expect(body, 'Expected a squad event card').toMatch(/squad/i);
  // Mock invitees are still listed (that's fine)
  expect(body, 'Expected at least one mock invitee').toMatch(/Lisa P\.|Marcus T\.|Priya R\./);

  // KEY ASSERTION: somewhere on the card or in Marina's narration there should
  // be language framing these as suggestions/samples/past-companions —
  // NOT as confirmed real invitees.
  const demoFraming =
    /suggested|sample|tap to invite|tap to swap|placeholder|past travel|sailed with before|demo/i;
  expect(
    demoFraming.test(body),
    'Squad event card should frame invitees as suggested/sample, not as real people',
  ).toBeTruthy();
});
