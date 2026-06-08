import { test, expect } from '@playwright/test';
import { resetGuest, loadDashboard, openChat, sendChat, expectNoCarnivalLeak } from './helpers';

// Wave 4 dedup-helper regression, updated for Wave 5 semantics:
// - hangover_recovery_menu is now preview-only — calling it twice books NOTHING
// - book_recovery_item(items=all 4) is the booking path — calling it twice
//   still leaves exactly 1 of each item (dedup helper alive on the new path)
test('preview macro books nothing, book_recovery_item dedups on repeat', async ({ page }) => {
  await resetGuest(page);
  await loadDashboard(page);
  await openChat(page);

  const apiBase = process.env.API_BASE_URL || 'http://localhost:8000';

  // (a) Two preview-only macro calls → no reservations created
  await sendChat(page, 'Open the Morning Reset menu');
  await sendChat(page, 'Show me the Morning Reset menu again');

  let res = await page.request.get(`${apiBase}/api/guest/reservations`);
  expect(res.ok()).toBe(true);
  let body = await res.json();
  let rs = Array.isArray(body) ? body : (body.reservations || []);
  const previewHydration = rs.filter((r: any) =>
    (r.treatment_name || '').toLowerCase().includes('vitamin boost')
  ).length;
  const previewBreakfast = rs.filter((r: any) => r.restaurant_id === 'the-wake-breakfast').length;
  const previewLounger = rs.filter((r: any) => r.kind === 'lounger').length;
  expect(previewHydration, 'preview macro must not book the hydration boost').toBe(0);
  expect(previewBreakfast, 'preview macro must not book breakfast').toBe(0);
  expect(previewLounger, 'preview macro must not book lounger').toBe(0);

  // (b) Two full-menu book_recovery_item calls → exactly 1 of each item
  await sendChat(page, 'Book all four items from the Morning Reset menu — everything');
  await sendChat(page, 'Actually book the full Morning Reset menu again — everything please');

  res = await page.request.get(`${apiBase}/api/guest/reservations`);
  body = await res.json();
  rs = Array.isArray(body) ? body : (body.reservations || []);
  const hydrationCount = rs.filter((r: any) =>
    (r.treatment_name || '').toLowerCase().includes('vitamin boost')
  ).length;
  const breakfastCount = rs.filter((r: any) => r.restaurant_id === 'the-wake-breakfast').length;
  const loungerCount = rs.filter((r: any) => r.kind === 'lounger').length;
  expect(hydrationCount, 'hydration boost should appear once after dedup').toBe(1);
  expect(breakfastCount, 'The Wake breakfast should appear once after dedup').toBe(1);
  expect(loungerCount, 'cabana siesta lounger should appear once after dedup').toBe(1);

  await expectNoCarnivalLeak(page, 'duplicate reservations');
});
