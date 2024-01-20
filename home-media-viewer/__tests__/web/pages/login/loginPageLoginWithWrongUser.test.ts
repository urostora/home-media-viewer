/**
 * @jest-environment puppeteer
 */

import type { Page } from 'puppeteer';

import { getPage } from '../helpers/webHelper.helper';

describe('web/pages/login/loginWithWrongUser', () => {
  let page: Page;

  beforeAll(async () => {
    page = await getPage({ isLoggedIn: false });
  });

  it('should refuse login with fake user', async () => {
    const fakeUserEmail = 'qwer@qwer.com';
    const fakeUserPassword = '12341234wertQWER';

    // console.log(await page.content());

    await page.type('input[type="text"][name="email"]', fakeUserEmail);
    await page.type('input[type="password"][name="password"]', fakeUserPassword);

    await Promise.all([
      // Wait for navigation to complete
      page.waitForSelector('div[class*="errorMessage"]', { timeout: 5000 }),
      page.click('input[type="submit"]'),
    ]);

    const errorMessageElement = await page.waitForSelector('div[class*="errorMessage"]', { timeout: 5000 });
    expect(await errorMessageElement?.isVisible()).toBeTruthy();
  });

  afterAll(async () => {
    await page?.close();
  });
});
