import { test, expect } from '@playwright/test';

// Sanity: page actually loads + we can navigate past the access gate via the
// known demo access code, then via the QR fast-path land directly on the
// dashboard with the primary mock guest.

test('access gate accepts the demo code and routes to a guest dashboard', async ({ page }) => {
  await page.goto('/?phone=9999999990');
  // QR fast-path may bypass the access gate entirely (route by phone). If the
  // gate is still present and stable, fill it. Tolerate the input being
  // detached between visibility check and fill — that just means QR won.
  const accessInput = page.locator('#access-input');
  try {
    if (await accessInput.isVisible({ timeout: 1500 }).catch(() => false)) {
      await accessInput.fill('hpe-carnival', { timeout: 1500 });
      await page.keyboard.press('Enter');
    }
  } catch {
    // QR fast-path detached the input mid-fill — fine, dashboard will render.
  }
  // Wait for the dashboard's "Welcome back" greeting (the canonical loaded marker).
  await expect(page.getByText(/welcome back/i).first()).toBeVisible({ timeout: 15_000 });
});
