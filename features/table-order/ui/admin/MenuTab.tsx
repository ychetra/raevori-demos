"use client";

import { useState } from "react";
import { pick, type Lang, type Text } from "@/lib/i18n";
import { usd } from "@/lib/money";
import { CATEGORIES } from "../../admin";
import { addItem, updateItem, type AdminFail, type ItemPatch } from "../../admin-api";
import { T } from "../../km";
import { DEFAULT_ART } from "../../menu";
import type { Category, MenuItem } from "../../types";
import { artTile, MenuArt } from "../MenuArt";
import { btnPrimary, btnSecondary, card, Field, input, itemFieldError, MoneyStepper, plusUsd, Segments, Sheet, Switch } from "./parts";

type Props = { room: string; menu: MenuItem[]; lang: Lang; onFail: (f: AdminFail) => boolean };

/** Drink colours for an added item: the menu's own fills. */
const COLOURS = ["#8a5a36", "#b98557", "#3b2a1e", "#d9c3a5", "#86a35d", "#d8c37a", "#d98b4a", "#f2b33d", "#d0457a", "#6f8fb8"];

/** Items by category, each with a Sold out switch; tap a row to edit, or add an item. */
export function MenuTab({ room, menu, lang, onFail }: Props) {
  const t = (x: Text) => pick(x, lang);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // A switch flips at once; the menu event confirms it a moment later.
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [rowError, setRowError] = useState<string | null>(null);

  const toggleSoldOut = async (item: MenuItem, soldOut: boolean) => {
    setRowError(null);
    setPending((p) => ({ ...p, [item.id]: soldOut }));
    const r = await updateItem(room, { id: item.id, soldOut });
    setPending(({ [item.id]: _, ...rest }) => rest);
    if (!r.ok && !onFail(r)) setRowError(item.id);
  };

  const current = editing ? menu.find((m) => m.id === editing) : null;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted">{menu.length} / 60</p>
        <button type="button" onClick={() => setAdding(true)} className={`${btnPrimary} inline-flex items-center gap-1.5`}>
          <span aria-hidden="true" className="text-[18px] leading-none font-normal">+</span>
          {t(T.admin.addItem)}
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {CATEGORIES.map((cat) => {
          const items = menu.filter((m) => m.cat === cat);
          if (!items.length) return null;
          return (
            <section key={cat} aria-label={t(T.cats[cat])} className="min-w-0">
              <h3 className="mb-1.5 px-1 text-[12.5px] font-semibold text-muted">{t(T.cats[cat])}</h3>
              <ul className={`${card} divide-y divide-line`}>
                {items.map((m) => {
                  const soldOut = pending[m.id] ?? !!m.soldOut;
                  return (
                    <li key={m.id} data-admin-item={m.id} className="flex items-center gap-2 py-1.5 pr-3 pl-1.5">
                      <button type="button" onClick={() => setEditing(m.id)} className="flex min-w-0 flex-1 items-center gap-3 rounded-[14px] p-1.5 text-left transition-colors hover:bg-paper/60">
                        <span className={`grid size-12 shrink-0 place-items-center rounded-[12px] ${soldOut || m.hidden ? "opacity-50" : ""}`} style={{ background: artTile(m.image) }}>
                          <MenuArt image={m.image} className="h-8 w-7" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <b className={`block truncate text-[14.5px] font-semibold ${soldOut || m.hidden ? "text-muted" : ""}`}>{t(m.name)}</b>
                          <span className="flex flex-wrap items-center gap-x-2 text-[13px] text-muted">
                            <span className="tabular-nums">{usd(m.price)}</span>
                            {m.hidden && <span className="rounded-full border border-line px-1.5 text-[11.5px] leading-[18px]">{t(T.admin.hidden)}</span>}
                          </span>
                          {rowError === m.id && <span role="alert" className="block text-[12px] text-khqr">{t(T.admin.errFailed)}</span>}
                        </span>
                      </button>
                      <Switch compact on={soldOut} onChange={(on) => toggleSoldOut(m, on)} label={t(T.admin.soldOut)} />
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      {current && <EditSheet key={current.id} room={room} item={current} lang={lang} onFail={onFail} onClose={() => setEditing(null)} />}
      {adding && <AddSheet room={room} lang={lang} onFail={onFail} onClose={() => setAdding(false)} />}
    </div>
  );
}

const sameDrinkKind = (a: Category, b: Category) => (a === "bakery") === (b === "bakery");

function EditSheet({ room, item, lang, onFail, onClose }: { room: string; item: MenuItem; lang: Lang; onFail: (f: AdminFail) => boolean; onClose: () => void }) {
  const t = (x: Text) => pick(x, lang);
  const [nameEn, setNameEn] = useState(item.name.en);
  const [nameKm, setNameKm] = useState(item.name.km);
  const [noteEn, setNoteEn] = useState(item.note?.en ?? "");
  const [noteKm, setNoteKm] = useState(item.note?.km ?? "");
  const [price, setPrice] = useState(item.price);
  const [cat, setCat] = useState<Category>(item.cat);
  const [deltas, setDeltas] = useState<Record<string, Record<string, number>>>(() =>
    Object.fromEntries(item.options.map((g) => [g.id, Object.fromEntries(g.choices.map((c) => [c.id, c.delta]))])),
  );
  const [hidden, setHidden] = useState(!!item.hidden);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field?: string; text: Text } | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    const patch: ItemPatch = {
      id: item.id,
      name: { en: nameEn.trim(), km: nameKm.trim() || nameEn.trim() },
      note: noteEn.trim() || noteKm.trim() ? { en: noteEn.trim(), km: noteKm.trim() } : null,
      price,
      cat,
      // A drink moved to Bakery (or back) needs art of the new kind.
      ...(!sameDrinkKind(cat, item.cat) && { image: DEFAULT_ART[cat] }),
      options: deltas,
      hidden,
    };
    const r = await updateItem(room, patch);
    setBusy(false);
    if (r.ok) return onClose();
    if (onFail(r)) return;
    setError({ field: r.field, text: r.error === "invalid" ? itemFieldError(r.field) : T.admin.errFailed });
  };
  const err = (f: string) => (error?.field === f ? t(error.text) : null);

  return (
    <Sheet
      title={t(T.admin.editItem)}
      onClose={onClose}
      lang={lang}
      footer={
        <div className="flex flex-col gap-2">
          {error && !["name", "note", "price", "cat", "options", "image"].includes(error.field ?? "") && <p role="alert" className="text-[12.5px] font-medium text-khqr">{t(error.text)}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onClose} className={btnSecondary}>{t(T.admin.cancel)}</button>
            <button type="button" onClick={save} disabled={busy} className={btnPrimary}>{busy ? t(T.admin.saving) : t(T.admin.save)}</button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="grid size-14 shrink-0 place-items-center rounded-[14px]" style={{ background: artTile(sameDrinkKind(cat, item.cat) ? item.image : DEFAULT_ART[cat]) }}>
            <MenuArt image={sameDrinkKind(cat, item.cat) ? item.image : DEFAULT_ART[cat]} className="h-9 w-8" />
          </span>
          <p className="min-w-0 text-[15px] font-semibold">{t(item.name)}</p>
        </div>
        <Field label={t(T.admin.nameEn)} htmlFor="name-en" error={err("name")}>
          <input id="name-en" className={input} value={nameEn} maxLength={40} onChange={(e) => setNameEn(e.target.value)} aria-invalid={!!err("name")} />
        </Field>
        <Field label={t(T.admin.nameKm)} htmlFor="name-km" hint={t(T.admin.nameKmHint)}>
          <input id="name-km" lang="km" className={input} value={nameKm} maxLength={40} onChange={(e) => setNameKm(e.target.value)} aria-invalid={!!err("name")} />
        </Field>
        <Field label={`${t(T.admin.noteEn)} · ${t(T.admin.optional)}`} htmlFor="note-en" error={err("note")}>
          <input id="note-en" className={input} value={noteEn} maxLength={120} onChange={(e) => setNoteEn(e.target.value)} aria-invalid={!!err("note")} />
        </Field>
        <Field label={`${t(T.admin.noteKm)} · ${t(T.admin.optional)}`} htmlFor="note-km">
          <input id="note-km" lang="km" className={input} value={noteKm} maxLength={120} onChange={(e) => setNoteKm(e.target.value)} />
        </Field>
        <Field label={t(T.admin.price)} htmlFor="price" error={err("price")}>
          <div><MoneyStepper id="price" label={t(T.admin.price)} value={price} onChange={setPrice} min={0.25} lang={lang} invalid={!!err("price")} /></div>
        </Field>
        <Field label={t(T.admin.category)} error={err("cat") ?? err("image")}>
          <Segments value={cat} onChange={setCat} label={t(T.admin.category)} options={CATEGORIES.map((c) => ({ value: c, label: t(T.cats[c]) }))} />
        </Field>

        {item.options.some((g) => g.choices.length > 1) && (
          <details className="rounded-[14px] border border-line px-3 open:pb-3" open={error?.field === "options" || undefined}>
            <summary className="flex min-h-11 cursor-pointer items-center text-[14px] font-medium">{t(T.admin.optionPrices)}</summary>
            <p className="text-[12.5px] text-muted">{t(T.admin.optionPricesHint)}</p>
            {err("options") && <p role="alert" className="mt-1 text-[12.5px] font-medium text-khqr">{err("options")}</p>}
            {item.options.map((g) => (
              <fieldset key={g.id} className="mt-3">
                <legend className="text-[12.5px] font-semibold text-muted">{t(g.name)}</legend>
                <ul className="mt-1 flex flex-col gap-1">
                  {g.choices.map((c) => {
                    const v = deltas[g.id]?.[c.id] ?? 0;
                    return (
                      <li key={c.id} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 text-[14px]">
                          {t(c.name)} <span className="text-muted tabular-nums">{plusUsd(v)}</span>
                        </span>
                        <MoneyStepper value={v} min={0} lang={lang} label={`${t(g.name)} ${t(c.name)}`} onChange={(n) => setDeltas((d) => ({ ...d, [g.id]: { ...d[g.id], [c.id]: n } }))} />
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            ))}
          </details>
        )}

        <div className="rounded-[14px] border border-line px-3">
          <Switch on={hidden} onChange={setHidden} label={t(T.admin.hide)} hint={t(T.admin.hideHint)} />
        </div>
      </div>
    </Sheet>
  );
}

function AddSheet({ room, lang, onFail, onClose }: { room: string; lang: Lang; onFail: (f: AdminFail) => boolean; onClose: () => void }) {
  const t = (x: Text) => pick(x, lang);
  const [nameEn, setNameEn] = useState("");
  const [nameKm, setNameKm] = useState("");
  const [price, setPrice] = useState(2);
  const [cat, setCat] = useState<Category>("coffee");
  const [vessel, setVessel] = useState<"cup" | "mug">("cup");
  const [colour, setColour] = useState(COLOURS[1]);
  const [pastry, setPastry] = useState<"croissant" | "loaf">("croissant");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field?: string; text: Text } | null>(null);
  const image = cat === "bakery" ? pastry : `${vessel}:${colour}`;

  const save = async () => {
    setBusy(true);
    setError(null);
    const r = await addItem(room, { name: { en: nameEn.trim(), km: nameKm.trim() || nameEn.trim() }, price, cat, image });
    setBusy(false);
    if (r.ok) return onClose();
    if (onFail(r)) return;
    setError({ field: r.field, text: r.error === "invalid" ? itemFieldError(r.field) : r.error === "too_many_items" ? T.admin.errTooMany : T.admin.errFailed });
  };
  const err = (f: string) => (error?.field === f ? t(error.text) : null);

  return (
    <Sheet
      title={t(T.admin.addItem)}
      onClose={onClose}
      lang={lang}
      footer={
        <div className="flex flex-col gap-2">
          {error && !["name", "price", "cat", "image"].includes(error.field ?? "") && <p role="alert" className="text-[12.5px] font-medium text-khqr">{t(error.text)}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onClose} className={btnSecondary}>{t(T.admin.cancel)}</button>
            <button type="button" onClick={save} disabled={busy} className={btnPrimary}>{busy ? t(T.admin.saving) : t(T.admin.add)}</button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t(T.admin.nameEn)} htmlFor="new-name-en" error={err("name")}>
          <input id="new-name-en" className={input} value={nameEn} maxLength={40} onChange={(e) => setNameEn(e.target.value)} aria-invalid={!!err("name")} />
        </Field>
        <Field label={t(T.admin.nameKm)} htmlFor="new-name-km" hint={t(T.admin.nameKmHint)}>
          <input id="new-name-km" lang="km" className={input} value={nameKm} maxLength={40} onChange={(e) => setNameKm(e.target.value)} />
        </Field>
        <Field label={t(T.admin.price)} htmlFor="new-price" error={err("price")}>
          <div><MoneyStepper id="new-price" label={t(T.admin.price)} value={price} onChange={setPrice} min={0.25} lang={lang} invalid={!!err("price")} /></div>
        </Field>
        <Field label={t(T.admin.category)} error={err("cat")}>
          <Segments value={cat} onChange={setCat} label={t(T.admin.category)} options={CATEGORIES.map((c) => ({ value: c, label: t(T.cats[c]) }))} />
        </Field>
        <Field label={t(T.admin.picture)} error={err("image")}>
          <div className="flex items-start gap-3">
            <span className="grid size-[72px] shrink-0 place-items-center rounded-[16px]" style={{ background: artTile(image) }}>
              <MenuArt image={image} className="h-11 w-10" />
            </span>
            <div className="flex min-w-0 flex-col gap-2.5">
              {cat === "bakery" ? (
                <Segments value={pastry} onChange={setPastry} label={t(T.admin.picture)} options={[{ value: "croissant", label: t(T.admin.croissant) }, { value: "loaf", label: t(T.admin.loaf) }]} />
              ) : (
                <>
                  <Segments value={vessel} onChange={setVessel} label={t(T.admin.picture)} options={[{ value: "cup", label: t(T.admin.cup) }, { value: "mug", label: t(T.admin.mug) }]} />
                  <div role="radiogroup" aria-label={t(T.admin.colour)} className="flex flex-wrap gap-1.5">
                    {COLOURS.map((c, i) => (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={colour === c}
                        aria-label={`${t(T.admin.colour)} ${i + 1}`}
                        onClick={() => setColour(c)}
                        className={`grid size-10 place-items-center rounded-[10px] border-2 transition-colors ${colour === c ? "border-fg" : "border-transparent hover:border-line-strong"}`}
                        style={{ background: artTile(`cup:${c}`) }}
                      >
                        <MenuArt image={`${vessel}:${c}`} className="h-6 w-5" />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </Field>
      </div>
    </Sheet>
  );
}
