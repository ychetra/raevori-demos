import type { Card, ChatTurn } from "./model";

export type ChatFailure = "busy" | "global" | "session" | "ip" | "length";
export type ChatResult = { ok: true; text: string; cards: Card[] } | { ok: false; error: ChatFailure };

const FAILURES: ChatFailure[] = ["busy", "global", "session", "ip", "length"];

/** Sends the conversation so far; any network or server trouble, or no answer within `timeoutMs`, comes back as "busy". */
export async function sendChat(history: ChatTurn[], opts: { timeoutMs?: number } = {}): Promise<ChatResult> {
  const { timeoutMs = 25_000 } = opts;
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, text: String(body.text ?? ""), cards: Array.isArray(body.cards) ? body.cards : [] };
    return { ok: false, error: FAILURES.includes(body.error) ? body.error : "busy" };
  } catch {
    return { ok: false, error: "busy" };
  }
}
