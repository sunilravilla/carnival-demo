import { test, expect } from '@playwright/test';
import { resetGuest, loadDashboard, openChat, sendChat, expectNoCarnivalLeak } from './helpers';

// Bug W5.2 regression: the WeatherCard had two hardcoded Carnival residues —
// "Marina ✦" attribution and "Cozumel Tomorrow" port label. Both must now be
// driven by the brand registry + the backend payload's dynamic port name.
test('weather card shows Ruby attribution and a Virgin port label', async ({ page }) => {
  await resetGuest(page);
  await loadDashboard(page);
  await openChat(page);

  await sendChat(page, "What's the weather like?");

  // Scope assertions to the WeatherCard root (data-testid added in Wave 5).
  const card = page.locator('[data-testid="weather-card"]').first();
  await expect(card).toBeVisible({ timeout: 8000 });

  const cardText = await card.innerText();
  // Brand attribution: Virgin agent name is Ruby — Marina is the Carnival name.
  expect(cardText).toContain('Ruby');
  expect(cardText).not.toContain('Marina');

  // Port label must not say Cozumel (Carnival itinerary port).
  expect(cardText.toLowerCase()).not.toContain('cozumel');

  // Should mention at least one real Virgin port — Bimini, Puerto Plata, or
  // PortMiami. Different active demo days surface different ports.
  const portRe = /(bimini|puerto plata|plata|portmiami|miami)/i;
  expect(portRe.test(cardText), `weather card should reference a Virgin port; got: ${cardText}`).toBe(true);

  await expectNoCarnivalLeak(page, 'weather card');
});
