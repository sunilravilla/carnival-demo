import { test, expect } from '@playwright/test';
import { resetGuest, loadDashboard, openChat, sendChat, expectNoCarnivalLeak } from './helpers';

// Bug C regression: tapping a suggested invitee chip must open the contact
// picker modal (not silently do nothing as before).
test('squad invitee chip opens contact picker modal', async ({ page }) => {
  await resetGuest(page);
  await loadDashboard(page);
  await openChat(page);
  await sendChat(page, 'Create a Scarlet Night squad event for 4 of us');

  // Wait for the squad card to render — look for "Group of"
  await expect(page.getByText(/group of \d/i).first()).toBeVisible({ timeout: 8000 });

  // Tap one of the suggested invitee chips (first one — should be Lisa P.)
  const chip = page.getByRole('button', { name: /Lisa P\./i }).first();
  await expect(chip).toBeVisible({ timeout: 4000 });
  await chip.click();

  // Modal should appear with "Swap Lisa P." header and a list of replacement
  // sailors. We assert the modal header text is now visible.
  await expect(page.getByText(/swap lisa p\./i).first()).toBeVisible({ timeout: 3000 });
  await expect(page.getByText(/pick a replacement/i).first()).toBeVisible({ timeout: 2000 });

  // Cancel button should be present and clickable
  const cancelBtn = page.getByRole('button', { name: /^cancel$/i }).first();
  await expect(cancelBtn).toBeVisible();
  await cancelBtn.click();
  // After cancel, the modal header text should no longer be visible
  await expect(page.getByText(/pick a replacement/i)).toHaveCount(0, { timeout: 2000 });

  await expectNoCarnivalLeak(page, 'squad swap modal');
});
