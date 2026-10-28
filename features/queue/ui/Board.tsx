"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { LangToggle } from "@/components/shared/LangToggle";
import { Qr } from "@/components/shared/Qr";
import { pick, type Lang, type Text } from "@/lib/i18n";
import { callNext, createQueue, CreateQueueError, recallTicket } from "../api";
import { T } from "../km";
import { serviceName } from "../admin";
import type { Ticket } from "../types";
import { useQueue } from "../useQueue";

const AUTO_MS = 20_000;

// The board shows two counters for now; the queue admin's counters 3-4 and closed counters reach it with the Task 29 screens.
type Counter = 1 | 2;
const COUNTERS: Counter[] = [1, 2];
const FLASH_MS = 3000;

const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Phnom_Penh", hour: "2-digit", minute: "2-digit", hour12: false });

/** Waiting tickets in line order (take time, then take order). */
export function waitingLine(tickets: Ticket[]): Ticket[] {
  return tickets.filter((t) => t.status === "waiting").sort((a, b) => (a.at.waiting ?? 0) - (b.at.waiting ?? 0));
}

/** Each counter's current ticket, and the counter called most recently (the big one on the board). */
export function counters(tickets: Ticket[]): { current: Record<Counter, Ticket | undefined>; latest: Counter } {
  const current = Object.fromEntries(COUNTERS.map((c) => [c, tickets.find((t) => t.status === "called" && t.counter === c)])) as Record<Counter, Ticket | undefined>;
  const latest: Counter = (current[2]?.at.called ?? -1) > (current[1]?.at.called ?? -1) ? 2 : 1;
  return { current, latest };
}

/** Average minutes between taking a number and being called, over everyone called so far (at least 1). */
export function averageWait(tickets: Ticket[]): number | null {
  const waits = tickets.filter((t) => t.at.called && t.at.waiting).map((t) => t.at.called! - t.at.waiting!);
  if (!waits.length) return null;
  return Math.max(1, Math.round(waits.reduce((a, b) => a + b, 0) / waits.length / 60_000));
}

