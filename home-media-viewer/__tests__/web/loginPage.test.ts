/**
 * @jest-environment puppeteer
 */

import type { Page, Browser } from 'puppeteer';

describe('HMV Login page', () => {
  let testPage: Page;

  beforeAll(async () => {
    testPage = await browser.newPage();
    await testPage.goto(process.env.APP_URL ?? '', { timeout: 20_000 });
    await testPage.waitForSelector('input[type="text"][name=email]', { timeout: 10_000 });
  });

  it('should be titled "Home Media Viewer"', async () => {
    await expect(testPage.title()).resolves.toMatch('Home Media Viewer');
  });

  it('Username fields', async () => {
    const usernameInput = await testPage.waitForSelector('input[type="text"][name=email]', { timeout: 5000 });

    expect(usernameInput).not.toBeNull();

    const requiredProperty = await usernameInput?.asElement()?.getProperty('required');
    const requiredPropertyValue = await requiredProperty?.jsonValue();

    expect(requiredPropertyValue).toEqual(true);

    const label = await usernameInput?.evaluateHandle(el => el.previousSibling, usernameInput, { timeout: 5000 });

    expect(label?.asElement()).not.toBeNull();

    const labelHtmlProperty = await label?.asElement()?.getProperty('innerHTML');
    const labelText = await labelHtmlProperty?.jsonValue();

    expect(labelText).toEqual('Username');
  }, 15_000);

  it('Password fields', async () => {
    const passwordInput = await testPage.waitForSelector('input[type="password"][name=password]', { timeout: 5000 });

    expect(passwordInput).not.toBeNull();
    
    const requiredProperty = await passwordInput?.asElement()?.getProperty('required');
    const requiredPropertyValue = await requiredProperty?.jsonValue();

    expect(requiredPropertyValue).toEqual(true);

    const label = await passwordInput?.evaluateHandle(el => el.previousSibling, passwordInput, { timeout: 5000 });

    expect(label?.asElement()).not.toBeNull();

    const labelHtmlProperty = await label?.asElement()?.getProperty('innerHTML');
    const labelText = await labelHtmlProperty?.jsonValue();

    expect(labelText).toEqual('Password');
  }, 15_000);

  afterAll(async () => { await testPage?.close(); });
});