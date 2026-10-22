import type { Browser, BrowserContext, Page } from '@playwright/test';

// Positions near the demo workplace "Riverside Tower" (pin at 51.5072, -0.1276, see scripts/seed-demo.ts).
// They are deliberately not on the pin and have real-GPS precision: a position exactly on the pin, or with
// few decimals, is what fake-GPS apps produce, and the server flags it.
export const SITE = { latitude: 51.507318, longitude: -0.127492 };
export const NEAR_SITE = { latitude: 51.507455, longitude: -0.127301 };
export const FAR_AWAY = { latitude: 51.531245, longitude: -0.101873 };

/**
 * A phone-sized browser context with location and camera allowed. Automation is hidden and the platform
 * matches the phone, as on a real device — otherwise the anti-cheat checks (correctly) flag the browser.
 */
export async function phoneContext(browser: Browser, location = SITE): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
    geolocation: { ...location, accuracy: 8 },
    permissions: ['geolocation', 'camera'],
  });
  await context.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
    Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'Linux armv8l' });
  });
  return context;
}

export async function signIn(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}
