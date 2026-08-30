const { defineConfig } = require('@playwright/test');

const port = Number(process.env.CRS_TEST_PORT || 4173);
const baseURL = `http://127.0.0.1:${port}`;

module.exports = defineConfig({
  testDir: './tests/frontend',
  testMatch: '**/*.spec.js',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 7_500
  },
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  outputDir: 'test-results/playwright',
  use: {
    baseURL,
    browserName: 'chromium',
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off'
  },
  webServer: {
    command: 'node tests/frontend/harness/server.mjs',
    url: `${baseURL}/health`,
    env: {
      CRS_TEST_PORT: String(port)
    },
    reuseExistingServer: !process.env.CI,
    timeout: 20_000
  }
});
