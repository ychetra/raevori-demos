import { cleanHistory, runTurn } from "@/features/shop-assistant/agent";
import { createModel, limiter } from "@/features/shop-assistant/server";
import { clientIp, getSession } from "@/features/shop-assistant/session";

export const dynamic = "force-dynamic";

const reply = (body: unknown, status: number, setCookie?: string) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...(setCookie && { "Set-Cookie": setCookie }) } });

/** One customer message in, the assistant's reply and cards out. Only `history` is read from the body. */
export async function POST(req: Request) {
  const session = getSession(req);
  let body: { history?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply({ error: "bad_request" }, 400, session.setCookie);
  }
  const history = cleanHistory(body?.history);
  if (!history) return reply({ error: "bad_request" }, 400, session.setCookie);

  // The limiter sees the untrimmed message, so an over-long one is refused rather than cut.
  const raw = Array.isArray(body.history) ? body.history.at(-1)?.text : "";
  const verdict = limiter.check(session.id, clientIp(req), typeof raw === "string" ? raw.trim() : "");
  if (!verdict.ok) return reply({ error: verdict.reason, replay: true }, 429, session.setCookie);

  const result = await runTurn(history, createModel(), { onModelCall: limiter.countModelCall });
  if ("error" in result) return reply({ error: "busy", replay: true }, 503, session.setCookie);
  return reply(result, 200, session.setCookie);
}
