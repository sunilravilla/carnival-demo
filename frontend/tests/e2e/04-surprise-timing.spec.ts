import { test, expect } from '@playwright/test';
import { resetGuest, loadDashboard, openChat, sendChat } from './helpers';

// Regression for user-reported Bug B2: arrange_surprise card says
// "pre-poured table-side" for an 8 PM dinner, but the embedded champagne
// card shows "ETA ~7 min" (delivery-from-now framing).
// After fix: when scheduled_time is set, ChampagneCard should say
// "Pre-poured at HH:MM" instead of "ETA ~7 min".

test('surprise mode champagne timing matches scheduled dinner time', async ({ page }) => {
  await resetGuest(page);
  await loadDashboard(page);
  await openChat(page);

  await sendChat(page, 'Arrange an anniversary surprise for tonight, premium budget.');
  const body = await page.locator('body').innerText();

  // Sanity: surprise summary mentions dinner at The Wake at 8 PM
  expect(body).toMatch(/the wake/i);
  expect(body).toMatch(/8:00 pm|8 pm|20:00/i);

  // The champagne sub-card should be timed to the dinner (pre-poured),
  // NOT shown as a "~7 min ETA" countdown.
  // BUG B2: today this fails — ETA shown.
  const hasEtaPattern = /eta\s*~\s*\d+\s*min/i.test(body);
  const hasPrePouredPattern = /pre-?poured|scheduled|at\s+(8|20):?\d{0,2}\s*(pm|p\.m\.)?/i.test(body);

  expect(
    hasPrePouredPattern,
    'Champagne for a scheduled dinner should show "Pre-poured at 8:00 PM", not "ETA ~7 min"',
  ).toBeTruthy();
  expect(
    hasEtaPattern,
    'Champagne card should NOT show an immediate-delivery ETA when scheduled for later',
  ).toBeFalsy();
});
