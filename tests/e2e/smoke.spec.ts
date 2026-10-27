import { expect, test } from "@playwright/test";

test("home page shows the Raevori name", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Raevori");
});

test("health check is ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.text()).toBe("ok");
});
