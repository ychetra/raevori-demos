import { expect, test } from "vitest";
import { GET } from "@/app/api/health/route";

test("health check answers 200 ok", async () => {
  const res = GET();
  expect(res.status).toBe(200);
  expect(await res.text()).toBe("ok");
});
