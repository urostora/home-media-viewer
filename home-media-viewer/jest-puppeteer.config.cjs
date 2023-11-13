/** @type {import('jest-environment-puppeteer').JestPuppeteerConfig} */
module.exports = {
    launch: {
        executablePath: '/usr/bin/google-chrome-stable',
        headless: 'new',
        // args: [ "--window-size=1366,768" ],
    },
    browser: 'chromium',
  }