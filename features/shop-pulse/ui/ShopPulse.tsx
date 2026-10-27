"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LangToggle } from "@/components/shared/LangToggle";
import { Qr } from "@/components/shared/Qr";
import { createRoom } from "@/features/table-order/api";
import type { RoomStatus } from "@/features/table-order/useRoom";
import { useRoom } from "@/features/table-order/useRoom";
import { pick, type Lang, type Text } from "@/lib/i18n";
import { khr, usd } from "@/lib/money";
import { history } from "../history";
import { T } from "../km";
import { byDay, byHour, dailyReport, kpis, topItems } from "../metrics";
import { DAY_MS, hourOf, startOfDay } from "../time";
import { fromOrder, type Sale } from "../types";
import { ColumnChart, type Column } from "./ColumnChart";
import { changeLabel, dayLabel, dayOfMonth, hhmm, pct } from "./format";

const TABLE = 4;
const TICK_MS = 30_000;
const GLOW_MS = 3000;

const card = "rounded-[20px] border border-line bg-surface p-4 sm:p-5";
const cardTitle = "text-[15px] font-semibold tracking-[-0.015em]";

/** The Shop Pulse page: intro, then a live dashboard for Lotus Coffee fed by history plus this page's Table Order room. */
export function ShopPulse() {
  const router = useRouter();
  const params = useSearchParams();
  const room = params.get("room");
  const { orders, status } = useRoom(room);
  const [lang, setLang] = useState<Lang>("en");
  const [now, setNow] = useState<number | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    if (!room) createRoom().then((id) => router.replace(`/shop-pulse?room=${id}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  // The clock and the history depend on the visitor's time: client only, so the server renders a skeleton.
  useEffect(() => {
    setOrigin(window.location.origin);
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(t);
  }, []);

  const live = useMemo(() => orders.map(fromOrder), [orders]);
  // A live order moves every number at once, without waiting for the next tick (and even if this clock is a little behind the server's).
  const at = useMemo(() => (now === null ? null : Math.max(now, Date.now(), ...live.map((s) => s.at))), [now, live]);

  const sales = useMemo(() => {
    if (at === null) return [];
    const byId = new Map<string, Sale>();
    for (const s of history(at)) byId.set(s.id, s);
    for (const s of live) byId.set(s.id, s);
    return [...byId.values()].sort((a, b) => a.at - b.at);
  }, [at, live]);

  const fresh = useFreshIds(live, status);

  return (
    <main className="mx-auto max-w-[1240px] p-[18px] sm:p-[22px] lg:px-[30px] lg:py-[26px]">
      <section>
        <p className="text-[12px] font-semibold text-accent">Shop Pulse demo</p>
        <h1 className="mt-1.5 max-w-[22ch] text-[clamp(27px,3.4vw,34px)] leading-[1.04] font-semibold tracking-[-0.045em]">Know how today is going, from your phone.</h1>
        <p className="mt-3 max-w-[60ch] text-[14.5px] text-muted">
          Live sales for Lotus Coffee: every KHQR payment, best sellers and busy hours. Scan the QR, order a drink, and watch the numbers move.
        </p>
      </section>

      <div lang={lang} className="mt-7">
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-bold tracking-[-0.02em]">{pick(T.cafe, lang)}</h2>
            <p className="text-[12.5px] text-muted tabular-nums">
              {at === null ? (
                "\u00a0"
              ) : (
                <>
                  {dayLabel(at, lang)} · {hhmm(at)}
                  <span className="mx-1.5">·</span>
                  {pick(T.ui.updatesLive, lang)}
                </>
              )}
            </p>
          </div>
          <LangToggle lang={lang} onChange={setLang} tone="paper" />
        </div>

        {at === null ? (
          <Skeleton />
        ) : (
          <Dashboard sales={sales} at={at} lang={lang} room={room} origin={origin} status={status} fresh={fresh} />
        )}
      </div>
    </main>
  );
}

/** Ids of live orders that arrived after the first snapshot, each kept for GLOW_MS. */
function useFreshIds(live: Sale[], status: RoomStatus): Set<string> {
  const seen = useRef<Set<string> | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    if (status !== "live" && seen.current === null) return;
    if (seen.current === null) {
      seen.current = new Set(live.map((s) => s.id));
      return;
    }
    const added = live.filter((s) => !seen.current!.has(s.id)).map((s) => s.id);
    if (!added.length) return;
    for (const id of added) seen.current.add(id);
    setFresh((f) => new Set([...f, ...added]));
    timers.current.push(setTimeout(() => setFresh((f) => new Set([...f].filter((id) => !added.includes(id)))), GLOW_MS));
  }, [live, status]);

  return fresh;
}

type DashProps = { sales: Sale[]; at: number; lang: Lang; room: string | null; origin: string; status: RoomStatus; fresh: Set<string> };

function Dashboard({ sales, at, lang, room, origin, status, fresh }: DashProps) {
  const t = (x: Text) => pick(x, lang);
  const today = startOfDay(at);
  const k = useMemo(() => kpis(sales, at), [sales, at]);
  const hours = useMemo(() => byHour(sales, at), [sales, at]);
  const days = useMemo(() => byDay(sales, at, 14), [sales, at]);
  const top = useMemo(() => topItems(sales, today, at + 1, 5), [sales, today, at]);
  const report = useMemo(() => dailyReport(sales, today - DAY_MS), [sales, today]);
  const feed = useMemo(() => sales.filter((s) => s.at <= at).slice(-6).reverse(), [sales, at]);

  const hourCols: Column[] = hours.map((h) => {
    const range = `${String(h.hour).padStart(2, "0")}:00–${String(h.hour + 1).padStart(2, "0")}:00`;
    return {
      label: String(h.hour),
      value: h.today,
      compare: h.yesterday,
      tip: (
        <>
          <b className="font-semibold tabular-nums">{range}</b>
          <span className="block tabular-nums">
            {t(T.ui.today)} <b className="font-semibold">{usd(h.today)}</b>
            <span className="text-muted"> · </span>
            {t(T.ui.yesterday)} <b className="font-semibold">{usd(h.yesterday)}</b>
          </span>
        </>
      ),
      cells: [range, usd(h.today), usd(h.yesterday)],
    };
  });
  const hourIdx = hourOf(at) - 7;
  const yesterdayTotal = hours.reduce((a, h) => a + h.yesterday, 0);

  const dayCols: Column[] = days.map((d) => ({
    label: String(dayOfMonth(d.start)),
    value: d.revenue,
    tip: (
      <>
        <b className="font-semibold">{dayLabel(d.start, lang)}</b>
        <span className="block tabular-nums">
          <b className="font-semibold">{usd(d.revenue)}</b>
          <span className="text-muted"> · </span>
          {d.orders} {t(T.ui.ordersLower)}
        </span>
      </>
    ),
    cells: [dayLabel(d.start, lang), usd(d.revenue), String(d.orders)],
  }));
  const daysTotal = days.reduce((a, d) => a + d.revenue, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="grid grid-cols-2 gap-3 lg:col-span-3 lg:grid-cols-4">
        <Kpi id="sales" label={t(T.ui.salesToday)} value={usd(k.today.revenue)} sub={`${khr(k.today.revenue)}៛`} change={k.change.revenue} lang={lang} />
        <Kpi id="orders" label={t(T.ui.orders)} value={String(k.today.orders)} change={k.change.orders} lang={lang} />
        <Kpi id="avg" label={t(T.ui.avgOrder)} value={usd(k.today.avg)} change={k.change.avg} lang={lang} />
        <div data-kpi="khqr" className={`${card} flex flex-col`}>
          <p className="text-[12.5px] text-muted">{t(T.ui.khqrShare)}</p>
          <p className="mt-1 text-[26px] leading-none font-semibold tracking-[-0.03em] tabular-nums sm:text-[30px] lg:text-[32px]">{k.today.revenue > 0 ? pct(k.khqrShare) : "—"}</p>
          <div className="mt-auto pt-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-line" role="presentation">
              <div className="h-full rounded-full bg-accent" style={{ width: pct(k.khqrShare) }} />
            </div>
          </div>
        </div>
      </div>

      {/* Desktop: charts stacked on the left, best sellers + live orders on the right. Phones: one column in reading order. */}
      <div className="contents lg:col-span-2 lg:flex lg:flex-col lg:gap-4">
      <section className={`${card} order-1 flex flex-col lg:flex-1`}>
        <h2 className={cardTitle}>{t(T.ui.salesByHour)}</h2>
        <Legend items={[{ kind: "bar", label: t(T.ui.today) }, { kind: "line", label: t(T.ui.yesterday) }]} />
        <div className="mt-3 flex flex-1 flex-col">
          <ColumnChart
            grow
            columns={hourCols}
            highlight={hourIdx}
            highlightKind="value"
            ariaLabel={`${t(T.ui.salesByHour)}: ${t(T.ui.today)} ${usd(k.today.revenue)}, ${t(T.ui.yesterday)} ${usd(yesterdayTotal)}`}
            caption={t(T.ui.salesByHour)}
            head={[t(T.ui.hour), t(T.ui.today), t(T.ui.yesterday)]}
          />
        </div>
      </section>

      <section className={`${card} order-3 flex flex-col lg:flex-1`}>
        <h2 className={cardTitle}>{t(T.ui.last14Days)}</h2>
        <div className="mt-3 flex flex-1 flex-col">
          <ColumnChart
            grow
            columns={dayCols}
            highlight={dayCols.length - 1}
            highlightKind="partial"
            highlightLabel={t(T.ui.todaySoFar)}
            keepLabel="last"
            ariaLabel={`${t(T.ui.last14Days)}: ${usd(daysTotal)}`}
            caption={t(T.ui.last14Days)}
            head={[t(T.ui.day), t(T.ui.sales), t(T.ui.orders)]}
          />
        </div>
      </section>
      </div>

      <div className="contents lg:flex lg:flex-col lg:gap-4">
      <section className={`${card} order-2`}>
        <h2 className={cardTitle}>{t(T.ui.bestSellersToday)}</h2>
        {top.length === 0 ? (
          <p className="mt-3 text-[13px] text-muted">{t(T.ui.noSalesYet)}</p>
        ) : (
          <ol className="mt-3 flex flex-col gap-3">
            {top.map((it) => (
              <li key={it.itemId}>
                <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
                  <span className="min-w-0 truncate">{t(it.name)}</span>
                  <span className="shrink-0 text-[12.5px] text-muted tabular-nums">
                    ×{it.qty} · {usd(it.revenue)}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-paper">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(it.qty / top[0].qty) * 100}%` }} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <LiveCard feed={feed} lang={lang} room={room} origin={origin} status={status} fresh={fresh} />
      </div>

      <section className="order-5 grid gap-4 rounded-[18px] bg-ink p-4 text-[12.5px] text-ink-fg sm:grid-cols-2 lg:col-span-3">
        <div>
          <div className="mb-1.5 text-[11.5px] text-ink-muted">{t(T.ui.telegramLabel)}</div>
          <div data-report className="rounded-[4px_14px_14px_14px] bg-[#1d241e] px-3 py-2.5 leading-[1.55] tabular-nums">
            <b>
              {t(T.cafe)} · {dayLabel(today - DAY_MS, lang)}
            </b>
            <br />
            {t(T.ui.sales)} {usd(report.revenue)}
            {report.change !== null && ` (${changeLabel(report.change)} ${t(T.ui.vsDayBefore)})`}
            <br />
            {report.orders} {t(T.ui.ordersLower)} · {t(T.ui.average)} {usd(report.avg)}
            {report.best && (
              <>
                <br />
                {t(T.ui.bestSeller)}: {t(report.best.name)} ×{report.best.qty}
              </>
            )}
            <br />
            KHQR {pct(report.khqrShare)} · {t(T.ui.cash)} {pct(1 - report.khqrShare)}
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-[11.5px] text-ink-muted">{t(T.ui.builtIn)}</div>
          <ul className="leading-[1.9]">
            {T.builtIn.map((b) => (
              <li key={b.en}>{t(b)}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function Kpi({ id, label, value, sub, change, lang }: { id: string; label: string; value: string; sub?: string; change: number | null; lang: Lang }) {
  const c = changeLabel(change);
  return (
    <div data-kpi={id} className={card}>
      <p className="text-[12.5px] text-muted">{label}</p>
      <p className="mt-1 text-[26px] leading-none font-semibold tracking-[-0.03em] tabular-nums sm:text-[30px] lg:text-[32px]">{value}</p>
      {sub && <p className="mt-1 text-[11.5px] text-muted tabular-nums">{sub}</p>}
      <p className="mt-2 text-[12px] leading-snug">
        {c === null ? (
          <span className="text-muted">—</span>
        ) : (
          <>
            <b className="font-semibold whitespace-nowrap tabular-nums">{c}</b> <span className="text-muted">{pick(T.ui.vsYesterday, lang)}</span>
          </>
        )}
      </p>
    </div>
  );
}

function Legend({ items }: { items: { kind: "bar" | "line"; label: string }[] }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          {i.kind === "bar" ? <span aria-hidden="true" className="size-2.5 rounded-[3px] bg-accent" /> : <span aria-hidden="true" className="h-0.5 w-3.5 rounded-full bg-line-strong" />}
          {i.label}
        </span>
      ))}
    </div>
  );
}

