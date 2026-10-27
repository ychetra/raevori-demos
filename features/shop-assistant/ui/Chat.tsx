"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { KhqrCard } from "@/components/shared/KhqrCard";
import { LangToggle } from "@/components/shared/LangToggle";
import { pick, type Lang, type Text } from "@/lib/i18n";
import { cardsFor } from "../agent";
import { sendChat, type ChatFailure } from "../api";
import { T } from "../km";
import type { Card, ChatTurn } from "../model";
import { REPLAY } from "../replay";
import type { ShopOrder } from "../tools";
import { Cards } from "./Cards";

type NewMsg = { role: "user"; text: string } | { role: "assistant"; text: string; cards: Card[] } | { role: "notice"; reason: ChatFailure };
type Msg = NewMsg & { id: number };

const MAX_CHARS = 300;
/** Limits that won't lift by trying again: the composer stays off. */
const BLOCKING: ChatFailure[] = ["global", "session", "ip"];
const khmer = (s: string) => (/[ក-៿]/.test(s) ? "km" : "en");
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let nextId = 1;

/** Messenger-style chat with Mealea Fashion's assistant. Falls back to a replayed sample chat when the AI is busy. */
export function Chat({ lang, onLang }: { lang: Lang; onLang: (l: Lang) => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [paying, setPaying] = useState<ShopOrder | null>(null);
  const [paid, setPaid] = useState<Set<string>>(new Set());
  const list = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const t = (x: Text) => pick(x, lang);

  useEffect(() => () => { alive.current = false; }, []);
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, [msgs, waiting]);

  const push = (m: NewMsg) => setMsgs((all) => [...all, { ...m, id: nextId++ }]);
  const locked = waiting || blocked || replaying;

  async function send(raw: string) {
    const text = raw.trim();
    if (!text || locked) return;
    const history: ChatTurn[] = [
      ...msgs.flatMap((m): ChatTurn[] => (m.role === "user" || (m.role === "assistant" && m.text) ? [{ role: m.role, text: m.text }] : [])),
      { role: "user", text },
    ];
    push({ role: "user", text });
    setDraft("");
    setWaiting(true);
    const res = await sendChat(history);
    if (!alive.current) return;
    setWaiting(false);
    if (res.ok) push({ role: "assistant", text: res.text, cards: res.cards });
    else {
      push({ role: "notice", reason: res.error });
      if (BLOCKING.includes(res.error)) setBlocked(true);
    }
  }

  async function replay() {
    setReplaying(true);
    setMsgs([]);
    for (const turn of REPLAY) {
      await wait(450);
      if (!alive.current) return;
      push({ role: "user", text: pick(turn.user, lang) });
      setWaiting(true);
      await wait(1100);
      if (!alive.current) return;
      setWaiting(false);
      push({ role: "assistant", text: pick(turn.reply, lang), cards: cardsFor(turn.calls) });
      await wait(700);
    }
    push({ role: "assistant", text: pick(T.replay.end, lang), cards: [] });
    setReplaying(false);
  }

  const used = new Set(msgs.flatMap((m) => (m.role === "user" ? [m.text] : [])));
  const chips = (lang === "km" ? T.suggestions.map((s) => s.km) : T.suggestions.map((s, i) => (i === 1 ? s.km : s.en))).filter((s) => !used.has(s));
  const started = msgs.length > 0;

  return (
    <div lang={lang} className="flex h-full flex-col bg-surface">
      <header className="flex items-center justify-between gap-2 border-b border-line px-3.5 pt-3.5 pb-2.5">
        <span className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden="true" className="grid size-[34px] shrink-0 place-items-center rounded-[11px] bg-gradient-to-br from-accent to-ink-accent font-bold text-white">M</span>
          <span className="min-w-0">
            <b className="block text-[14px] leading-tight font-semibold">{t(T.shop)}</b>
            <span className="block truncate text-[11.5px] text-muted">{t(T.ui.subtitle)}</span>
          </span>
        </span>
        <LangToggle lang={lang} onChange={onLang} />
      </header>

      <div ref={list} role="log" aria-live="polite" className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-3 text-[13.5px] leading-snug">
        {replaying && <p className="mb-1 self-center rounded-full bg-paper px-3 py-1 text-[11px] font-medium text-muted">{t(T.ui.sample)}</p>}
        {!started && (
          <>
            <Bubble role="assistant" lang={lang}>{t(T.ui.greeting)}</Bubble>
            <p className="mt-2 text-[10.5px] font-semibold tracking-[0.06em] text-muted uppercase">{t(T.ui.tryAsking)}</p>
            {chips.map((s) => (
              <button key={s} type="button" onClick={() => send(s)} lang={khmer(s)} className="min-h-9 self-start rounded-full border border-line bg-surface px-3 py-1.5 text-left text-[12.5px] font-medium hover:border-fg">
                {s}
              </button>
            ))}
          </>
        )}
        {msgs.map((m) =>
          m.role === "notice" ? (
            <Notice key={m.id} reason={m.reason} lang={lang} onWatch={replay} disabled={replaying} />
          ) : (
            <Bubble key={m.id} role={m.role} lang={khmer(m.text) as Lang}>
              {m.text}
              {m.role === "assistant" && m.cards.length > 0 && <Cards cards={m.cards} lang={lang} paid={paid} onPay={setPaying} />}
            </Bubble>
          ),
        )}
        {waiting && (
          <div className="self-start rounded-[16px_16px_16px_4px] bg-paper px-3.5 py-2.5">
            <span className="shimmer-text text-[12px] font-medium">{t(T.ui.checking)}</span>
          </div>
        )}
      </div>

      <form
        className="border-t border-line px-2.5 pt-2 pb-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        {started && !locked && chips.length > 0 && (
          <div className="-mx-2.5 mb-2 flex gap-1.5 overflow-x-auto px-2.5 [scrollbar-width:none]">
            {chips.map((s) => (
              <button key={s} type="button" onClick={() => send(s)} lang={khmer(s)} className="min-h-8 shrink-0 rounded-full border border-line bg-surface px-3 text-[12px] font-medium whitespace-nowrap hover:border-fg">
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1.5 rounded-[16px] border border-line bg-bg py-1.5 pr-1.5 pl-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={MAX_CHARS}
            disabled={blocked || replaying}
            placeholder={t(T.ui.placeholder)}
            aria-label={t(T.ui.placeholder)}
            lang={draft ? khmer(draft) : lang}
            style={{ outline: "none" }}
            className="min-w-0 flex-1 bg-transparent py-1.5 text-[16px] placeholder:text-muted disabled:opacity-60 md:text-[14px]"
          />
          <button type="submit" disabled={locked || !draft.trim()} aria-label={t(T.ui.send)} className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-fg text-white transition-opacity disabled:opacity-40">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10.5px] text-muted">{t(T.ui.footnote)}</p>
      </form>

      {paying && (
        <div className="absolute inset-0 z-20 flex flex-col justify-end bg-fg/45 animate-[fade-in_.15s_ease-out]" onClick={() => setPaying(null)}>
          <div role="dialog" aria-modal="true" aria-label={t(T.ui.payKhqr)} className="rounded-t-[24px] bg-surface px-4 pt-3 pb-5 animate-[sheet-in_.25s_var(--ease-out-expo)]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex justify-end">
              <button type="button" onClick={() => setPaying(null)} aria-label={t(T.ui.close)} className="grid size-9 place-items-center rounded-full hover:bg-paper">
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>
            <KhqrCard
              amount={paying.total}
              merchant={T.shop.en}
              lang={lang}
              onPaid={() => {
                setPaid((p) => new Set(p).add(paying.id));
                setPaying(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Bubble({ role, lang, children }: { role: "user" | "assistant"; lang: Lang; children: ReactNode }) {
  const mine = role === "user";
  return (
    <div
      lang={lang}
      data-role={role}
      className={`animate-[fade-in_.2s_ease-out] whitespace-pre-line ${mine ? "max-w-[80%] self-end rounded-[16px_16px_4px_16px] bg-fg px-3 py-2 text-white" : "max-w-[88%] self-start rounded-[16px_16px_16px_4px] bg-paper px-3 py-2"}`}
    >
      {children}
    </div>
  );
}

function Notice({ reason, lang, onWatch, disabled }: { reason: ChatFailure; lang: Lang; onWatch: () => void; disabled: boolean }) {
  const t = (x: Text) => pick(x, lang);
  if (reason === "length") return <p className="self-center px-4 text-center text-[12px] text-muted">{t(T.reasons.length)}</p>;
  return (
    <div role="status" className="mt-3 rounded-[16px] border border-line bg-bg p-4 text-center">
      <b className="text-[14.5px] font-semibold">{t(T.ui.busyTitle)}</b>
      <p className="mt-1 text-[12.5px] text-muted">{t(T.reasons[reason])}</p>
      <button type="button" onClick={onWatch} disabled={disabled} className="mt-3 min-h-11 w-full rounded-[14px] bg-fg px-4 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50">
        {t(T.ui.watch)}
      </button>
      <p className="mt-2 text-[11.5px] text-muted">
        {t(T.ui.wantOne)}{" "}
        <a href="https://raevori.com/#contact" className="text-fg underline underline-offset-2">{t(T.ui.talk)}</a>
      </p>
    </div>
  );
}
