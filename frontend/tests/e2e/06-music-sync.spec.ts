import { test, expect } from '@playwright/test';
import { resetGuest, loadDashboard, openChat, sendChat } from './helpers';

// Regression for user-reported Bug B4: the dashboard "Now Playing at The Manor"
// widget rotates DJ sets by hour-of-day, while the chat tool identify_now_playing
// rotates tracks by minute through an INDEPENDENT pool. The two never agree.
// After fix: Shazam result should be a track from the current DJ's set.

test('chat Shazam returns a track consistent with the dashboard widget', async ({ page }) => {
  await resetGuest(page);
  await loadDashboard(page);

  // Read what the dashboard widget claims is playing right now.
  const dashboard = await page.locator('body').innerText();

  // The widget shows a DJ name + a set title. Capture the DJ if visible.
  const djMatch = dashboard.match(/🎧\s*([A-Za-z .'·]+?)(?:\n|·)/);
  const dashboardDj = djMatch ? djMatch[1].trim() : null;
  // Also capture the set name keyword.
  const setKeywords = ['House', 'Disco', 'Soul', 'Funk', 'Rock', 'Synth', "'80s", '70s'].filter(
    (k) => dashboard.toLowerCase().includes(k.toLowerCase()),
  );

  await openChat(page);
  await sendChat(page, 'What is playing right now at The Manor? Identify the track for me.');

  const chat = await page.locator('body').innerText();

  // Shazam should produce a track + artist + venue
  expect(chat, 'Shazam should return a track card').toMatch(/the manor/i);

  // Capture vibe from chat (the new_playing_track card has a `vibe` field).
  // Pull a likely vibe keyword from the chat response.
  const chatHasVibeOverlap = setKeywords.some((kw) => chat.toLowerCase().includes(kw.toLowerCase()));

  // The fix: at least ONE keyword (DJ name OR set vibe) should overlap between
  // dashboard widget and chat Shazam response.
  const hasOverlap =
    chatHasVibeOverlap || (dashboardDj && chat.toLowerCase().includes(dashboardDj.toLowerCase()));

  expect(
    hasOverlap,
    `No overlap between dashboard widget (DJ: ${dashboardDj || 'unknown'}, set keywords: ${setKeywords.join(',') || 'none'}) and chat Shazam response`,
  ).toBeTruthy();
});
