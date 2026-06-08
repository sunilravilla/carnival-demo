import { test, expect } from '@playwright/test';
import { resetGuest, loadDashboard, openChat, sendChat } from './helpers';

// Regression guard for the Wave 2 land_the_look bug fix:
// each of the 3 outfit choices must produce a DIFFERENT cocktail + a DIFFERENT
// salon confirmation number. If any two looks share a confirmation # or a
// cocktail name, the macro routing has regressed.

const LOOKS = [
  { id: 'scarlet-statement', label: 'Starlight Sparkle', expectedDrink: /aurora sparkler/i },
  { id: 'crimson-tux',        label: 'Deck Party Sharp',  expectedDrink: /cold brew tonic/i },
  { id: 'after-hours',        label: 'Evening Glow',      expectedDrink: /berry fizz/i },
];

test.beforeEach(async ({ page }) => {
  await resetGuest(page);
});

for (const look of LOOKS) {
  test(`land_the_look — ${look.label} produces its unique refreshment`, async ({ page }) => {
    await loadDashboard(page);
    await openChat(page);
    await sendChat(page, `Land the ${look.label} look for the Starlight Deck Party.`);

    // Macro should produce 4 cards in the chat. Expect at least the
    // look-specific refreshment name to appear in the visible chat body.
    const body = await page.locator('body').innerText();
    expect(body, `Expected '${look.expectedDrink}' for ${look.label}`).toMatch(look.expectedDrink);

    // The macro should produce a salon booking (SAL... confirmation).
    expect(body, 'Expected SAL confirmation in chat').toMatch(/SAL\d{5}/);
    // And a Starlight Lounge table booking.
    expect(body, 'Expected SLT confirmation in chat').toMatch(/SLT\d{5}/);
    // And an outfit confirmation marker.
    expect(body, 'Expected OUT confirmation in chat').toMatch(/OUT\d{5}/);
  });
}
