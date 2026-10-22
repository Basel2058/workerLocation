import { expect, test } from '@playwright/test';
import { FAR_AWAY, NEAR_SITE, phoneContext, signIn, SITE } from './helpers';

test.describe.configure({ mode: 'serial' });

test('worker checks in at the workplace, and the phone cannot be used for another worker', async ({ browser }) => {
  const context = await phoneContext(browser, SITE);
  const page = await context.newPage();
  await signIn(page, 'aisha', 'worker123');

  const button = page.getByRole('button', { name: 'Check in' });
  await expect(button).toBeEnabled({ timeout: 15_000 });
  await button.click();
  await page.getByRole('button', { name: 'Take photo' }).click({ timeout: 15_000 });

  await expect(page.getByRole('heading', { name: 'Checked in' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Riverside Tower').first()).toBeVisible();
  await expect(page.getByText('Your manager will confirm')).toHaveCount(0);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText(/On site · Riverside Tower/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check out' })).toBeVisible();

  // Aisha signs out and lends her phone to Tom so he can check in for her.
  await page.getByRole('link', { name: 'Me', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await signIn(page, 'tom', 'worker123');
  await expect(page.getByText('This phone belongs to another worker')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /Check (in|out)/ })).toBeDisabled();
  await context.close();
});

test('owner creates a company, a workplace and a worker who can then check in', async ({ browser }) => {
  const owner = await browser.newContext({ geolocation: { ...SITE, accuracy: 10 }, permissions: ['geolocation'] });
  const page = await owner.newPage();
  await signIn(page, 'developer', 'developer123');
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();

  await page.getByRole('link', { name: 'Companies' }).first().click();
  await page.getByRole('button', { name: 'New company' }).click();
  await page.getByLabel('Company name').fill('Test Builders');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name: 'Test Builders' })).toBeVisible();

  await page.getByRole('button', { name: 'Add workplace' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('Main warehouse').fill('Test Yard');
  await dialog.getByRole('button', { name: /I’m here/ }).click();
  await expect(dialog.getByText(/51\.50/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Test Yard', { exact: true }).first()).toBeVisible();

  await page.getByRole('tab', { name: 'People' }).click();
  await page.getByRole('button', { name: 'Add worker' }).click();
  const person = page.getByRole('dialog');
  await person.getByLabel('Full name').fill('Nadia Test');
  await person.getByLabel('Phone number').fill('+44 7700 900999');
  await person.getByRole('button', { name: 'Create account' }).click();
  const creds = page.getByRole('dialog', { name: 'Login details' });
  await expect(creds).toBeVisible();
  const values = await creds.locator('.font-mono').allTextContents();
  const [username, password] = values;
  expect(username).toBe('nadia.test');
  expect(password).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  await creds.getByRole('button', { name: 'Done' }).click();
  await owner.close();

  // The new worker signs in on their phone at the new workplace and checks in.
  const phone = await phoneContext(browser, NEAR_SITE);
  const workerPage = await phone.newPage();
  await signIn(workerPage, username!, password!);
  await workerPage.getByRole('button', { name: 'Check in' }).click({ timeout: 15_000 });
  await workerPage.getByRole('button', { name: 'Take photo' }).click({ timeout: 15_000 });
  await expect(workerPage.getByRole('heading', { name: 'Checked in' })).toBeVisible({ timeout: 20_000 });
  await phone.close();
});

test('a worker far away is refused and can ask the manager instead', async ({ browser }) => {
  // A new worker in the demo company, created through the owner API.
  const owner = await browser.newContext();
  const api = owner.request;
  await api.post('/api/auth/login', {
    headers: { 'x-requested-with': 'onsite' },
    data: { username: 'developer', password: 'developer123' },
  });
  const companies = await (await api.get('/api/dev/companies')).json();
  const demo = companies.find((c: { name: string }) => c.name === 'Demo Construction Co.');
  const created = await (
    await api.post('/api/dev/users', {
      headers: { 'x-requested-with': 'onsite' },
      data: { role: 'worker', companyId: demo.id, username: 'far.away', fullName: 'Far Away', password: 'far-away-123' },
    })
  ).json();
  expect(created.user.username).toBe('far.away');
  await owner.close();

  const phone = await phoneContext(browser, FAR_AWAY);
  const page = await phone.newPage();
  await signIn(page, 'far.away', 'far-away-123');
  await page.getByRole('button', { name: 'Check in' }).click({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Take photo' }).click({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Not checked in' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/km away from|m away from/)).toBeVisible();

  await page.getByRole('button', { name: 'Ask manager to accept' }).click();
  await page.getByPlaceholder(/working at the customer/).fill('Delivering materials to the client');
  await page.getByRole('button', { name: 'Send to manager' }).click();
  await expect(page.getByRole('heading', { name: 'Checked in' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Your manager will confirm this check-in.')).toBeVisible();
  await phone.close();

  // The manager sees the request and accepts it.
  const manager = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const mpage = await manager.newPage();
  await signIn(mpage, 'demo.manager', 'manager123');
  await mpage.getByRole('link', { name: /^Requests/ }).first().click();
  const card = mpage.locator('div', { hasText: 'Delivering materials to the client' }).last();
  await expect(card).toBeVisible();
  await mpage.getByRole('button', { name: 'Accept' }).first().click();
  await expect(mpage.getByText('Accepted')).toBeVisible();
  await manager.close();
});

test('manager sees who has not arrived and can call them', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await signIn(page, 'demo.manager', 'manager123');
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  const priya = page.getByRole('button', { name: /Priya Shah/ });
  await expect(priya).toBeVisible();
  await expect(page.getByRole('link', { name: 'Call Priya Shah' })).toHaveAttribute('href', /^tel:\+4477009001/);
  await priya.click();
  await expect(page.getByRole('link', { name: /Call \+44/ })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('link', { name: /^Requests/ }).click();
  await expect(page.getByText('Redmi Note 13 · Chrome')).toBeVisible();
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Phone approved')).toBeVisible();
  await context.close();
});
