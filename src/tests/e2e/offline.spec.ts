import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test.describe("Offline Mode", () => {
  test("shows Offline indicator when network is disabled", async ({ page, context }) => {
    await loginAsAdmin(page);
    await page.goto("http://localhost:3000/pos");

    // Wait for the app to fully load
    await expect(page.locator('[id="pos-search-input"]')).toBeVisible({ timeout: 8000 });

    // Go offline
    await context.setOffline(true);

    // The sync badge changes to "Offline" — wait for it
    // SyncStatusBadge renders with data-sync-status attribute
    await expect(page.locator("[data-sync-status='offline']")).toBeVisible({ timeout: 8000 });
  });

  test("can still add items to cart while offline", async ({ page, context }) => {
    await loginAsAdmin(page);
    await page.goto("http://localhost:3000/pos");

    // Wait for the POS to load
    await expect(page.locator('[id="pos-search-input"]')).toBeVisible({ timeout: 8000 });

    // Go offline
    await context.setOffline(true);

    // Try searching — PGLite offline search should work
    const search = page.locator('[id="pos-search-input"]');
    await search.fill("a");

    // Cart interaction should still work (add from quick-grid if available)
    const anyProductBtn = page.locator('[class*="grid"] button, [class*="product"] button').first();
    if (await anyProductBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await anyProductBtn.click();
      // Cart should update
      await expect(page.locator("text=Cart (1)")).toBeVisible({ timeout: 3000 });
    }

    // Restore network
    await context.setOffline(false);
  });

  test("shows Synced status after coming back online", async ({ page, context }) => {
    await loginAsAdmin(page);
    await page.goto("http://localhost:3000/pos");

    await expect(page.locator('[id="pos-search-input"]')).toBeVisible({ timeout: 8000 });

    // Briefly go offline then come back
    await context.setOffline(true);
    await page.waitForTimeout(500);
    await context.setOffline(false);

    // After coming back online the indicator should show Synced
    await expect(page.locator("[data-sync-status='synced']")).toBeVisible({ timeout: 15000 });
  });
});