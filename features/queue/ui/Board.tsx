"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { LangToggle } from "@/components/shared/LangToggle";
import { Qr } from "@/components/shared/Qr";
import { pick, type Lang, type Text } from "@/lib/i18n";
import { callNext, createQueue, CreateQueueError, recallTicket } from "../api";
import { T } from "../km";
import { counterName, serviceName } from "../admin";
import { readPin, savePin } from "../pin";
import type { Counter, CounterConfig, Ticket } from "../types";
import { useQueue } from "../useQueue";

const FLASH_MS = 3000;
const ALL: Counter[] = [1, 2, 3, 4];

const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Phnom_Penh", hour: "2-digit", minute: "2-digit", hour12: false });

/** Waiting tickets in line order (take time, then take order). */
export function waitingLine(tickets: Ticket[]): Ticket[] {
  return tickets.filter((t) => t.status === "waiting").sort((a, b) => (a.at.waiting ?? 0) - (b.at.waiting ?? 0));
}

/**
 * Each counter's current ticket, and the counter called most recently (the big one on the board): with nobody at a counter,
 * the first open one (or the first, when all are closed).
 */
export function counters(tickets: Ticket[], cfg: CounterConfig[]): { current: Partial<Record<Counter, Ticket>>; latest: Counter } {
  const current: Partial<Record<Counter, Ticket>> = {};
  for (const c of cfg) current[c.id] = tickets.find((t) => t.status === "called" && t.counter === c.id);
  let latest: Counter = (cfg.find((c) => c.open) ?? cfg[0])?.id ?? 1;
  let at = -1;
  for (const c of cfg) {
    const called = current[c.id]?.at.called ?? -1;
    if (called > at) {
      at = called;
      latest = c.id;
    }
  }
  return { current, latest };
}

