/**
 * @jest-environment puppeteer
 */

import type { Page, Viewport } from 'puppeteer';
import { selectors } from './webSelectors.helper';

export interface LoggedInPageOptionsType {
  /**
   * Default: true. Sets viewport to desktop or mobile size (true: 1920x1080, false: 390x852)
   * Setting of exact 'viewportWidth' and 'viewportHeight' property overrides this setting
   */
  desktop?: boolean;
  /** Set exact viewport width (overrides desktop property) */
  viewportWidth?: number;
  /** Set exact viewport height (overrides desktop property) */
  viewportHeight?: number;
  /** Navigate page to this url relative to app base url. Example: '/albums'. Defaults to '/' */
  url?: string;
  /** Log in with a user. Default: true */
  isLoggedIn?: boolean;
}

const DESKTOP_VIEWPORT: Viewport = {
  width: 1920,
  height: 1080,
};

const MOBILE_VIEWPORT: Viewport = {
  width: 390,
  height: 852,
};

export const getPage = async (options: LoggedInPageOptionsType = {}): Promise<Page> => {
  const page: Page = await browser.newPage();

  await page.goto((process.env.APP_URL ?? '') + (options.url ?? '/'), { waitUntil: 'networkidle0', timeout: 10_000 });

  const loggedInUserNameElement = await page.$(selectors.main.user.userName);

  const mustBeLoggedIn = options.isLoggedIn ?? true;
  if (mustBeLoggedIn && loggedInUserNameElement === null) {
    // Log in
    await page.type(selectors.login.emailInput, process.env.ADMIN_EMAIL ?? '');
    await page.type(selectors.login.passwordInput, process.env.ADMIN_PASSWORD ?? '');

    await Promise.all([
      page.waitForSelector(selectors.main.user.userName),
      page.click(selectors.login.loginSubmitButton),
    ]);
  } else if (!mustBeLoggedIn && loggedInUserNameElement !== null) {
    // Log out
    await Promise.all([page.waitForSelector(selectors.login.emailInput), page.click(selectors.main.user.logoutButton)]);
  }

  // set viewport size
  if (typeof options?.viewportWidth === 'number' && typeof options.viewportHeight === 'number') {
    await page.setViewport({ width: options.viewportWidth, height: options.viewportHeight });
  } else {
    await page.setViewport(options.desktop ?? true ? DESKTOP_VIEWPORT : MOBILE_VIEWPORT);
  }

  return page;
};
