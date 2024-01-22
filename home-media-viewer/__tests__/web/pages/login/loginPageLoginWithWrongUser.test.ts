/**
 * @jest-environment puppeteer
 */

import type { Page } from 'puppeteer';

import { getPage } from '../helpers/webHelper.helper';
import { selectors } from '../helpers/webSelectors.helper';

describe('web/pages/login/loginWithWrongUser', () => {
  let page: Page;

  beforeAll(async () => {
    page = await getPage({ isLoggedIn: false });
  });

  it('should refuse login with fake user', async () => {
    const fakeUserEmail = 'qwer@qwer.com';
    const fakeUserPassword = '12341234wertQWER';

    // console.log(await page.content());

    await page.type(selectors.login.emailInput, fakeUserEmail);
    await page.type(selectors.login.passwordInput, fakeUserPassword);

    await Promise.all([
      // Wait for navigation to complete
      page.waitForSelector(selectors.general.errorMessage, { timeout: 5000 }),
      page.click(selectors.login.loginSubmitButton),
    ]);

    const errorMessageElement = await page.waitForSelector(selectors.general.errorMessage, { timeout: 5000 });
    expect(await errorMessageElement?.isVisible()).toBe(true);
  });

  afterAll(async () => {
    await page?.close();
  });
});
