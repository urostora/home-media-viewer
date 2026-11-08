/** @jest-environment puppeteer */
import type { Page } from 'puppeteer';
import { getPage } from '../helpers/webHelper.helper';
import { selectors } from '../helpers/webSelectors.helper';

describe('responsive album navigation', () => {
    let desktop: Page;
    let mobile: Page;
    beforeAll(async () => {
        desktop = await getPage();
        mobile = await getPage({ desktop: false });
    }, 30_000);
    afterAll(async () => {
        await desktop?.close();
        await mobile?.close();
    });

    it('shows branding, identity, theme switch, and albums on desktop', async () => {
        expect(await desktop.$eval(`${selectors.main.title.container} a`, (node) => node.getAttribute('href'))).toBe(
            '/',
        );
        expect(await desktop.$eval(selectors.main.user.userName, (node) => node.textContent?.length)).toBeGreaterThan(
            0,
        );
        expect(await desktop.$eval('[role="switch"]', (node) => node.getAttribute('aria-label'))).toBe('Dark mode');
        const names = await desktop.$$eval(selectors.contents.cardName, (nodes) =>
            nodes.map((node) => node.textContent),
        );
        expect(names).toEqual(expect.arrayContaining(['album01', 'album02']));
        expect(await desktop.$eval('a[href="/album"][aria-current]', (node) => node.getAttribute('aria-current'))).toBe(
            'page',
        );
    });

    it('opens mobile navigation by keyboard and closes with Escape', async () => {
        const toggle = `${selectors.main.menu.container} button[aria-controls]`;
        expect(await mobile.$eval(toggle, (node) => node.getAttribute('aria-expanded'))).toBe('false');
        await mobile.focus(toggle);
        await mobile.keyboard.press('Enter');
        expect(await mobile.$eval(toggle, (node) => node.getAttribute('aria-expanded'))).toBe('true');
        await mobile.keyboard.press('Tab');
        await mobile.keyboard.press('Escape');
        expect(await mobile.$eval(toggle, (node) => node.getAttribute('aria-expanded'))).toBe('false');
        expect(await mobile.$eval(toggle, (node) => node === document.activeElement)).toBe(true);
    });

    it('fits the mobile viewport and persists an explicit theme across reload', async () => {
        expect(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const before = await mobile.$eval('[role="switch"]', (node) => node.getAttribute('aria-checked'));
        await mobile.click('[role="switch"]');
        const after = before === 'true' ? 'false' : 'true';
        expect(await mobile.$eval('[role="switch"]', (node) => node.getAttribute('aria-checked'))).toBe(after);
        await mobile.reload({ waitUntil: 'networkidle0' });
        await mobile.waitForSelector('[role="switch"]');
        expect(await mobile.$eval('[role="switch"]', (node) => node.getAttribute('aria-checked'))).toBe(after);
    });
});
