/**
 * @jest-environment puppeteer
 */

import type { Page, ElementHandle } from 'puppeteer';

import { getLoggedInPage } from '../helpers/webHelper.helper';

describe('web/pages/main/elements', () => {
  let page: Page;
  let mobilePage: Page;

  beforeAll(async () => {
    page = await getLoggedInPage();
    mobilePage = await getLoggedInPage(false);
  });

  it('should have user area with name and logout button', async () => {
    const userHeader = await page.waitForSelector('div[class*="userHeaderContainer"]');

    const userNameSpan = await userHeader?.waitForSelector('span[class*="userName"]');
    const logoutButton = await userHeader?.waitForSelector('button');

    expect(await userNameSpan?.isVisible()).toBeTruthy();
    expect(await logoutButton?.isVisible()).toBeTruthy();
  });

  describe('desktop title', () => {
    let titleLink: ElementHandle<HTMLAnchorElement> | undefined;
    let titleLinkMobile: ElementHandle<HTMLAnchorElement> | undefined;

    beforeAll(async () => {
      const titleHeader = await page.waitForSelector('div[class*="titleArea"]');

      const titleLinks = await titleHeader?.$$('a[class*="title"]');
      expect(titleLinks?.length).toBe(2);

      for (const linkHandler of titleLinks ?? []) {
        if (await linkHandler.evaluate((link) => !link.className.includes('titleMobile'))) {
          titleLink = linkHandler;
        } else {
          titleLinkMobile = linkHandler;
        }
      }

      expect(titleLink).not.toBeUndefined();
      expect(titleLinkMobile).not.toBeUndefined();
    });

    it('should have visible desktop title and invisible mobile title', async () => {
      expect(await titleLink?.isVisible()).toBeTruthy();
      expect(await titleLinkMobile?.isVisible()).toBeFalsy();
    });

    it('should navigate to index page', async () => {
      expect(await titleLink?.evaluate((l) => l.href)).toBe(`${process.env.APP_URL}/`);
    });
  });

  describe('mobile title', () => {
    let titleLink: ElementHandle<HTMLAnchorElement> | undefined;
    let titleLinkMobile: ElementHandle<HTMLAnchorElement> | undefined;

    beforeAll(async () => {
      const titleHeader = await mobilePage.waitForSelector('div[class*="titleArea"]');

      const titleLinks = await titleHeader?.$$('a[class*="title"]');
      expect(titleLinks?.length).toBe(2);

      for (const linkHandler of titleLinks ?? []) {
        if (await linkHandler.evaluate((link) => !link.className.includes('titleMobile'))) {
          titleLink = linkHandler;
        } else {
          titleLinkMobile = linkHandler;
        }
      }

      expect(titleLink).not.toBeUndefined();
      expect(titleLinkMobile).not.toBeUndefined();
    });

    it('should have visible mobile title and invisible desktop title', async () => {
      expect(await titleLink?.isVisible()).toBeFalsy();
      expect(await titleLinkMobile?.isVisible()).toBeTruthy();
    });

    it('should navigate to index page', async () => {
      expect(await titleLinkMobile?.evaluate((l) => l.href)).toBe(`${process.env.APP_URL}/`);
    });
  });

  afterAll(async () => {
    await page?.close();
    await mobilePage?.close();
  });
});
