import { expect, test } from '@playwright/test';
import { BY_THE_GATE, phoneContext } from './helpers';

test('a worker with a Hebrew phone gets the app in Hebrew, right to left, and can switch to Arabic', async ({ browser }) => {
  // A new worker in the demo company; no language chosen, so the phone's language is used.
  const owner = await browser.newContext();
  const api = owner.request;
  const headers = { 'x-requested-with': 'onsite' };
  await api.post('/api/auth/login', { headers, data: { username: 'developer', password: 'developer123' } });
  const companies = await (await api.get('/api/dev/companies')).json();
  const demo = companies.find((c: { name: string }) => c.name === 'Demo Construction Co.');
  const created = await api.post('/api/dev/users', {
    headers,
    data: { role: 'worker', companyId: demo.id, username: 'noa.levi', fullName: 'Noa Levi', password: 'noa-levi-123' },
  });
  expect(created.ok()).toBe(true);
  await owner.close();

  const phone = await phoneContext(browser, BY_THE_GATE, 'he-IL');
  const page = await phone.newPage();
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'he');
  await page.getByLabel('שם משתמש').fill('noa.levi');
  await page.getByLabel('סיסמה', { exact: true }).fill('noa-levi-123');
  await page.getByRole('button', { name: 'התחברות' }).click();

  await page.getByRole('button', { name: 'כניסה', exact: true }).click({ timeout: 15_000 });
  await page.getByRole('button', { name: 'צילום תמונה' }).click({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'נרשמה כניסה' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'סיום' }).click();
  // Names inside Hebrew/Arabic sentences are wrapped in invisible direction isolates (U+2068 … U+2069).
  await expect(page.getByText(/באתר · \u2068?Riverside Tower/)).toBeVisible();

  // Switching to Arabic on the "Me" page changes the whole app and is saved on the account.
  await page.getByRole('link', { name: 'החשבון שלי' }).click();
  await page.getByLabel('שפה').selectOption('ar');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.getByRole('heading', { name: 'حسابي' })).toBeVisible();
  await expect.poll(async () => (await (await page.request.get('/api/auth/me')).json()).user.locale).toBe('ar');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { name: 'حسابي' })).toBeVisible();
  await phone.close();
});
