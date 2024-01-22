/**
 * @jest-environment puppeteer
 */

import type { Page } from 'puppeteer';

import { getPage } from '../helpers/webHelper.helper';
import { selectors } from '../helpers/webSelectors.helper';

describe('web/pages/login/elements', () => {
  let desktopLoginPage: Page;
  let mobileLoginPage: Page;

  beforeAll(async () => {
    desktopLoginPage = await getPage({ isLoggedIn: false });
    mobileLoginPage = await getPage({ isLoggedIn: false, desktop: false });
  });

  describe('desktop', () => {
    it('should be titled "Home Media Viewer"', async () => {
      await expect(desktopLoginPage.title()).resolves.toMatch('Home Media Viewer');
    });

    it('E-mail field exists', async () => {
      const usernameInput = await desktopLoginPage.$(selectors.login.emailInput);

      expect(usernameInput).not.toBeNull();

      if (usernameInput === null) {
        return;
      }

      expect(await usernameInput.isVisible()).toBe(true);

      const requiredProperty = await usernameInput.asElement()?.getProperty('required');
      const requiredPropertyValue = await requiredProperty?.jsonValue();

      expect(requiredPropertyValue).toEqual(true);

      const label = await usernameInput.evaluateHandle((el) => el.previousSibling, usernameInput, { timeout: 1000 });

      expect(label?.asElement()).not.toBeNull();

      const labelHtmlProperty = await label?.asElement()?.getProperty('innerHTML');
      const labelText = await labelHtmlProperty?.jsonValue();

      expect(labelText).toEqual('E-mail');
    });

    it('Password field exists', async () => {
      const passwordInput = await desktopLoginPage.$(selectors.login.passwordInput);

      expect(passwordInput).not.toBeNull();

      if (passwordInput === null) {
        return;
      }

      expect(await passwordInput.isVisible()).toBe(true);

      const requiredProperty = await passwordInput.asElement()?.getProperty('required');
      const requiredPropertyValue = await requiredProperty?.jsonValue();

      expect(requiredPropertyValue).toEqual(true);

      const label = await passwordInput.evaluateHandle((el) => el.previousSibling, passwordInput, { timeout: 1000 });

      expect(label?.asElement()).not.toBeNull();

      const labelHtmlProperty = await label?.asElement()?.getProperty('innerHTML');
      const labelText = await labelHtmlProperty?.jsonValue();

      expect(labelText).toEqual('Password');
    });

    it('Login button exists', async () => {
      const expectedTitle = 'Log in';
      const loginButton = await desktopLoginPage.$(selectors.login.loginSubmitButton);

      expect(loginButton).not.toBeNull();

      if (loginButton === null) {
        return;
      }

      expect(await loginButton.isVisible()).toBe(true);

      const loginButtonValue: string | null = await loginButton.evaluate((btn) =>
        'value' in btn ? (btn.value as string) : null,
      );
      expect(loginButtonValue).toBe(expectedTitle);
    });
  });

  describe('mobile', () => {
    it('should be titled "Home Media Viewer"', async () => {
      await expect(mobileLoginPage.title()).resolves.toMatch('Home Media Viewer');
    });

    it('E-mail field exists', async () => {
      const usernameInput = await mobileLoginPage.$(selectors.login.emailInput);

      expect(usernameInput).not.toBeNull();

      if (usernameInput === null) {
        return;
      }

      const requiredProperty = await usernameInput.asElement()?.getProperty('required');
      const requiredPropertyValue = await requiredProperty?.jsonValue();

      expect(requiredPropertyValue).toEqual(true);

      const label = await usernameInput.evaluateHandle((el) => el.previousSibling, usernameInput, { timeout: 1000 });

      expect(label?.asElement()).not.toBeNull();

      const labelHtmlProperty = await label?.asElement()?.getProperty('innerHTML');
      const labelText = await labelHtmlProperty?.jsonValue();

      expect(labelText).toEqual('E-mail');
    });

    it('Password field exists', async () => {
      const passwordInput = await mobileLoginPage.$(selectors.login.passwordInput);

      expect(passwordInput).not.toBeNull();

      const requiredProperty = await passwordInput?.asElement()?.getProperty('required');
      const requiredPropertyValue = await requiredProperty?.jsonValue();

      expect(requiredPropertyValue).toEqual(true);

      const label = await passwordInput?.evaluateHandle((el) => el.previousSibling, passwordInput, { timeout: 1000 });

      expect(label?.asElement()).not.toBeNull();

      const labelHtmlProperty = await label?.asElement()?.getProperty('innerHTML');
      const labelText = await labelHtmlProperty?.jsonValue();

      expect(labelText).toEqual('Password');
    });

    it('Login button exists', async () => {
      const loginButton = await mobileLoginPage.$(selectors.login.loginSubmitButton);

      expect(loginButton).not.toBeNull();

      if (loginButton === null) {
        return;
      }

      const loginButtonValue: string | null = await loginButton.evaluate((btn) =>
        'value' in btn ? (btn.value as string) : null,
      );
      expect(loginButtonValue).toBe('Log in');
    });
  });

  afterAll(async () => {
    await desktopLoginPage?.close();
    await mobileLoginPage?.close();
  });
});