/** The laptop view: QR to take a number on the left, the live waiting-room board and staff controls on the right. */
export function Board() {
  const router = useRouter();
  const params = useSearchParams();
  const room = params.get("room");
  const { tickets, config, status } = useQueue(room);
  const [lang, setLang] = useState<Lang>("en");
  const [origin, setOrigin] = useState("");
  const [now, setNow] = useState<number | null>(null);
  const [createError, setCreateError] = useState<Text | null>(null);
  const t = (x: Text) => pick(x, lang);
  const km = lang === "km";

  useEffect(() => {
    setOrigin(window.location.origin);
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  const start = () => {
    setCreateError(null);
    createQueue()
      .then(({ id }) => router.replace(`/queue?room=${id}`))
      .catch((e) => setCreateError(e instanceof CreateQueueError && e.status === 429 ? T.board.tooMany : T.board.createFailed));
  };
  useEffect(() => {
    if (!room) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  const ticketUrl = room && origin ? `${origin}/queue/ticket?room=${room}` : "";
  const line = useMemo(() => waitingLine(tickets), [tickets]);
  const { current, latest } = useMemo(() => counters(tickets), [tickets]);
  const avg = useMemo(() => averageWait(tickets), [tickets]);
  const flash = useCallFlash(current, status === "live");
  const other: Counter = latest === 1 ? 2 : 1;
  const live = status === "live" && !!room;

  // Auto-call: every 20 s, alternating counters, only while the tab is visible and someone is waiting.
  const [auto, setAuto] = useState(true);
  const autoState = useRef({ room, waiting: 0, next: other });
  useEffect(() => {
    autoState.current = { room, waiting: line.length, next: other };
  }, [room, line.length, other]);
  useEffect(() => {
    if (!auto || !live) return;
    const id = setInterval(() => {
      const s = autoState.current;
      if (document.visibilityState !== "visible" || s.waiting === 0 || !s.room) return;
      callNext(s.room, s.next, { auto: true });
    }, AUTO_MS);
    return () => clearInterval(id);
  }, [auto, live]);

  const [busy, setBusy] = useState<Counter | "recall" | null>(null);
  const run = (key: Counter | "recall", p: Promise<unknown>) => {
    setBusy(key);
    p.finally(() => setBusy(null));
  };

  const big = current[latest];
  const small = current[other];
  const announce = flash[latest] && big ? `${big.number} ${t(T.board.calledTo)} ${t(T.counter)} ${latest}` : "";
  const link = "underline underline-offset-2 hover:text-accent";

  return (
    <main lang={lang} className="mx-auto grid max-w-[1240px] gap-[22px] p-[18px] sm:p-[22px] lg:grid-cols-[330px_minmax(0,1fr)]">
      <section className="flex min-w-0 flex-col gap-3.5">
        <div>
          <p className="text-[12px] font-semibold text-accent">{t(T.board.eyebrow)}</p>
          <h1 className={`mt-1.5 text-[clamp(26px,3vw,30px)] font-semibold ${km ? "leading-[1.35] tracking-normal" : "leading-[1.05] tracking-[-0.04em]"}`}>{t(T.board.headline)}</h1>
          <p className="mt-2.5 text-[14px] text-muted">{t(T.board.intro)}</p>
        </div>
        <div className="rounded-[20px] border border-line bg-surface p-[18px] text-center">
          <div className="mx-auto grid aspect-square w-[180px] place-items-center">
            {ticketUrl ? (
              <a href={ticketUrl} target="_blank" rel="noopener" data-ticket-url={ticketUrl} aria-label={t(T.board.takeHere)}>
                <Qr value={ticketUrl} label={t(T.board.qrLabel)} className="w-[180px]" />
              </a>
            ) : (
              <div className={`size-full rounded-xl bg-paper ${createError ? "" : "animate-pulse"}`} />
            )}
          </div>
          <p className="mt-3 font-semibold">{t(T.board.scan)}</p>
          <p className="mt-0.5 text-[13px] text-muted">{t(T.board.scanSub)}</p>
          <p className="mt-3 border-t border-line pt-2.5 text-[13px]">
            {t(T.board.noPhone)}{" "}
            <a href={ticketUrl || undefined} target="_blank" rel="noopener" className={link}>
              {t(T.board.takeHere)}
            </a>
          </p>
        </div>
        <ol className="flex flex-col gap-2 text-[13.5px]">
          {T.board.steps.map((s, i) => (
            <li key={s.en} className="flex items-center gap-2.5">
              <b className="grid size-[22px] shrink-0 place-items-center rounded-[7px] bg-fg text-[11px] text-white">{i + 1}</b>
              {t(s)}
            </li>
          ))}
        </ol>
      </section>

      <div className="flex min-w-0 flex-col gap-3">
        <section aria-label={t(T.board.boardLabel)} className="rounded-[20px] bg-ink p-[18px] text-ink-fg sm:p-[22px]">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-semibold">{t(T.shop)}</h2>
              <p className="text-[12px] text-ink-muted tabular-nums">{now ? clock.format(now) : " "}</p>
            </div>
            <LangToggle lang={lang} onChange={setLang} tone="glass" />
          </div>

          {createError ? (
            <div role="alert" className="grid min-h-[300px] place-items-center px-4 text-center">
              <p className="max-w-[36ch] text-[15px]">{t(createError)}</p>
            </div>
          ) : status === "closed" ? (
            <div className="grid min-h-[300px] place-items-center text-center">
              <div>
                <p className="text-[18px] font-semibold">{t(T.board.closedTitle)}</p>
                <p className="mt-1 text-[13px] text-ink-muted">{t(T.board.closedBody)}</p>
                <button type="button" onClick={start} className="mt-4 min-h-11 rounded-[12px] bg-ink-accent px-5 text-[14px] font-semibold text-ink">
                  {t(T.board.startNew)}
                </button>
              </div>
            </div>
          ) : !live ? (
            <BoardSkeleton />
          ) : (
            <>
              <p aria-live="polite" className="sr-only">
                {announce}
              </p>
              <div className="grid gap-3 md:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
                <CounterCard ticket={big} counter={latest} flash={flash[latest]} big lang={lang} />
                <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
                  <CounterCard ticket={small} counter={other} flash={flash[other]} lang={lang} />
                  <div data-avg-wait className="rounded-[16px] border border-ink-line bg-ink-surface p-3.5 sm:p-4">
                    <p className="text-[12px] text-ink-muted">{t(T.board.avgWait)}</p>
                    <p className="mt-1 text-[26px] leading-none font-semibold tracking-[-0.03em] tabular-nums">
                      {avg ?? "—"} <span className="text-[14px] font-medium tracking-normal text-ink-muted">{avg !== null && t(T.board.min)}</span>
                    </p>
                    <p className="mt-2 text-[12px] text-ink-muted">
                      {t(T.board.waiting)} <b className="text-ink-fg tabular-nums">{line.length}</b>
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <h3 className="mb-2 text-[12px] text-ink-muted">{t(T.board.next)}</h3>
                {line.length === 0 ? (
                  <p className="rounded-[14px] border border-ink-line px-3.5 py-3 text-[13px] text-ink-muted">{t(T.board.nobodyWaiting)}</p>
                ) : (
                  <ol data-next className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {/* Room for 6: the 4 seeded people plus a visitor or two, so a new number shows up straight away. */}
                    {line.slice(0, 6).map((w) => (
                      <li key={w.id} data-ticket={w.number} className="min-w-0 rounded-[14px] border border-ink-line bg-ink-surface px-3 py-2.5 animate-[ticket-in_.45s_var(--ease-out-expo)]">
                        <b className="block text-[20px] leading-tight font-semibold tracking-[-0.02em] tabular-nums">{w.number}</b>
                        <span className="block truncate text-[12px] text-ink-muted">{t(serviceName(config.services, w.service))}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </>
          )}
        </section>

        <div role="group" aria-label={t(T.board.staff)} className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[16px] border border-line bg-surface p-3 sm:px-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold">{t(T.board.callNext)}</span>
            {COUNTERS.map((c) => (
              <button
                key={c}
                type="button"
                disabled={!live || busy !== null}
                onClick={() => run(c, callNext(room!, c))}
                className="min-h-10 rounded-[12px] bg-fg px-3.5 text-[13px] font-semibold whitespace-nowrap text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {t(T.counter)} {c}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={!live || !big || busy !== null}
            onClick={() => run("recall", recallTicket(room!, latest))}
            className="min-h-10 rounded-[12px] border border-line px-3.5 text-[13px] font-semibold whitespace-nowrap transition-colors hover:border-line-strong disabled:opacity-50"
          >
            {t(T.board.recall)}
            {big && <span className="tabular-nums"> {big.number}</span>}
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={auto}
            onClick={() => setAuto((a) => !a)}
            className="flex min-h-10 items-center gap-2.5 text-[13px] sm:ml-auto"
          >
            <span aria-hidden="true" className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${auto ? "bg-accent" : "bg-line-strong"}`}>
              <span className={`absolute top-[3px] left-[3px] size-[18px] rounded-full bg-white shadow-sm transition-transform ${auto ? "translate-x-4" : ""}`} />
            </span>
            {t(T.board.autoCall)}
          </button>
        </div>
      </div>
    </main>
  );
}

/** Which counters were just called (or recalled), each for FLASH_MS after its call time changed. Silent on the first snapshot. */
function useCallFlash(current: Record<Counter, Ticket | undefined>, live: boolean): Record<Counter, number | null> {
  const seen = useRef<Record<Counter, number | undefined> | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [flash, setFlash] = useState<Record<Counter, number | null>>({ 1: null, 2: null });
  const k1 = current[1]?.at.called;
  const k2 = current[2]?.at.called;

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    if (!live) return;
    const keys: Record<Counter, number | undefined> = { 1: k1, 2: k2 };
    if (seen.current === null) {
      seen.current = keys;
      return;
    }
    for (const c of COUNTERS) {
      const k = keys[c];
      if (k !== undefined && k !== seen.current[c]) {
        setFlash((f) => ({ ...f, [c]: k }));
        timers.current.push(setTimeout(() => setFlash((f) => (f[c] === k ? { ...f, [c]: null } : f)), FLASH_MS));
      }
    }
    seen.current = keys;
  }, [k1, k2, live]);

  return flash;
}

function CounterCard({ ticket, counter, flash, big = false, lang }: { ticket?: Ticket; counter: Counter; flash: number | null; big?: boolean; lang: Lang }) {
  const t = (x: Text) => pick(x, lang);
  return (
    <div
      data-counter={counter}
      data-serving={ticket?.number ?? ""}
      data-flash={flash ? "" : undefined}
      className={`flex min-w-0 flex-col rounded-[16px] border transition-[border-color,box-shadow,background-color] duration-700 ${big ? "p-4 sm:p-5" : "p-3.5 sm:p-4"} ${
        flash ? "border-ink-accent bg-[#1d241e] shadow-[0_0_0_4px_rgba(168,196,143,0.14)]" : "border-ink-line bg-ink-surface"
      }`}
    >
      {big && <p className="text-[12.5px] text-ink-muted">{t(T.board.nowServing)}</p>}
      <p
        key={flash ?? "still"}
        className={`font-semibold tabular-nums ${flash ? "animate-[ticket-in_.45s_var(--ease-out-expo)]" : ""} ${
          big ? "mt-1 text-[clamp(60px,9vw,124px)] leading-[0.95] tracking-[-0.05em]" : "text-[clamp(30px,3.4vw,40px)] leading-none tracking-[-0.04em]"
        }`}
      >
        {ticket?.number ?? "—"}
      </p>
      <p className={`font-semibold text-ink-accent ${big ? "mt-auto pt-3 text-[clamp(17px,1.8vw,22px)]" : "mt-1.5 text-[13.5px]"}`}>
        <span aria-hidden="true">→ </span>
        {t(T.counter)} {counter}
        {!ticket && <span className="font-normal text-ink-muted"> · {t(T.board.free)}</span>}
      </p>
    </div>
  );
}

function BoardSkeleton() {
  const block = (cls: string) => <div className={`rounded-[10px] bg-ink-surface ${cls}`} />;
  return (
    <div aria-hidden="true">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        {block("h-[150px] md:h-[200px]")}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
          {block("h-[94px]")}
          {block("h-[94px]")}
        </div>
      </div>
      {block("mt-4 h-3 w-12")}
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i}>{block("h-[58px]")}</div>
        ))}
      </div>
    </div>
  );
}
