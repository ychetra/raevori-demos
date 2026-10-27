import type { ChatModel, ModelReply } from "./model";
import { REPLAY } from "./replay";
import { T } from "./km";

/**
 * A deterministic stand-in for the AI (CHAT_MODEL=fake), for tests and offline work.
 * The customer's Nth message plays the Nth turn of the sample chat, answering in Khmer if the message has any Khmer.
 */
export class FakeChatModel implements ChatModel {
  async next(history: Parameters<ChatModel["next"]>[0], toolResults: Parameters<ChatModel["next"]>[1]): Promise<ModelReply> {
    const users = history.filter((t) => t.role === "user");
    const lang = /[ក-៿]/.test(users.at(-1)?.text ?? "") ? "km" : "en";
    const turn = REPLAY[users.length - 1];
    if (!turn) return { text: T.replay.end[lang] };
    if (toolResults.length === 0) return { calls: turn.calls };
    return { text: turn.reply[lang] };
  }
}
