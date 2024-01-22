/**
 * @jest-environment puppeteer
 */

import type { Page } from 'puppeteer';

import { getPage } from '../helpers/webHelper.helper';
import { selectors } from '../helpers/webSelectors.helper';

describe('web/pages/login/loginWithCorrectUser', () => {
  let page: Page;

  beforeAll(async () => {
    page = await getPage({ isLoggedIn: false });
  }, 15_000);

  it('should refuse login with correct user', async () => {
    const correctUserEmail = process.env.ADMIN_EMAIL ?? '';
    const correctUserPassword = process.env.ADMIN_PASSWORD ?? '';

    await page.type(selectors.login.emailInput, correctUserEmail);
    await page.type(selectors.login.passwordInput, correctUserPassword);

    await Promise.all([
      page.waitForSelector(selectors.main.user.userName),
      page.click(selectors.login.loginSubmitButton),
    ]);
  });

  afterAll(async () => {
    await page?.close();
  });
});
