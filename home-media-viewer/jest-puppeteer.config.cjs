/** @type {import('jest-environment-puppeteer').JestPuppeteerConfig} */
module.exports = {
    launch: {
        executablePath: '/usr/bin/google-chrome-stable',
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ],
    },
    browser: 'chromium',
  }