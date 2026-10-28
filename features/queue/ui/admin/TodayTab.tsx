"use client";

import { useEffect, useMemo, useState } from "react";
import { pick, type Lang, type Text } from "@/lib/i18n";
import { counterName, serviceName } from "../../admin";
import { exportUrl, fetchStats, type AdminFail } from "../../admin-api";
import { T } from "../../km";
import type { QueueConfig, QueueStats, Ticket, TicketStatus } from "../../types";
import { btnSecondary, card, ppTime } from "./parts";

type Props = { room: string; tickets: Ticket[]; config: QueueConfig; lang: Lang; onFail: (f: AdminFail) => boolean };

/** Today's numbers (from the server, refreshed as tickets change) and every ticket in the queue, newest first. */
export function TodayTab({ room, tickets, config, lang, onFail }: Props) {
  const t = (x: Text) => pick(x, lang);
  const [stats, setStats] = useState<QueueStats | null>(null);

  // Each ticket event changes the numbers: refetch, batching a burst of events (an auto-call sends several) into one request.
  const key = useMemo(() => tickets.map((x) => `${x.id}:${x.status}`).join(","), [tickets]);
  useEffect(() => {
    let stale = false;
    const id = setTimeout(async () => {
      const r = await fetchStats(room);
      if (stale) return;
      if (r.ok) setStats(r.value);
      else onFail(r);
    }, 250);
    return () => {
      stale = true;
      clearTimeout(id);
    };
  }, [room, key, onFail]);

  const sorted = useMemo(() => [...tickets].sort((a, b) => (b.at.waiting ?? 0) - (a.at.waiting ?? 0)), [tickets]);
  const minutes = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n} ${t(T.admin.min)}`);
  const counter = (n: number) => t(config.counters.find((c) => c.id === n)?.name ?? counterName(n));

  const tiles: { key: string; label: Text; value: string }[] = [
    { key: "served", label: T.admin.served, value: stats ? String(stats.served) : "—" },
    { key: "avg", label: T.admin.avgWait, value: minutes(stats?.avgWait) },
    { key: "longest", label: T.admin.longestWait, value: minutes(stats?.longestWait) },
    { key: "left", label: T.admin.leftQueue, value: stats ? String(stats.left) : "—" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <section aria-label={t(T.admin.todayNote)}>
        <ul className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          {tiles.map((x) => (
            <li key={x.key} data-stat={x.key} className={`${card} min-w-0 p-3.5 sm:p-4`}>
              <p className="text-[12.5px] text-muted">{t(x.label)}</p>
              <p className="mt-1 text-[26px] leading-none font-semibold tracking-[-0.03em] tabular-nums">{x.value}</p>
            </li>
          ))}
        </ul>
        <p className="mt-2 px-1 text-[12px] text-muted">{t(T.admin.todayNote)}</p>
      </section>

      <section aria-labelledby="tickets-title" className="min-w-0">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="tickets-title" className="px-1 text-[15px] font-semibold tracking-[-0.015em]">
            {t(T.admin.tickets)} <span className="font-normal text-muted tabular-nums">{tickets.length}</span>
          </h2>
          <a href={exportUrl(room, lang)} download className={`${btnSecondary} inline-flex items-center justify-center gap-2 whitespace-nowrap`}>
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
            {t(T.admin.download)}
          </a>
        </div>

        {sorted.length === 0 ? (
          <p className={`${card} mt-3 p-5 text-center text-[13.5px] text-muted`}>{t(T.admin.noTickets)}</p>
        ) : (
          <ul className={`${card} mt-3 divide-y divide-line`}>
            {sorted.map((x) => {
              const wait = x.at.called !== undefined && x.at.waiting !== undefined ? Math.round((x.at.called - x.at.waiting) / 60_000) : null;
              const detail = [
                t(serviceName(config.services, x.service)),
                x.at.called !== undefined && x.counter ? `${t(T.admin.calledAt)} ${ppTime(x.at.called)} · ${counter(x.counter)}` : null,
                wait !== null ? `${t(T.admin.waited)} ${wait} ${t(T.admin.min)}` : null,
              ].filter(Boolean);
              return (
                <li key={x.id} data-admin-ticket={x.number} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 px-3.5 py-3">
                  <span className="pt-px text-[12.5px] text-muted tabular-nums">{x.at.waiting !== undefined ? ppTime(x.at.waiting) : ""}</span>
                  <span className="min-w-0">
                    <b className={`block text-[14px] font-semibold tabular-nums ${x.status === "left" ? "text-muted" : ""}`}>{x.number}</b>
                    <span className="block text-[12.5px] break-words text-muted">{detail.join(" · ")}</span>
                  </span>
                  <StatusTag status={x.status} lang={lang} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatusTag({ status, lang }: { status: TicketStatus; lang: Lang }) {
  const strong = status === "called";
  return (
    <span data-ticket-status={status} className={`rounded-full border px-2 text-[11.5px] leading-[20px] whitespace-nowrap ${strong ? "border-fg font-semibold" : "border-line text-muted"}`}>
      {pick(T.admin.status[status], lang)}
    </span>
  );
}
