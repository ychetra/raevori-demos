import { expect, test } from "vitest";
import { KHQR_DEMO_VALUE } from "@/components/shared/khqr";
import { qrSvg } from "@/components/shared/qr-svg";

test("the KHQR look-alike never encodes a real payment payload", () => {
  expect(KHQR_DEMO_VALUE).toBe("Raevori demo, not a payment");
  expect(KHQR_DEMO_VALUE.startsWith("000201")).toBe(false); // EMV payloads start with 000201
});

test("qrSvg renders an svg for a value", async () => {
  const svg = await qrSvg("https://demo.raevori.com/table-order/menu?room=abc&table=4");
  expect(svg.startsWith("<svg")).toBe(true);
  expect(svg).toContain("<path");
});
