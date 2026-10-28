"use client";

import { useState } from "react";
import { btnPrimary, btnSecondary, card, Field, halfHours, input, Segments, Sheet, TimeSelect } from "@/components/admin/parts";
import { pick, type Lang, type Text } from "@/lib/i18n";
import { MAX_STYLIST_NAME, MAX_STYLISTS } from "../../admin";
import { addStylist, updateStylist, type AdminFail } from "../../admin-api";
import { T } from "../../km";
import type { SalonSettings, Stylist, Weekday } from "../../types";
import { fill } from "../format";

type Props = { room: string; stylists: Stylist[]; settings: SalonSettings; lang: Lang; onFail: (f: AdminFail) => boolean };

/** Monday first, the way a salon's week reads. */
const WEEK: Weekday[] = [1, 2, 3, 4, 5, 6, 0];
const STARTS = halfHours(0, 48); // 00:00 … 23:30
const ENDS = halfHours(1, 48); // 00:30 … 24:00

const offList = (s: Stylist, lang: Lang) => WEEK.filter((d) => s.daysOff.includes(d)).map((d) => pick(T.weekdays[d], lang)).join(", ");

/** The roster: each stylist's name, hours and days off; add up to 5 (the calendar's columns). */
export function StaffTab({ room, stylists, settings, lang, onFail }: Props) {
  const t = (x: Text) => pick(x, lang);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const current = editing ? stylists.find((s) => s.id === editing) : null;
  const full = stylists.length >= MAX_STYLISTS;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted">{fill(T.admin.staffCount, lang, { n: stylists.length })}</p>
        <button type="button" onClick={() => setAdding(true)} disabled={full} className={`${btnPrimary} inline-flex items-center gap-1.5`}>
          <span aria-hidden="true" className="text-[18px] leading-none font-normal">+</span>
          {t(T.admin.addStylist)}
        </button>
      </div>
      {full && <p className="-mt-2 mb-3 text-right text-[12.5px] text-muted">{t(T.admin.errTooMany)}</p>}

      <ul className={`${card} divide-y divide-line`}>
        {stylists.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              data-admin-stylist={s.id}
              onClick={() => setEditing(s.id)}
              className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors first:rounded-t-[20px] last:rounded-b-[20px] hover:bg-paper/50"
            >
              <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-paper text-[15px] font-semibold">
                {[...pick(s.name, lang)][0]}
              </span>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[14.5px] font-semibold">{pick(s.name, lang)}</b>
                <span className="block text-[13px] text-muted">
                  {s.hours ? <span className="tabular-nums">{s.hours.start}–{s.hours.end}</span> : t(T.admin.salonHours)}
                  {" · "}
                  {s.daysOff.length ? `${t(T.admin.off)}: ${offList(s, lang)}` : t(T.admin.everyDay)}
                </span>
              </span>
              <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
            </button>
          </li>
        ))}
      </ul>

      {current && <StylistSheet key={current.id} room={room} stylist={current} settings={settings} lang={lang} onFail={onFail} onClose={() => setEditing(null)} />}
      {adding && <StylistSheet room={room} stylist={null} settings={settings} lang={lang} onFail={onFail} onClose={() => setAdding(false)} />}
    </div>
  );
}

