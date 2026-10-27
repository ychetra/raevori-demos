import { defineConfig, devices } from "@playwright/test";

const executablePath = process.env.CHROMIUM_PATH ?? "/home/ubuntu/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome";
// E2E_PORT lets parallel worktrees each build and serve their own copy (a shared port would be reused across them).
const port = process.env.E2E_PORT ?? "3012";
const baseURL = process.env.BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL, launchOptions: { executablePath }, trace: "retain-on-failure" },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, defaultBrowserType: "chromium" } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : { command: `npm run build && npm start -- -p ${port}`, url: `${baseURL}/api/health`, timeout: 180_000, reuseExistingServer: true, env: { CHAT_MODEL: "fake" } },
});
