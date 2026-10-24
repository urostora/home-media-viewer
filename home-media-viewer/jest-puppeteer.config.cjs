/** @type {import('jest-environment-puppeteer').JestPuppeteerConfig} */
module.exports = {
    launch: {
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ],
    },
    browser: 'chromium',
  }