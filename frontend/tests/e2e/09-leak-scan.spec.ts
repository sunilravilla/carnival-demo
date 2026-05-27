import { test, expect } from '@playwright/test';
import {
  resetGuest, loadDashboard, openChat, sendChat,
  expectNoCarnivalLeak,
} from './helpers';

// Full UI scan: after running a few common demo actions, scan the entire
// visible DOM for any Carnival-era residue strings. Anything found = bug.

test('after a normal demo flow, zero Carnival residue exists anywhere in the UI', async ({ page }) => {
  await resetGuest(page);
  await loadDashboard(page);

  // Dashboard scan
  await expectNoCarnivalLeak(page, 'dashboard');

  // Open chat and run a few standard interactions
  await openChat(page);
  await sendChat(page, 'hi');
  await expectNoCarnivalLeak(page, 'chat after greeting');

  await sendChat(page, 'What should I wear for Scarlet Night?');
  await expectNoCarnivalLeak(page, 'chat after outfit suggestion');

  await sendChat(page, 'Book Italian dinner for 7:30');
  await expectNoCarnivalLeak(page, 'chat after Italian booking');

  await sendChat(page, "What's playing right now at The Manor?");
  await expectNoCarnivalLeak(page, 'chat after Shazam');
});
