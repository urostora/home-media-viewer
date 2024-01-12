/**
 * @jest-environment puppeteer
 */

import type { Page } from 'puppeteer';

describe('web/pages/login/loginWithCorrectUser', () => {
  let page: Page;

  beforeAll(async () => {
    page = await browser.newPage();
    await page.goto(process.env.APP_URL ?? '', { timeout: 5_000 });
    await page.waitForSelector('input[type="text"][name="email"]', { timeout: 5_000 });
  });

  it('should refuse login with correct user', async () => {
    const correctUserEmail = process.env.ADMIN_EMAIL ?? '';
    const correctUserPassword = process.env.ADMIN_PASSWORD ?? '';

    await page.type('input[type="text"][name="email"]', correctUserEmail);
    await page.type('input[type="password"][name="password"]', correctUserPassword);

    await Promise.all([page.waitForSelector('span[class*="hmv_userName"]'), page.click('input[type="submit"]')]);
  });

  afterAll(async () => {
    await page?.close();
  });
});
