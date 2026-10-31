/**
 * Playwright smoke tests S01–S07
 * Run: npx playwright test --project=chromium
 *
 * These tests verify the page loads correctly without requiring WebGPU —
 * the app shows a "capability" banner on non-WebGPU browsers, which is fine.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';

test.describe('Séance: Dead Tongues — smoke tests', () => {
  // S01: page loads without 500 errors
  test('S01 — page loads', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (r) => {
      if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`);
    });

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');

    // No catastrophic JS or network errors
    const fatal = errors.filter((e) => !e.includes('WebGPU') && !e.includes('webgpu'));
    expect(fatal).toHaveLength(0);
  });

  // S02: correct heading / title
  test('S02 — heading visible', async ({ page }) => {
    await page.goto(BASE);
    const h1 = page.locator('h1');
    await expect(h1).toContainText('Séance');
    await expect(h1).toContainText('Dead Tongues');
  });

  // S03: initial ghost message is present
  test('S03 — intro ghost message visible', async ({ page }) => {
    await page.goto(BASE);
    const msg = page.locator('.bubble--ghost').first();
    await expect(msg).toBeVisible();
    await expect(msg).toContainText('SNOBOL4');
  });

  // S04: send button disabled when engine not ready
  test('S04 — send button disabled until engine ready', async ({ page }) => {
    await page.goto(BASE);
    // On a non-WebGPU browser the engine never loads, so button stays disabled
    const btn = page.locator('.send-btn');
    await expect(btn).toBeDisabled();
  });

  // S05: spell panel is rendered (spells loaded from JSON)
  test('S05 — spell panel visible with spells', async ({ page }) => {
    await page.goto(BASE);
    // Wait for spells.json to be fetched and panel to render
    await page.waitForSelector('.spell-panel', { timeout: 5000 });
    const panel = page.locator('.spell-panel');
    await expect(panel).toBeVisible();
    // At least one spell button rendered
    const spellBtns = page.locator('.spell-btn');
    await expect(spellBtns.first()).toBeVisible();
  });

  // S06: footer contains expected links
  test('S06 — footer has GitHub and DEV links', async ({ page }) => {
    await page.goto(BASE);
    const footer = page.locator('.app-footer');
    await expect(footer).toContainText('GitHub');
    await expect(footer).toContainText('DEV Week');
  });

  // S07: window.runIn is NOT defined (security check — no global SNOBOL runner)
  test('S07 — window.runIn is not defined (no global execution surface)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    const runInDefined = await page.evaluate(() => typeof (window as unknown as Record<string, unknown>).runIn !== 'undefined');
    expect(runInDefined).toBe(false);
  });
});
