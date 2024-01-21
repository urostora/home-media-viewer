/**
 * @jest-environment puppeteer
 */

import type { Page, ElementHandle } from 'puppeteer';

import { getPage } from '../helpers/webHelper.helper';

describe('web/pages/main/elements', () => {
  let desktopPage: Page;
  let mobilePage: Page;

  beforeAll(async () => {
    desktopPage = await getPage();
    mobilePage = await getPage({ desktop: false });
  });

  it('should have user area with name and logout button', async () => {
    const userHeader = await desktopPage.waitForSelector('div[class*="userHeaderContainer"]');

    const userNameSpan = await userHeader?.waitForSelector('span[class*="userName"]');
    const logoutButton = await userHeader?.waitForSelector('button');

    expect(await userNameSpan?.isVisible()).toBeTruthy();
    expect(await logoutButton?.isVisible()).toBeTruthy();
  });

  describe('desktop title', () => {
    let titleLink: ElementHandle<HTMLAnchorElement> | undefined;
    let titleLinkMobile: ElementHandle<HTMLAnchorElement> | undefined;

    beforeAll(async () => {
      const titleHeader = await desktopPage.waitForSelector('div[class*="titleArea"]');

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

  describe('desktop menu', () => {
    let menuContainer: ElementHandle<HTMLDivElement> | null;
    let menuToggle: ElementHandle<HTMLDivElement> | null;
    let menuElementsContainer: ElementHandle<HTMLDivElement> | null;

    beforeAll(async () => {
      menuContainer = await desktopPage.waitForSelector('div[class*="hmv_mainMenu"]', { timeout: 5000 });

      expect(menuContainer).not.toBeUndefined();
      expect(menuContainer).not.toBeNull();

      if (menuContainer === null) {
        return;
      }

      menuToggle = await menuContainer.waitForSelector('div[class*="hmv_mainMenuToggle"]', { timeout: 5000 });
      menuElementsContainer = await menuContainer.waitForSelector('div[class*="hmv_mainMenuElements"]', {
        timeout: 1000,
      });

      expect(menuToggle).not.toBeUndefined();
      expect(menuToggle).not.toBeNull();

      expect(menuElementsContainer).not.toBeUndefined();
      expect(menuElementsContainer).not.toBeNull();
    });

    it('main menu toggle should not be visible', async () => {
      expect(await menuToggle?.isVisible()).toBe(false);
    });

    it('main menu elements should be visible', async () => {
      expect(await menuElementsContainer?.isVisible()).toBe(true);
    });

    it('main menu elements should be visible', async () => {
      const menuElements = await menuContainer?.$$('div[class*="hmv_linkItem"]');

      expect(menuElements).not.toBeUndefined();

      if (menuElements === undefined) {
        return;
      }

      expect(menuElements?.length).toBeGreaterThan(0);

      for (const menuElement of menuElements) {
        expect(await menuElement.isVisible()).toBeTruthy();
      }
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

  describe('mobile menu', () => {
    let menuContainer: ElementHandle<HTMLDivElement> | null;
    let menuToggle: ElementHandle<HTMLDivElement> | null;
    let menuElementsContainer: ElementHandle<HTMLDivElement> | null;

    beforeAll(async () => {
      menuContainer = await mobilePage.waitForSelector('div[class*="hmv_mainMenu"]', { timeout: 5000 });

      expect(menuContainer).not.toBeUndefined();
      expect(menuContainer).not.toBeNull();

      if (menuContainer === null) {
        return;
      }

      menuToggle = await menuContainer.waitForSelector('div[class*="hmv_mainMenuToggle"]', { timeout: 5000 });
      menuElementsContainer = await menuContainer.waitForSelector('div[class*="hmv_mainMenuElements"]', {
        timeout: 1000,
      });

      expect(menuToggle).not.toBeUndefined();
      expect(menuToggle).not.toBeNull();

      expect(menuElementsContainer).not.toBeUndefined();
      expect(menuElementsContainer).not.toBeNull();
    });

    it('main menu toggle should be visible', async () => {
      expect(await menuToggle?.isVisible()).toBe(true);
    });

    it('main menu elements should not be visible', async () => {
      expect(await menuElementsContainer?.isVisible()).toBe(false);
    });

    it('main menu elements should be visible after click to menu toggle', async () => {
      await menuToggle?.click();

      expect(await menuElementsContainer?.isVisible()).toBe(true);

      const menuElements = await menuContainer?.$$('div[class*="hmv_linkItem"]');

      expect(menuElements).not.toBeUndefined();

      if (menuElements === undefined) {
        return;
      }

      expect(menuElements?.length).toBeGreaterThan(0);

      for (const menuElement of menuElements) {
        expect(await menuElement.isVisible()).toBeTruthy();
      }
    });
  });

  afterAll(async () => {
    await desktopPage?.close();
    await mobilePage?.close();
  });
});
