import type { Card, ChatTurn } from "./model";

export type ChatFailure = "busy" | "global" | "session" | "ip" | "length";
export type ChatResult = { ok: true; text: string; cards: Card[] } | { ok: false; error: ChatFailure };

const FAILURES: ChatFailure[] = ["busy", "global", "session", "ip", "length"];

/** Sends the conversation so far; any network or server trouble comes back as "busy". */
export async function sendChat(history: ChatTurn[]): Promise<ChatResult> {
  try {
    const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ history }) });
    const body = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, text: String(body.text ?? ""), cards: Array.isArray(body.cards) ? body.cards : [] };
    return { ok: false, error: FAILURES.includes(body.error) ? body.error : "busy" };
  } catch {
    return { ok: false, error: "busy" };
  }
}
