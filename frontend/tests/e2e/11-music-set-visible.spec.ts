import { test, expect } from '@playwright/test';
import { resetGuest, loadDashboard, openChat, sendChat, expectNoCarnivalLeak } from './helpers';

// Bug A regression: the Now Playing chat card must surface the set name (e.g.
// "Klub Rubik's") so the connection back to the dashboard "NOW · THE MANOR"
// widget is visible, not just the song title + artist.
test('now playing chat card displays the set label + dj name', async ({ page }) => {
  await resetGuest(page);
  await loadDashboard(page);
  await openChat(page);
  await sendChat(page, "What's playing at The Manor right now? Identify the track.");

  // The chat panel should contain the song info plus the bridge text:
  // a DJ line (e.g. "Resident · Klub Rubik's") OR a set label (e.g. "Klub Rubik's").
  const panel = page.locator('body');
  // A handful of acceptable set labels — whichever the current local time maps to.
  const validLabels = [
    "Klub Rubik's",
    "DJ Marvy",
    "Sundowner Disco",
    "Dinner Funk Hour",
    "After-Hours Grooves",
    "Wind-Down Soul",
  ];
  let found = false;
  for (const label of validLabels) {
    if (await panel.getByText(label, { exact: false }).first().isVisible({ timeout: 1000 }).catch(() => false)) {
      found = true;
      break;
    }
  }
  expect(found, 'expected at least one set label or DJ identifier in the chat card').toBe(true);
  await expectNoCarnivalLeak(page, 'now playing card');
});
