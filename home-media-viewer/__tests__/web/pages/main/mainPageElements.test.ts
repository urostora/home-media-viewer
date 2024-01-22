/**
 * @jest-environment puppeteer
 */

import type { Page, ElementHandle } from 'puppeteer';

import { getPage } from '../helpers/webHelper.helper';
import { selectors } from '../helpers/webSelectors.helper';

describe('web/pages/main/elements', () => {
  let desktopPage: Page;
  let mobilePage: Page;

  beforeAll(async () => {
    desktopPage = await getPage();
    mobilePage = await getPage({ desktop: false });
  }, 15_000);

  describe('desktop user area', () => {
    it('should have user area with name and logout button', async () => {
      const userHeader = await desktopPage.$(selectors.main.user.userHeaderContainer);

      expect(userHeader).not.toBeNull();

      if (userHeader === null) {
        return;
      }

      const userNameSpan = await userHeader.$(selectors.main.user.userName);
      const logoutButton = await userHeader.$('button');

      expect(await userNameSpan?.isVisible()).toBe(true);
      expect(await logoutButton?.isVisible()).toBe(true);
    });
  });

  describe('desktop title', () => {
    let titleLink: ElementHandle<HTMLAnchorElement> | undefined;
    let titleLinkMobile: ElementHandle<HTMLAnchorElement> | undefined;

    beforeAll(async () => {
      const titleHeader = await desktopPage.$(selectors.main.title.container);

      expect(titleHeader).not.toBeNull();

      const titleLinks = (await titleHeader?.$$(selectors.main.title.titleText)) as Array<
        ElementHandle<HTMLAnchorElement>
      >;
      expect(titleLinks?.length).toBe(2);

      for (const linkHandler of titleLinks ?? []) {
        if (await linkHandler.evaluate((link) => link.className.includes('titleMobile'))) {
          titleLinkMobile = linkHandler;
        } else {
          titleLink = linkHandler;
        }
      }

      expect(titleLink).not.toBeUndefined();
      expect(titleLinkMobile).not.toBeUndefined();
    });

    it('should have visible desktop title and invisible mobile title', async () => {
      expect(await titleLink?.isVisible()).toBe(true);
      expect(await titleLinkMobile?.isVisible()).toBe(false);
    });

    it('should navigate to index page', async () => {
      expect(await titleLink?.evaluate((l) => l.href)).toBe(`${process.env.APP_URL}/`);
    });

    it('should have expected text', async () => {
      const expectedTitle = 'Home media viewer';
      const titleText = await titleLink?.evaluate((l) => l.innerText);

      expect(titleText).toBe(expectedTitle);
    });
  });

  describe('desktop menu', () => {
    let menuContainer: ElementHandle<Element> | null;
    let menuToggle: ElementHandle<Element> | null;
    let menuElementsContainer: ElementHandle<Element> | null;

    beforeAll(async () => {
      menuContainer = await desktopPage.$(selectors.main.menu.container);

      expect(menuContainer).not.toBeUndefined();
      expect(menuContainer).not.toBeNull();

      if (menuContainer === null) {
        return;
      }

      menuToggle = await menuContainer.$(selectors.main.menu.toggle);
      menuElementsContainer = await menuContainer.$(selectors.main.menu.elementsContainer);

      expect(menuToggle).not.toBeNull();
      expect(menuElementsContainer).not.toBeNull();
    });

    it('main menu toggle should not be visible', async () => {
      expect(await menuToggle?.isVisible()).toBe(false);
    });

    it('main menu elements should be visible', async () => {
      expect(await menuElementsContainer?.isVisible()).toBe(true);
    });

    it('main menu elements should be visible', async () => {
      const menuElements = await menuContainer?.$$(selectors.main.menu.elements);

      expect(menuElements).not.toBeUndefined();

      if (menuElements === undefined) {
        return;
      }

      expect(menuElements?.length).toBeGreaterThan(0);

      for (const menuElement of menuElements) {
        expect(await menuElement.isVisible()).toBe(true);
      }
    });
  });

  describe('desktop navigation bar', () => {
    let navigationBar: ElementHandle<Element> | null = null;

    beforeAll(async () => {
      navigationBar = await desktopPage.waitForSelector(selectors.main.navigation.container);
      expect(navigationBar).not.toBeNull();
    });

    it('navigation bar elements should be visible', async () => {
      const navigationBarElements = await navigationBar?.$$('select, a');

      expect(Array.isArray(navigationBarElements)).toBe(true);

      if (!Array.isArray(navigationBarElements)) {
        return;
      }

      for (const element of navigationBarElements) {
        expect(await element.isVisible()).toBe(true);
      }
    });
  });

  describe('desktop album list', () => {
    let contentListContainer: ElementHandle<Element> | null = null;
    let contentCards: Array<ElementHandle<Element>>;

    beforeAll(async () => {
      contentListContainer = await desktopPage.waitForSelector(selectors.contents.container);
      expect(contentListContainer).not.toBeNull();

      if (contentListContainer === undefined || contentListContainer === null) {
        throw Error('Content list container not found');
      }

      contentCards = await contentListContainer.$$(selectors.contents.card);
    });

    it('has album content cards', async () => {
      expect(contentCards.length).toBeGreaterThan(0);
    });

    it('test albums should be visible', async () => {
      const expectedAlbumNames = ['album01', 'album02'];
      const visibleAlbumNames: string[] = [];

      for (const card of contentCards) {
        if (!(await card.isVisible())) {
          continue;
        }

        const albumName = await card.$eval(selectors.contents.cardName, (node) =>
          'innerText' in node ? node.innerText : null,
        );
        if (typeof albumName === 'string') {
          visibleAlbumNames.push(albumName);
        }
      }

      for (const expectedAlbumName of expectedAlbumNames) {
        const foundAlbumName = visibleAlbumNames.find((name) => name === expectedAlbumName);
        expect(foundAlbumName).toBe(expectedAlbumName);
      }
    });
  });

  describe('mobile user area', () => {
    it('should have user area with name and logout button', async () => {
      const userHeader = await mobilePage.$(selectors.main.user.userHeaderContainer);

      expect(userHeader).not.toBeNull();

      if (userHeader === null) {
        return;
      }

      const userNameSpan = await userHeader.$(selectors.main.user.userName);
      const logoutButton = await userHeader.$('button');

      expect(await userNameSpan?.isVisible()).toBe(true);
      expect(await logoutButton?.isVisible()).toBe(true);
    });
  });

  describe('mobile title', () => {
    let titleLink: ElementHandle<HTMLAnchorElement> | undefined;
    let titleLinkMobile: ElementHandle<HTMLAnchorElement> | undefined;

    beforeAll(async () => {
      const titleHeader = await mobilePage.$(selectors.main.title.container);

      expect(titleHeader).not.toBeNull();

      const titleLinks = (await titleHeader?.$$(selectors.main.title.titleText)) as Array<
        ElementHandle<HTMLAnchorElement>
      >;
      expect(titleLinks?.length).toBe(2);

      for (const linkHandler of titleLinks ?? []) {
        if (await linkHandler.evaluate((link) => link.className.includes('titleMobile'))) {
          titleLinkMobile = linkHandler;
        } else {
          titleLink = linkHandler;
        }
      }

      expect(titleLink).not.toBeUndefined();
      expect(titleLinkMobile).not.toBeUndefined();
    });

    it('should have visible mobile title and invisible desktop title', async () => {
      expect(await titleLink?.isVisible()).toBe(false);
      expect(await titleLinkMobile?.isVisible()).toBe(true);
    });

    it('should navigate to index page', async () => {
      expect(await titleLinkMobile?.evaluate((l) => l.href)).toBe(`${process.env.APP_URL}/`);
    });

    it('should have expected text', async () => {
      const expectedTitle = 'HMV';
      const titleText = await titleLinkMobile?.evaluate((l) => l.innerText);

      expect(titleText).toBe(expectedTitle);
    });
  });

  describe('mobile menu', () => {
    let menuContainer: ElementHandle<Element> | null;
    let menuToggle: ElementHandle<Element> | null;
    let menuElementsContainer: ElementHandle<Element> | null;

    beforeAll(async () => {
      menuContainer = await mobilePage.$(selectors.main.menu.container);

      expect(menuContainer).not.toBeUndefined();
      expect(menuContainer).not.toBeNull();

      if (menuContainer === null) {
        return;
      }

      menuToggle = await menuContainer.$(selectors.main.menu.toggle);
      menuElementsContainer = await menuContainer.$(selectors.main.menu.elementsContainer);

      expect(menuToggle).not.toBeNull();
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

      const menuElements = await menuContainer?.$$(selectors.main.menu.elements);

      expect(menuElements).not.toBeUndefined();

      if (menuElements === undefined) {
        return;
      }

      expect(menuElements?.length).toBeGreaterThan(0);

      for (const menuElement of menuElements) {
        expect(await menuElement.isVisible()).toBe(true);
      }
    });
  });

  describe('mobile navigation bar', () => {
    let navigationBar: ElementHandle<Element> | null = null;

    beforeAll(async () => {
      navigationBar = await mobilePage.waitForSelector(selectors.main.navigation.container);
      expect(navigationBar).not.toBeNull();
    });

    it('navigation bar elements should be visible', async () => {
      const navigationBarElements = await navigationBar?.$$('select, a');

      expect(Array.isArray(navigationBarElements)).toBe(true);

      if (!Array.isArray(navigationBarElements)) {
        return;
      }

      for (const element of navigationBarElements) {
        expect(await element.isVisible()).toBe(true);
      }
    });
  });

  describe('mobile album list', () => {
    let contentListContainer: ElementHandle<Element> | null = null;
    let contentCards: Array<ElementHandle<Element>>;

    beforeAll(async () => {
      contentListContainer = await mobilePage.waitForSelector(selectors.contents.container);
      expect(contentListContainer).not.toBeNull();

      if (contentListContainer === undefined || contentListContainer === null) {
        throw Error('Content list container not found');
      }

      contentCards = await contentListContainer.$$(selectors.contents.card);
    });

    it('has album content cards', async () => {
      expect(contentCards.length).toBeGreaterThan(0);
    });

    it('test albums should be visible', async () => {
      const expectedAlbumNames = ['album01', 'album02'];
      const visibleAlbumNames: string[] = [];

      for (const card of contentCards) {
        if (!(await card.isVisible())) {
          continue;
        }

        const albumName = await card.$eval(selectors.contents.cardName, (node) =>
          'innerText' in node ? node.innerText : null,
        );
        if (typeof albumName === 'string') {
          visibleAlbumNames.push(albumName);
        }
      }

      for (const expectedAlbumName of expectedAlbumNames) {
        expect(visibleAlbumNames.includes(expectedAlbumName)).toBe(true);
      }
    });
  });

  afterAll(async () => {
    await desktopPage?.close();
    await mobilePage?.close();
  });
});
