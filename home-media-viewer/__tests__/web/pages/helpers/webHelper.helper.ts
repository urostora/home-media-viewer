/**
 * @jest-environment puppeteer
 */

import type { Page, Viewport } from 'puppeteer';

const DESKTOP_VIEWPORT: Viewport = {
  width: 1920,
  height: 1080,
};

const MOBILE_VIEWPORT: Viewport = {
  width: 390,
  height: 852,
};

export const getLoggedInPage = async (desktop: boolean = true): Promise<Page> => {
  const page: Page = await browser.newPage();

  await page.goto(process.env.APP_URL ?? '', { timeout: 5_000 });

  if ((await page.$('span[class*="hmv_userName"]')) === null) {
    await page.type('input[type="text"][name="email"]', process.env.ADMIN_EMAIL ?? '');
    await page.type('input[type="password"][name="password"]', process.env.ADMIN_PASSWORD ?? '');

    await Promise.all([page.waitForSelector('span[class*="hmv_userName"]'), page.click('input[type="submit"]')]);
  }

  await page.setViewport(desktop ? DESKTOP_VIEWPORT : MOBILE_VIEWPORT);

  return page;
};
