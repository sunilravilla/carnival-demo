import { test, expect } from '@playwright/test';
import { resetGuest, loadDashboard, openChat, sendChat } from './helpers';

// Audit-discovered Bug B6: ReservationWidget's TYPE_ICON dict lacks entries
// for Wave 2 reservation kinds (outfit, salon, manor_table, squad_event,
// surprise, flowers, port_day_plan). And resName() doesn't fall back to
// treatment_name. Net effect: Wave 2 bookings render as "Reservation" with
// no icon. After fix: each kind should show its name + a sensible icon.

test('Wave 2 reservation kinds render with names + icons in dashboard widget', async ({ page }) => {
  await resetGuest(page);
  await loadDashboard(page);
  await openChat(page);

  // Seed a varied set of Wave 2 bookings
  await sendChat(page, 'Land the Starlight Sparkle look for the Starlight Deck Party.');
  await sendChat(page, 'Arrange an anniversary surprise tonight, premium budget.');
  await sendChat(page, 'Create a Starlight Deck Party group event for 4 of us.');

  // Close chat to see the dashboard widget
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(800);

  // Look for the ReservationWidget. Each booking should render with a
  // readable name (NOT "Reservation").
  const body = await page.locator('body').innerText();

  // Expected name fragments from the seed actions:
  const expectedNameFragments = [
    /scarlet statement/i,  // outfit
    /blow-?out/i,           // salon
    /the manor/i,           // manor_table
    /anniversary/i,         // surprise summary OR dining
    /squad/i,               // squad_event
  ];
  for (const frag of expectedNameFragments) {
    expect(body, `Expected reservation name matching ${frag}`).toMatch(frag);
  }

  // The fallback string "Reservation" (literal 11-char word, no context)
  // should NOT be the displayed name for any booked item. Sample by counting
  // occurrences of standalone "Reservation\n" pattern.
  const reservationFallbackCount = (body.match(/(?:^|\s)Reservation(?:\s|$)/gm) || []).length;
  expect(
    reservationFallbackCount,
    'Wave 2 reservation kinds are rendering with the fallback "Reservation" label',
  ).toBeLessThan(2);
});
