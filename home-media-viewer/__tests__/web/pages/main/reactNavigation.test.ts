/**
 * @jest-environment puppeteer
 */
import type { Page } from 'puppeteer';
import { selectors } from '../helpers/webSelectors.helper';

describe('React hydration and map navigation', () => {
  let testPage: Page;
  afterAll(async () => {
    await testPage?.close();
  });

  it('hydrates, logs in and navigates through the location search without React errors', async () => {
    testPage = await browser.newPage();
    const pageErrors: string[] = [];
    const reactWarnings: string[] = [];
    testPage.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });
    testPage.on('console', (message) => {
      if (
        ['error', 'warn'].includes(message.type()) &&
        /hydrati|did not match|Invalid prop|React does not recognize|outdated JSX transform|not wrapped in act/i.test(
          message.text(),
        )
      ) {
        reactWarnings.push(message.text());
      }
    });
    await testPage.goto(process.env.APP_URL ?? '', { waitUntil: 'networkidle0' });
    if ((await testPage.$(selectors.login.emailInput)) !== null) {
      await testPage.type(selectors.login.emailInput, process.env.ADMIN_EMAIL ?? '');
      await testPage.type(selectors.login.passwordInput, process.env.ADMIN_PASSWORD ?? '');
      await testPage.click(selectors.login.loginSubmitButton);
    }
    await testPage.waitForSelector(selectors.main.user.userName);
    await testPage.click('a[href="/search"]');
    await testPage.waitForSelector('div[class*="mapCenter"]');
    await testPage.click('span[class*="filterOpenToggle"]');
    await testPage.waitForSelector('input[name="isLocationFilterEnabled"]', { visible: true });
    await testPage.click('input[name="isLocationFilterEnabled"]');
    await testPage.click('input[value="Apply filters"]');
    await testPage.click('a[href="/album"]');
    await testPage.waitForSelector(selectors.contents.card);
    expect(pageErrors).toEqual([]);
    expect(reactWarnings).toEqual([]);
  }, 30_000);
});
