import { test, expect } from '@playwright/test';

// Sanity: page actually loads + we can navigate past the access gate via the
// known demo access code, then via the QR fast-path land directly on the
// dashboard with the primary mock guest.

test('access gate accepts the demo code and routes to a guest dashboard', async ({ page }) => {
  await page.goto('/?phone=9999999990');
  // The AccessGate input is keyed by id="access-input" — use it directly to
  // avoid matching the chat input on later pages (strict-mode locator violation).
  const accessInput = page.locator('#access-input');
  if (await accessInput.count() > 0 && await accessInput.isVisible({ timeout: 1500 }).catch(() => false)) {
    await accessInput.fill('hpe-carnival');
    await page.keyboard.press('Enter');
  }
  // Wait for the dashboard's "Welcome back" greeting (the canonical loaded marker).
  await expect(page.getByText(/welcome back/i).first()).toBeVisible({ timeout: 15_000 });
});
