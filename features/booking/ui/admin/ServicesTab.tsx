"use client";

import { useState } from "react";
import { btnPrimary, btnSecondary, card, Field, MoneyStepper, Segments, Sheet, Switch } from "@/components/admin/parts";
import { pick, type Lang, type Text } from "@/lib/i18n";
import { DURATIONS } from "../../admin";
import { updateService, type AdminFail } from "../../admin-api";
import { T } from "../../km";
import type { Service } from "../../types";
import { dollars } from "../format";

type Props = { room: string; services: Service[]; lang: Lang; onFail: (f: AdminFail) => boolean };

const minutes = (n: number, lang: Lang) => `${n} ${pick(T.min, lang)}`;

/** The salon's menu: each service's price, duration and whether customers can book it, edited in a sheet. */
export function ServicesTab({ room, services, lang, onFail }: Props) {
  const t = (x: Text) => pick(x, lang);
  const [editing, setEditing] = useState<string | null>(null);
  const current = editing ? services.find((s) => s.id === editing) : null;

  return (
    <div>
      <ul className={`${card} divide-y divide-line`}>
        {services.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              data-admin-service={s.id}
              onClick={() => setEditing(s.id)}
              className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors first:rounded-t-[20px] last:rounded-b-[20px] hover:bg-paper/50"
            >
              <span className="min-w-0 flex-1">
                <b className={`block truncate text-[14.5px] font-semibold ${s.hidden ? "text-muted" : ""}`}>{t(T.services[s.id])}</b>
                <span className="flex flex-wrap items-center gap-x-2 text-[13px] text-muted">
                  <span className="tabular-nums">{minutes(s.minutes, lang)}</span>
                  {s.hidden && <span className="rounded-full border border-line px-1.5 text-[11.5px] leading-[18px]">{t(T.admin.hidden)}</span>}
                </span>
              </span>
              <b className={`shrink-0 text-[14.5px] font-semibold tabular-nums ${s.hidden ? "text-muted" : ""}`}>{dollars(s.price)}</b>
              <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
            </button>
          </li>
        ))}
      </ul>
      {current && <EditSheet key={current.id} room={room} service={current} lang={lang} onFail={onFail} onClose={() => setEditing(null)} />}
    </div>
  );
}

function EditSheet({ room, service, lang, onFail, onClose }: { room: string; service: Service; lang: Lang; onFail: (f: AdminFail) => boolean; onClose: () => void }) {
  const t = (x: Text) => pick(x, lang);
  const [price, setPrice] = useState(service.price);
  const [mins, setMins] = useState(service.minutes);
  const [hidden, setHidden] = useState(!!service.hidden);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field?: string; text: Text } | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    const r = await updateService(room, { id: service.id, price, minutes: mins, hidden });
    setBusy(false);
    if (r.ok) return onClose();
    if (onFail(r)) return;
    setError({ field: r.field, text: r.field === "price" ? T.admin.errPrice : r.field === "minutes" ? T.admin.errMinutes : T.admin.errFailed });
  };
  const err = (f: string) => (error?.field === f ? t(error.text) : null);

  return (
    <Sheet
      title={t(T.admin.editService)}
      onClose={onClose}
      closeLabel={t(T.admin.close)}
      footer={
        <div className="flex flex-col gap-2">
          {error && !["price", "minutes"].includes(error.field ?? "") && <p role="alert" className="text-[12.5px] font-medium text-khqr">{t(error.text)}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onClose} className={btnSecondary}>{t(T.admin.cancel)}</button>
            <button type="button" onClick={save} disabled={busy} className={btnPrimary}>{busy ? t(T.admin.saving) : t(T.admin.save)}</button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[15px] font-semibold">{t(T.services[service.id])}</p>
        <Field label={t(T.admin.price)} htmlFor="service-price" hint={t(T.admin.priceHint)} error={err("price")}>
          <div>
            <MoneyStepper id="service-price" label={t(T.admin.price)} value={price} onChange={setPrice} min={0.5} max={500} step={0.5} less={t(T.admin.less)} more={t(T.admin.more)} invalid={!!err("price")} />
          </div>
        </Field>
        <Field label={t(T.admin.duration)} error={err("minutes")}>
          <Segments value={mins} onChange={setMins} label={t(T.admin.duration)} options={DURATIONS.map((n) => ({ value: n, label: minutes(n, lang) }))} />
        </Field>
        <div className="rounded-[14px] border border-line px-3">
          <Switch on={hidden} onChange={setHidden} label={t(T.admin.hide)} hint={t(T.admin.hideHint)} />
        </div>
      </div>
    </Sheet>
  );
}
