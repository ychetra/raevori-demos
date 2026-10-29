// Gemini spike (PLAN Task 10): runs scripted chats through runTurn with the real model and prints
// tool calls, latency, finish reasons and thinking tokens as JSON.
// Usage: GEMINI_API_KEY=… npx jiti scripts/spike-gemini.ts [model] > out.json
import type { GenerateContentResponse } from "@google/genai";
import { runTurn } from "../features/shop-assistant/agent";
import { DEFAULT_GEMINI_MODEL, GeminiChatModel } from "../features/shop-assistant/gemini";
import type { ChatModel, ChatTurn } from "../features/shop-assistant/model";

type Chat = { id: string; lang: "km" | "en" | "mixed"; turns: string[]; expect: string[]; noTools?: boolean };

const CHATS: Chat[] = [
  { id: "km-shirt", lang: "km", turns: ["អាវនេះមានពណ៌ខ្មៅទេ? ទំហំ M"], expect: ["search_products"] },
  { id: "km-red-bag", lang: "km", turns: ["តើមានកាបូបពណ៌ក្រហមទេ?"], expect: ["search_products"] },
  { id: "km-delivery", lang: "km", turns: ["ដឹកទៅសែនសុខថ្លៃប៉ុន្មាន?"], expect: ["quote_delivery"] },
  { id: "km-order", lang: "km", turns: ["ខ្ញុំចង់បានរ៉ូបផ្កា ទំហំ S", "យកមួយ ពណ៌ណាក៏បាន ដឹកទៅទួលគោក ឈ្មោះ ស្រីនាង"], expect: ["search_products", "create_order"] },
  { id: "km-shoes", lang: "km", turns: ["មានស្បែកជើងទំហំ 38 ទេ?"], expect: ["search_products"] },
  { id: "km-human", lang: "km", turns: ["អ្នកជាមនុស្សពិតមែនទេ?"], expect: [], noTools: true },
  { id: "en-red-bag", lang: "en", turns: ["Any red bags under $25?"], expect: ["search_products"] },
  { id: "en-order", lang: "en", turns: ["Do you have the linen shirt in black, size M?", "Great, I'll take one. Deliver to Toul Kork, my name is Dara."], expect: ["search_products", "create_order"] },
  { id: "en-delivery", lang: "en", turns: ["How much is delivery to Sen Sok, and does it come the same day?"], expect: ["quote_delivery"] },
  { id: "en-offtopic", lang: "en", turns: ["Can you help me with my math homework?"], expect: [], noTools: true },
  { id: "mix-jeans", lang: "mixed", turns: ["Hi, មាន jeans size 30 ទេ?"], expect: ["search_products"] },
  { id: "mix-scarf", lang: "mixed", turns: ["Silk krama scarf ថ្លៃប៉ុន្មាន? ហើយដឹកទៅចំការមនថ្លៃប៉ុន្មាន?"], expect: ["search_products", "quote_delivery"] },
];

const GAP_MS = 4000; // stay under the free tier's requests per minute

async function main() {
  const modelId = process.argv[2] || process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  let last: GenerateContentResponse | undefined;
  const gemini = new GeminiChatModel(modelId, (res) => (last = res));
  let lastCall = 0;
  const calls: { chat: string; ms: number; finish?: string; thoughts?: number; out?: number; tools: string[] }[] = [];
  let current = "";
  // Times each model call and records what came back.
  const timed: ChatModel = {
    async next(history, results, signal) {
      const wait = lastCall + GAP_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      const t = Date.now();
      try {
        const reply = await gemini.next(history, results, signal);
        calls.push({
          chat: current, ms: Date.now() - t, finish: last?.candidates?.[0]?.finishReason,
          thoughts: last?.usageMetadata?.thoughtsTokenCount, out: last?.usageMetadata?.candidatesTokenCount,
          tools: "calls" in reply ? reply.calls.map((c) => `${c.name}(${JSON.stringify(c.args)})`) : [],
        });
        return reply;
      } catch (e) {
        calls.push({ chat: current, ms: Date.now() - t, finish: `ERROR ${(e as Error).message.slice(0, 120)}`, tools: [] });
        throw e;
      } finally {
        lastCall = Date.now();
      }
    },
  };

  const chats = [];
  for (const chat of CHATS) {
    current = chat.id;
    const history: ChatTurn[] = [];
    const turns = [];
    for (const text of chat.turns) {
      history.push({ role: "user", text });
      const t = Date.now();
      // Spike runs get extra room so slow turns are measured, not cut off; the app's 15 s budget is checked from turnMs.
      const r = await runTurn(history, timed, { timeoutMs: 30_000 });
      const reply = "error" in r ? `<${r.error}>` : r.text;
      turns.push({ user: text, reply, cards: "error" in r ? [] : r.cards.map((c) => c.type), turnMs: Date.now() - t });
      history.push({ role: "assistant", text: "error" in r ? "" : r.text });
    }
    const used = calls.filter((c) => c.chat === chat.id).flatMap((c) => c.tools.map((x) => x.split("(")[0]));
    const toolsOk = chat.noTools ? used.length === 0 : chat.expect.every((name) => used.includes(name));
    chats.push({ id: chat.id, lang: chat.lang, toolsOk, used, turns });
  }
  const ms = calls.map((c) => c.ms).sort((a, b) => a - b);
  const turnMs = chats.flatMap((c) => c.turns.map((t) => t.turnMs)).sort((a, b) => a - b);
  const median = (xs: number[]) => xs[Math.floor(xs.length / 2)];
  console.log(JSON.stringify({
    model: modelId,
    summary: {
      toolsOk: chats.filter((c) => c.toolsOk).length + "/" + chats.length,
      medianCallMs: median(ms), medianTurnMs: median(turnMs), maxTurnMs: turnMs.at(-1),
      emptyOrTruncated: calls.filter((c) => c.finish !== "STOP").length,
      modelCalls: calls.length,
    },
    chats, calls,
  }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
