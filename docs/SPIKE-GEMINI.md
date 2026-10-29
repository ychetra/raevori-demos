# Gemini spike (Task 10), 2026-10-29

Script: `GEMINI_API_KEY=… npx jiti scripts/spike-gemini.ts [model]` runs 12 scripted chats (6 Khmer, 4 English, 2 mixed) through `runTurn` and prints tool calls, latency, finish reasons and token use as JSON.

## Free-tier limits found (probed on the owner's key; Google no longer publishes them)

| Model | Requests/min | Requests/day | Result |
|---|---|---|---|
| gemini-3.5-flash | 5 | 20 | Natural Khmer, but 20 a day is ~7 customer messages |
| gemini-3.6-flash | — | 20 | Same daily cap |
| gemini-3.7-flash, gemini-3.8-flash | — | — | Requests time out on the free tier |
| **gemini-3.5-flash-lite** | >16 | >100 (no daily 429 after ~100 calls) | **Chosen** |

## Choice: `gemini-3.5-flash-lite`, thinking level LOW, max 2048 output tokens

The owner asked for the model that saves tokens but still does the job. Flash-Lite is the cheapest and fastest, and the only one whose free tier fits a public demo.

Final run (after the fixes below):
- Correct tool use: 12/12 (bar ≥ 11/12)
- Median model call: 949 ms; total model time per chat 1.1–5.5 s (bar: median < 6 s, 2-tool turn well inside 15 s)
- Empty/truncated replies: 0 of 31 calls
- Khmer: 5 of 6 read naturally; the Khmer order chat hit the 4-step cap after a colour was out of stock and returned cards without text. Owner should still have the Khmer reviewed natively.

## Fixes the spike drove

1. Flash-Lite mixed Thai, Japanese and Vietnamese letters into Khmer (`ด้าน`, `です`, `ហự`). The prompt now says Khmer replies use only Khmer script, and `cleanReply` strips letters from those scripts.
2. It answered an English order in Khmer. Each request now states the language of the customer's latest message (Khmer if it contains Khmer script, else English).

## Daily cap

`CHAT_GLOBAL_DAILY_CAP` stays at its default of 200 model calls (about 70–100 customer messages a day; each IP gets a quarter of that). If Google's own daily limit is hit first, the chat says it's busy and plays the sample chat.
