"use client";

import { useEffect, useState } from "react";
import { pick, type Lang, type Text } from "@/lib/i18n";
import { counterName, MAX_COUNTERS } from "../../admin";
import { saveCounters, type AdminFail } from "../../admin-api";
import { T } from "../../km";
import type { CounterConfig } from "../../types";
import { btnPrimary, btnSecondary, card, input, Switch } from "./parts";

type Props = { room: string; counters: CounterConfig[]; lang: Lang; onFail: (f: AdminFail) => boolean };
type Row = { en: string; km: string; open: boolean };

const toRows = (counters: CounterConfig[]): Row[] => counters.map((c) => ({ en: c.name.en, km: c.name.km, open: c.open }));

/** 1-4 counters, each with a name in both languages and an Open/Closed switch. Saved all at once, numbered by position. */
export function CountersTab({ room, counters, lang, onFail }: Props) {
  const t = (x: Text) => pick(x, lang);
  const [rows, setRows] = useState<Row[]>(() => toRows(counters));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ rows: number[]; text: Text } | null>(null);
  const [saved, setSaved] = useState(false);

  // Live counters (another tab, a reset) replace the form unless the owner is mid-edit.
  useEffect(() => {
    if (!dirty) setRows(toRows(counters));
  }, [counters, dirty]);

  const change = (next: Row[]) => {
    setRows(next);
    setDirty(true);
    setSaved(false);
    setError(null);
  };
  const set = (i: number, patch: Partial<Row>) => change(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = async () => {
    const blank = rows.flatMap((r, i) => (r.en.trim() ? [] : [i]));
    if (blank.length) return setError({ rows: blank, text: T.admin.errCounterName });
    setBusy(true);
    setError(null);
    const r = await saveCounters(room, rows.map((x) => ({ name: { en: x.en.trim(), km: x.km.trim() || x.en.trim() }, open: x.open })));
    setBusy(false);
    if (r.ok) {
      setDirty(false);
      setRows(toRows(r.value));
      setSaved(true);
      return;
    }
    if (onFail(r)) return;
    setError({ rows: [], text: r.error === "invalid" && r.field === "name" ? T.admin.errCounterName : T.admin.errFailed });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="min-w-0 text-[13px] text-muted">{t(T.admin.countersHint)}</p>
        <button
          type="button"
          onClick={() => {
            const n = rows.length + 1;
            change([...rows, { ...counterName(n), open: true }]);
          }}
          disabled={rows.length >= MAX_COUNTERS}
          className={`${btnPrimary} inline-flex shrink-0 items-center gap-1.5`}
        >
          <span aria-hidden="true" className="text-[18px] leading-none font-normal">+</span>
          {t(T.admin.addCounter)}
        </button>
      </div>

      <ul className={`${card} divide-y divide-line`}>
        {rows.map((r, i) => {
          const bad = !!error?.rows.includes(i);
          return (
            <li key={i} data-admin-counter={i + 1} className="flex flex-col gap-3 p-3.5 sm:p-4">
              <div className="flex items-center gap-3">
                <span className={`grid size-10 shrink-0 place-items-center rounded-[12px] bg-paper text-[16px] font-bold tabular-nums ${r.open ? "" : "text-muted"}`}>{i + 1}</span>
                <b className={`min-w-0 flex-1 truncate text-[14.5px] font-semibold ${r.open ? "" : "text-muted"}`}>{pick({ en: r.en, km: r.km || r.en }, lang) || "—"}</b>
                {i === rows.length - 1 && rows.length > 1 && (
                  <button type="button" onClick={() => change(rows.slice(0, -1))} className="min-h-10 shrink-0 px-1 text-[13px] text-muted underline underline-offset-2 hover:text-fg">
                    {t(T.admin.removeCounter)}
                  </button>
                )}
                <Switch compact on={r.open} onChange={(open) => set(i, { open })} label={t(r.open ? T.admin.open : T.admin.closed)} />
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`counter-${i}-en`} className="text-[12.5px] font-semibold text-muted">{t(T.admin.nameEn)}</label>
                  <input id={`counter-${i}-en`} className={input} value={r.en} maxLength={20} onChange={(e) => set(i, { en: e.target.value })} aria-invalid={bad} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`counter-${i}-km`} className="text-[12.5px] font-semibold text-muted">{t(T.admin.nameKm)}</label>
                  <input id={`counter-${i}-km`} lang="km" className={input} value={r.km} maxLength={20} onChange={(e) => set(i, { km: e.target.value })} />
                </div>
              </div>
              {bad && <p role="alert" className="text-[12.5px] font-medium text-khqr">{t(error!.text)}</p>}
            </li>
          );
        })}
      </ul>

      {error && !error.rows.length && <p role="alert" className="text-[12.5px] font-medium text-khqr">{t(error.text)}</p>}
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={busy || !dirty} className={btnPrimary}>{busy ? t(T.admin.saving) : t(T.admin.save)}</button>
        {dirty && <button type="button" onClick={() => { setDirty(false); setRows(toRows(counters)); setError(null); }} className={btnSecondary}>{t(T.admin.cancel)}</button>}
        {saved && !dirty && <p role="status" className="text-[13px] text-muted">{t(T.admin.saved)}</p>}
      </div>
    </div>
  );
}
