import { FakeChatModel } from "./fake-model";
import { GeminiChatModel } from "./gemini";
import { createLimiter, type Limiter } from "./limits";
import type { ChatModel } from "./model";

const g = globalThis as typeof globalThis & { __chatLimiter?: Limiter };

/** One limiter per server process (survives dev hot reloads). */
export const limiter: Limiter = (g.__chatLimiter ??= createLimiter());

/** CHAT_MODEL=fake plays the scripted sample chat; anything else uses Gemini. */
export const createModel = (): ChatModel => (process.env.CHAT_MODEL === "fake" ? new FakeChatModel() : new GeminiChatModel());