/** Edit a stylist, or add one when `stylist` is null. */
function StylistSheet({ room, stylist, settings, lang, onFail, onClose }: { room: string; stylist: Stylist | null; settings: SalonSettings; lang: Lang; onFail: (f: AdminFail) => boolean; onClose: () => void }) {
  const t = (x: Text) => pick(x, lang);
  const [nameEn, setNameEn] = useState(stylist?.name.en ?? "");
  const [nameKm, setNameKm] = useState(stylist && stylist.name.km !== stylist.name.en ? stylist.name.km : "");
  // A stylist follows the salon's hours (hours: null) until the owner sets custom ones.
  const [custom, setCustom] = useState(!!stylist?.hours);
  const [start, setStart] = useState(stylist?.hours?.start ?? settings.open);
  const [end, setEnd] = useState(stylist?.hours?.end ?? settings.close);
  const [off, setOff] = useState<Weekday[]>(stylist?.daysOff ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field?: string; text: Text } | null>(null);

  const toggle = (d: Weekday) => setOff((o) => (o.includes(d) ? o.filter((x) => x !== d) : [...o, d]));

  const save = async () => {
    setBusy(true);
    setError(null);
    const body = { name: { en: nameEn.trim(), km: nameKm.trim() || nameEn.trim() }, hours: custom ? { start, end } : null, daysOff: [...off].sort((a, b) => a - b) };
    const r = stylist ? await updateStylist(room, { id: stylist.id, ...body }) : await addStylist(room, body);
    setBusy(false);
    if (r.ok) return onClose();
    if (onFail(r)) return;
    const text = r.field === "name" ? T.admin.errName : r.field === "hours" ? T.admin.errWorkHours : r.error === "too_many_stylists" ? T.admin.errTooMany : T.admin.errFailed;
    setError({ field: r.field, text });
  };
  const err = (f: string) => (error?.field === f ? t(error.text) : null);

  return (
    <Sheet
      title={t(stylist ? T.admin.editStylist : T.admin.addStylist)}
      onClose={onClose}
      closeLabel={t(T.admin.close)}
      footer={
        <div className="flex flex-col gap-2">
          {error && !["name", "hours"].includes(error.field ?? "") && <p role="alert" className="text-[12.5px] font-medium text-khqr">{t(error.text)}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onClose} className={btnSecondary}>{t(T.admin.cancel)}</button>
            <button type="button" onClick={save} disabled={busy || !nameEn.trim()} className={btnPrimary}>{busy ? t(T.admin.saving) : t(stylist ? T.admin.save : T.admin.addStylist)}</button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t(T.admin.nameEn)} htmlFor="stylist-name-en" error={err("name")}>
          <input id="stylist-name-en" className={input} value={nameEn} maxLength={MAX_STYLIST_NAME} onChange={(e) => setNameEn(e.target.value)} aria-invalid={!!err("name")} />
        </Field>
        <Field label={t(T.admin.nameKm)} htmlFor="stylist-name-km" hint={t(T.admin.nameKmHint)}>
          <input id="stylist-name-km" lang="km" className={input} value={nameKm} maxLength={MAX_STYLIST_NAME} onChange={(e) => setNameKm(e.target.value)} />
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-[12.5px] font-semibold text-muted">{t(T.admin.workHours)}</legend>
          <div className="mt-1.5">
            <Segments
              value={custom ? "custom" : "salon"}
              onChange={(v) => setCustom(v === "custom")}
              label={t(T.admin.workHours)}
              options={[
                { value: "salon", label: t(T.admin.salonHours) },
                { value: "custom", label: t(T.admin.customHours) },
              ]}
            />
          </div>
          {custom ? (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <Field label={t(T.admin.starts)} htmlFor="stylist-start">
                  <TimeSelect id="stylist-start" value={start} times={STARTS} onChange={setStart} invalid={!!err("hours")} />
                </Field>
                <Field label={t(T.admin.ends)} htmlFor="stylist-end">
                  <TimeSelect id="stylist-end" value={end} times={ENDS} onChange={setEnd} invalid={!!err("hours")} />
                </Field>
              </div>
              {err("hours") ? <p role="alert" className="text-[12.5px] font-medium text-khqr">{err("hours")}</p> : <p className="text-[12px] text-muted">{t(T.admin.workHoursHint)}</p>}
            </>
          ) : (
            <p className="text-[12px] text-muted">{fill(T.admin.salonHoursHint, lang, { h: `${settings.open}–${settings.close}` })}</p>
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-[12.5px] font-semibold text-muted">{t(T.admin.daysOff)}</legend>
          <div className="mt-1.5 grid grid-cols-4 gap-1.5 sm:grid-cols-7 sm:gap-1">
            {WEEK.map((d) => {
              const isOff = off.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={isOff}
                  data-day-off={d}
                  onClick={() => toggle(d)}
                  className={`flex min-h-12 min-w-0 flex-col items-center justify-center rounded-[10px] border px-0.5 text-[12px] leading-tight transition-colors ${isOff ? "border-fg bg-fg text-white" : "border-line hover:border-line-strong"}`}
                >
                  <span className="font-semibold">{pick(T.weekdays[d], lang)}</span>
                  <span className={`text-[10.5px] ${isOff ? "text-white/80" : "text-transparent"}`} aria-hidden={!isOff}>{t(T.admin.off)}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[12px] text-muted">{t(T.admin.daysOffHint)}</p>
        </fieldset>
      </div>
    </Sheet>
  );
}
