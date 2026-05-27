import { test, expect } from '@playwright/test';
import { resetGuest, loadDashboard, openChat, sendChat, expectNoCarnivalLeak } from './helpers';

// Bug F regression: calling a macro (e.g. hangover_recovery_menu) twice in
// the same session must NOT create duplicate rows in the dashboard
// Today's Reservations list. Dedup helper guards against this.
test('macro re-fire does not duplicate dashboard reservations', async ({ page }) => {
  await resetGuest(page);
  await loadDashboard(page);
  await openChat(page);

  // Fire the full recovery menu macro twice
  await sendChat(page, 'Set me up for tomorrow morning, the full recovery menu');
  await sendChat(page, 'Actually run the full recovery menu again');

  // Re-check reservations endpoint directly — single source of truth
  const apiBase = process.env.API_BASE_URL || 'http://localhost:8000';
  const res = await page.request.get(`${apiBase}/api/guest/reservations`);
  expect(res.ok()).toBe(true);
  const body = await res.json();
  const rs = Array.isArray(body) ? body : (body.reservations || []);

  const hydrationCount = rs.filter((r: any) =>
    (r.treatment_name || '').toLowerCase().includes('hydration drip')
  ).length;
  const breakfastCount = rs.filter((r: any) =>
    r.restaurant_id === 'the-wake-breakfast'
  ).length;
  const loungerCount = rs.filter((r: any) => r.kind === 'lounger').length;

  expect(hydrationCount, 'hydration drip should appear once after dedup').toBe(1);
  expect(breakfastCount, 'The Wake breakfast should appear once after dedup').toBe(1);
  expect(loungerCount, 'cabana siesta lounger should appear once after dedup').toBe(1);

  await expectNoCarnivalLeak(page, 'duplicate reservations');
});
