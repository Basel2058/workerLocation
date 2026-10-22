import { defineConfig, devices } from '@playwright/test';

// End-to-end tests: a real browser with a fake GPS position and a fake camera, against the built app
// running on a fresh database with demo data. Run with `npm run test:e2e`.
const PORT = 4310;
const DATA = 'e2e/.artifacts/data';
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: 'e2e/.artifacts/results',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
      ...(chromiumPath ? { executablePath: chromiumPath } : {}),
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command:
      `rm -rf ${DATA} && DATA_DIR=${DATA} DEMO_LAT=51.5072 DEMO_LNG=-0.1276 DEMO_TZ=Europe/London npx tsx scripts/seed-demo.ts` +
      ` && DATA_DIR=${DATA} PORT=${PORT} NODE_ENV=development npx tsx server/src/index.ts`,
    url: `http://localhost:${PORT}/healthz`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