/** The open counter after `latest` in order (wrapping round), so auto-calls take turns; null when every counter is closed. */
export function nextCounter(cfg: CounterConfig[], latest: Counter): Counter | null {
  const open = cfg.filter((c) => c.open);
  if (!open.length) return null;
  return (open.find((c) => c.id > latest) ?? open[0]).id;
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
  const [pin, setPin] = useState<string | null>(null);
  useEffect(() => setPin(room ? readPin(room) : null), [room]);
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
      .then(({ id, pin }) => {
        savePin(id, pin);
        router.replace(`/queue?room=${id}`);
      })
      .catch((e) => setCreateError(e instanceof CreateQueueError && e.status === 429 ? T.board.tooMany : T.board.createFailed));
  };
  useEffect(() => {
    if (!room) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  const ticketUrl = room && origin ? `${origin}/queue/ticket?room=${room}` : "";
  const line = useMemo(() => waitingLine(tickets), [tickets]);
  const cfg = config.counters;
  const { current, latest } = useMemo(() => counters(tickets, cfg), [tickets, cfg]);
  const avg = useMemo(() => averageWait(tickets), [tickets]);
  const flash = useCallFlash(current, status === "live");
  const others = cfg.filter((c) => c.id !== latest);
  const open = cfg.filter((c) => c.open);
  const name = (n: Counter) => t(cfg.find((c) => c.id === n)?.name ?? counterName(n));
  const live = status === "live" && !!room;

  // Auto-call at the owner's interval (off when 0), taking turns over the open counters, only while the tab is visible and
  // someone is waiting. The switch pauses it on this board only.
  const autoMs = config.settings.autoCall * 1000;
  const [auto, setAuto] = useState(true);
  const autoState = useRef({ room, waiting: 0, next: nextCounter(cfg, latest) });
  useEffect(() => {
    autoState.current = { room, waiting: line.length, next: nextCounter(cfg, latest) };
  }, [room, line.length, cfg, latest]);
  useEffect(() => {
    if (!auto || !live || !autoMs) return;
    const id = setInterval(() => {
      const s = autoState.current;
      if (document.visibilityState !== "visible" || s.waiting === 0 || !s.room || s.next === null) return;
      callNext(s.room, s.next, { auto: true });
    }, autoMs);
    return () => clearInterval(id);
  }, [auto, live, autoMs]);
  const autoOn = auto && autoMs > 0;

  const [busy, setBusy] = useState<Counter | "recall" | null>(null);
  const run = (key: Counter | "recall", p: Promise<unknown>) => {
    setBusy(key);
    p.finally(() => setBusy(null));
  };

  const big = current[latest];
  const bigCfg = cfg.find((c) => c.id === latest);
  const announce = flash[latest] && big ? `${big.number} ${t(T.board.calledTo)} ${name(latest)}` : "";
  // One or two counters: the big card with a side column. Three or four: the big card on top and a row under it.
  const wide = cfg.length >= 3;
  const tiles = others.length + 1;
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
          {room && (
            <p data-owner-admin className="mt-2.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-t border-line pt-2.5 text-[13px]">
              <a href={`/queue/admin?room=${room}`} target="_blank" rel="noopener" className="font-semibold underline underline-offset-2 hover:text-accent">
                {t(T.board.ownerAdmin)} →
              </a>
              {pin && (
                <span className="text-muted">
                  {t(T.board.pin)} <b data-admin-pin className="font-semibold tracking-[0.12em] text-fg tabular-nums">{pin}</b>
                </span>
              )}
            </p>
          )}
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
            <div className="min-w-0">
              <h2 data-shop-name className="text-[16px] font-semibold break-words">{config.settings.name}</h2>
              <p className="text-[12px] text-ink-muted tabular-nums">{now ? clock.format(now) : " "}</p>
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
              <div className={`grid gap-3 ${wide ? "" : "md:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]"}`}>
                {bigCfg && <CounterCard ticket={big} counter={bigCfg} flash={flash[latest] ?? null} big lang={lang} />}
                <div className={`grid gap-3 ${tiles === 1 ? "grid-cols-1" : "grid-cols-2"} ${wide ? (tiles === 4 ? "md:grid-cols-4" : "md:grid-cols-3") : "md:grid-cols-1"}`}>
                  {others.map((c) => (
                    <CounterCard key={c.id} ticket={current[c.id]} counter={c} flash={flash[c.id] ?? null} lang={lang} />
                  ))}
                  <div data-avg-wait className={`min-w-0 rounded-[16px] border border-ink-line bg-ink-surface p-3.5 sm:p-4 ${tiles === 3 ? "col-span-2 md:col-span-1" : ""}`}>
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
          <div data-call-next className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold">{t(T.board.callNext)}</span>
            {open.length === 0 && <span className="text-[13px] text-muted">{t(T.board.noOpenCounter)}</span>}
            {open.map((c) => (
              <button
                key={c.id}
                type="button"
                data-call-counter={c.id}
                disabled={!live || busy !== null}
                onClick={() => run(c.id, callNext(room!, c.id))}
                className="min-h-10 max-w-full truncate rounded-[12px] bg-fg px-3.5 text-[13px] font-semibold whitespace-nowrap text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {t(c.name)}
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
            aria-checked={autoOn}
            disabled={!autoMs}
            onClick={() => setAuto((a) => !a)}
            className="flex min-h-10 items-center gap-2.5 text-left text-[13px] disabled:text-muted sm:ml-auto"
          >
            <span aria-hidden="true" className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${autoOn ? "bg-accent" : "bg-line-strong"}`}>
              <span className={`absolute top-[3px] left-[3px] size-[18px] rounded-full bg-white shadow-sm transition-transform ${autoOn ? "translate-x-4" : ""}`} />
            </span>
            {t(autoMs === 0 ? T.board.autoCallOff : autoMs === 60_000 ? T.board.autoCall60 : T.board.autoCall)}
          </button>
        </div>
      </div>
    </main>
  );
}

/** Which counters were just called (or recalled), each for FLASH_MS after its call time changed. Silent on the first snapshot. */
function useCallFlash(current: Partial<Record<Counter, Ticket>>, live: boolean): Partial<Record<Counter, number | null>> {
  const seen = useRef<Partial<Record<Counter, number>> | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [flash, setFlash] = useState<Partial<Record<Counter, number | null>>>({});
  // One string of the four call times, so the effect runs only when a call time changes.
  const sig = ALL.map((c) => current[c]?.at.called ?? "").join(",");

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    if (!live) return;
    const keys: Partial<Record<Counter, number>> = {};
    sig.split(",").forEach((v, i) => {
      if (v) keys[ALL[i]] = Number(v);
    });
    if (seen.current === null) {
      seen.current = keys;
      return;
    }
    for (const c of ALL) {
      const k = keys[c];
      if (k !== undefined && k !== seen.current[c]) {
        setFlash((f) => ({ ...f, [c]: k }));
        timers.current.push(setTimeout(() => setFlash((f) => (f[c] === k ? { ...f, [c]: null } : f)), FLASH_MS));
      }
    }
    seen.current = keys;
  }, [sig, live]);

  return flash;
}

function CounterCard({ ticket, counter, flash, big = false, lang }: { ticket?: Ticket; counter: CounterConfig; flash: number | null; big?: boolean; lang: Lang }) {
  const t = (x: Text) => pick(x, lang);
  const closed = !counter.open;
  return (
    <div
      data-counter={counter.id}
      data-serving={ticket?.number ?? ""}
      data-closed={closed ? "" : undefined}
      data-flash={flash ? "" : undefined}
      className={`flex min-w-0 flex-col rounded-[16px] border transition-[border-color,box-shadow,background-color] duration-700 ${big ? "p-4 sm:p-5" : "p-3.5 sm:p-4"} ${
        flash ? "border-ink-accent bg-[#1d241e] shadow-[0_0_0_4px_rgba(168,196,143,0.14)]" : closed ? "border-dashed border-ink-line bg-transparent text-ink-muted" : "border-ink-line bg-ink-surface"
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
      <p className={`min-w-0 font-semibold break-words ${closed ? "text-ink-muted" : "text-ink-accent"} ${big ? "mt-auto pt-3 text-[clamp(17px,1.8vw,22px)]" : "mt-1.5 text-[13.5px]"}`}>
        <span aria-hidden="true">→ </span>
        {t(counter.name)}
        {/* Beside the name on the big card; on its own line on the small ones, which can be narrow with 3-4 counters. */}
        {(closed || !ticket) && (
          <span className={`font-normal ${closed ? "" : "text-ink-muted"} ${big ? "" : "block text-[12.5px]"}`}>
            {big && " · "}
            {t(closed ? T.board.closed : T.board.free)}
          </span>
        )}
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