function itemsSummary(s: Sale, lang: Lang): string {
  return s.lines.map((l) => `${l.qty > 1 ? `${l.qty}× ` : ""}${pick(l.name, lang)}`).join(", ");
}

function LiveCard({ feed, lang, room, origin, status, fresh }: { feed: Sale[]; lang: Lang; room: string | null; origin: string; status: RoomStatus; fresh: Set<string> }) {
  const t = (x: Text) => pick(x, lang);
  const menuUrl = room && origin ? `${origin}/table-order/menu?room=${room}&table=${TABLE}` : "";
  const link = "underline underline-offset-2 hover:text-accent";

  return (
    <section data-live-feed className={`${card} order-4`}>
      <h2 className={cardTitle}>{t(T.ui.liveOrders)}</h2>

      {status === "closed" ? (
        <div className="mt-3 rounded-[14px] border border-line bg-paper/50 p-3.5 text-[13px]">
          <p className="font-semibold">{t(T.ui.closedTitle)}</p>
          <a href="/shop-pulse" className={`mt-1 inline-block text-accent ${link}`}>
            {t(T.ui.startNew)}
          </a>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-3.5 rounded-[14px] border border-line p-3">
          <div className="grid size-[112px] shrink-0 place-items-center">
            {menuUrl ? (
              <a href={menuUrl} target="_blank" rel="noopener" data-menu-url={menuUrl} aria-label={t(T.ui.openMenuHere)}>
                <Qr value={menuUrl} label={t(T.ui.menuQrLabel)} className="w-[112px]" />
              </a>
            ) : (
              <div className="size-full rounded-xl bg-paper" />
            )}
          </div>
          <div className="min-w-0 text-[12.5px]">
            <p className="text-[13.5px] leading-snug font-semibold">{t(T.ui.scanToOrder)}</p>
            <p className="mt-1.5">
              <a href={menuUrl || undefined} target="_blank" rel="noopener" className={`text-muted ${link}`}>
                {t(T.ui.openMenuHere)}
              </a>
            </p>
            {room && (
              <p className="mt-1">
                <a href={`/table-order?room=${room}`} className={`text-muted ${link}`}>
                  {t(T.ui.kitchenView)}
                </a>
              </p>
            )}
          </div>
        </div>
      )}

      <ul className="mt-3 flex flex-col gap-1">
        {feed.map((s) => {
          const glow = s.live && fresh.has(s.id);
          return (
            <li
              key={s.id}
              data-sale={s.id}
              className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 rounded-[12px] px-2 py-1.5 transition-shadow duration-1000 ${
                glow ? "animate-[ticket-in_.4s_var(--ease-out-expo)] ring-2 ring-accent/35" : ""
              }`}
            >
              <span className="pt-px text-[12.5px] text-muted tabular-nums">{hhmm(s.at)}</span>
              <span className="min-w-0">
                <b className="block text-[13.5px] font-semibold">
                  {t(T.ui.table)} {s.table}
                </b>
                <span className="block truncate text-[12.5px] text-muted">{itemsSummary(s, lang)}</span>
              </span>
              <span className="flex flex-col items-end gap-1">
                <b className="text-[13.5px] font-semibold tabular-nums">{usd(s.total)}</b>
                <span className="rounded-full border border-line px-1.5 text-[11px] leading-[16px] text-muted">{s.payment === "khqr" ? t(T.ui.khqr) : t(T.ui.cash)}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Same layout as the dashboard, in paper blocks, until the client knows the time. */
function Skeleton() {
  const block = (cls: string) => <div className={`rounded-[8px] bg-paper ${cls}`} />;
  const shell = (cls: string, children: ReactNode) => <div className={`${card} ${cls}`}>{children}</div>;
  return (
    <div aria-hidden="true" className="grid gap-4 lg:grid-cols-3">
      <div className="grid grid-cols-2 gap-3 lg:col-span-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i}>{shell("", <>{block("h-3 w-20")}{block("mt-2.5 h-7 w-24")}{block("mt-3 h-3 w-full")}</>)}</div>
        ))}
      </div>
      {shell("lg:col-span-2", <>{block("h-4 w-28")}{block("mt-4 h-[150px] sm:h-[180px]")}</>)}
      {shell("", <>{block("h-4 w-32")}{[0, 1, 2, 3, 4].map((i) => <div key={i}>{block("mt-4 h-3 w-full")}</div>)}</>)}
      {shell("lg:col-span-2", <>{block("h-4 w-24")}{block("mt-4 h-[150px] sm:h-[180px]")}</>)}
      {shell("", <>{block("h-4 w-24")}{block("mt-3 h-[138px]")}</>)}
      <div className="h-[150px] rounded-[18px] bg-ink lg:col-span-3" />
    </div>
  );
}
