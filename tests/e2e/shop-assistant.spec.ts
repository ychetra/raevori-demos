import { expect, test } from "@playwright/test";

// The server runs with CHAT_MODEL=fake: the Nth customer message plays the Nth turn of the sample chat.
const live = !!process.env.BASE_URL;

test("a suggestion finds the shirt, and the chat ends in a KHQR order for $19.50", async ({ page }) => {
  test.skip(live, "scripted replies need the fake model");
  await page.goto("/shop-assistant");
  const log = page.getByRole("log");

  await log.getByRole("button", { name: "Do you have this shirt in black, size M?" }).click();
  await expect(log.locator('[data-card="product"]')).toContainText("Linen shirt");
  await expect(log.locator('[data-card="product"]')).toContainText("$18.00");

  const input = page.getByRole("textbox", { name: "Message Mealea Fashion…" });
  await input.fill("Can you deliver to Toul Kork today?");
  await input.press("Enter");
  await expect(log.locator('[data-card="delivery"]')).toContainText("$1.50");

  await input.fill("Yes please. My name is Dara.");
  await page.getByRole("button", { name: "Send" }).click();
  const order = log.locator('[data-card="order"]');
  await expect(order.locator("[data-total]")).toHaveText("$19.50");
  await expect(order).toContainText("Dara");

  await order.getByRole("button", { name: /Pay with KHQR/ }).click();
  const khqr = page.getByRole("dialog");
  await expect(khqr).toContainText("KHQR");
  await expect(khqr).toContainText("19.50 USD");
  await expect(khqr.getByRole("img", { name: /KHQR code for Mealea Fashion/ })).toBeVisible();
  await khqr.getByRole("button", { name: "Simulate payment" }).click();
  await expect(order).toContainText("Paid. Mealea Fashion is packing your order.");
});

test("Khmer customers get Khmer replies", async ({ page }) => {
  test.skip(live, "scripted replies need the fake model");
  await page.goto("/shop-assistant");
  await page.getByRole("button", { name: "ខ្មែរ" }).click();
  await page.getByRole("log").getByRole("button", { name: "អាវនេះមានពណ៌ខ្មៅទេ? ទំហំ M" }).click();
  await expect(page.locator('[data-role="assistant"]').last()).toContainText("អាវក្រណាត់លីនិន");
});

test("when the AI is busy the chat says so and plays the sample chat instead", async ({ page }) => {
  await page.route("**/api/chat", (r) => r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "busy", replay: true }) }));
  await page.goto("/shop-assistant");
  await page.getByRole("log").getByRole("button", { name: "How much is delivery to Sen Sok?" }).click();

  const notice = page.getByRole("status");
  await expect(notice).toContainText("The demo is busy right now");
  await notice.getByRole("button", { name: "Watch a sample chat" }).click();

  const log = page.getByRole("log");
  await expect(log).toContainText("Sample chat");
  await expect(log.locator('[data-card="product"]')).toBeVisible();
  await expect(log.locator('[data-card="order"] [data-total]')).toHaveText("$19.50", { timeout: 15_000 });
  await expect(log).toContainText("That's the end of this sample chat.");
});

test("a used-up limit locks the composer and still offers the sample chat", async ({ page }) => {
  await page.route("**/api/chat", (r) => r.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: "session", replay: true }) }));
  await page.goto("/shop-assistant");
  await page.getByRole("log").getByRole("button", { name: "តើមានកាបូបពណ៌ក្រហមទេ?" }).click();
  await expect(page.getByRole("status")).toContainText("You've used this demo's 20 messages.");
  await expect(page.getByRole("textbox")).toBeDisabled();
  await expect(page.getByRole("status").getByRole("button", { name: "Watch a sample chat" })).toBeEnabled();
});

test("a long Khmer message wraps without sideways scrolling at 360px", async ({ page }) => {
  test.skip(live, "scripted replies need the fake model");
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/shop-assistant");
  await page.getByRole("button", { name: "ខ្មែរ" }).click();
  const long = "សួស្តីខ្ញុំចង់ទិញអាវក្រណាត់លីនិនពណ៌ខ្មៅទំហំMសម្រាប់ពិធីមង្គលការរបស់មិត្តភក្តិខ្ញុំនៅចុងសប្តាហ៍នេះតើអាចដឹកជូនដល់ទួលគោកបានទាន់ពេលទេព្រោះខ្ញុំរវល់ណាស់";
  const input = page.getByRole("textbox");
  await input.fill(long);
  await input.press("Enter");
  await expect(page.locator('[data-role="user"]')).toHaveText(long);
  await expect(page.locator('[data-card="product"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  const bubble = await page.locator('[data-role="user"]').boundingBox();
  expect(bubble!.x + bubble!.width).toBeLessThanOrEqual(360);
});
