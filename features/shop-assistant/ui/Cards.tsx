"use client";

import { pick, type Lang, type Text } from "@/lib/i18n";
import { usd } from "@/lib/money";
import { ONE_SIZE, type Product, type Zone } from "../catalog";
import { T, type ColorId } from "../km";
import type { Card } from "../model";
import type { ShopOrder } from "../tools";
import { artTile, ProductArt } from "./ProductArt";

const sizeLabel = (s: string, lang: Lang) => (s === ONE_SIZE ? pick(T.oneSize, lang) : s);

/** Cards inside an assistant bubble: products, delivery quote, order with KHQR. */
export function Cards({ cards, lang, paid, onPay }: { cards: Card[]; lang: Lang; paid: Set<string>; onPay: (o: ShopOrder) => void }) {
  return (
    <div lang={lang} className="mt-2 flex flex-col gap-1.5 whitespace-normal">
      {cards.map((c, i) =>
        c.type === "product" ? <ProductCard key={i} product={c.product} color={c.color} lang={lang} />
        : c.type === "delivery" ? <DeliveryCard key={i} zone={c.zone} lang={lang} />
        : <OrderCard key={i} order={c.order} lang={lang} paid={paid.has(c.order.id)} onPay={() => onPay(c.order)} />,
      )}
    </div>
  );
}

function ProductCard({ product, color, lang }: { product: Product; color?: ColorId; lang: Lang }) {
  const shown = product.colors.find((c) => c.id === color) ?? product.colors[0];
  return (
    <div data-card="product" className="flex items-center gap-2.5 rounded-[14px] border border-line bg-surface p-2">
      <span className="grid h-[60px] w-[52px] shrink-0 place-items-center rounded-[10px]" style={{ background: artTile(shown.hex) }}>
        <ProductArt kind={product.image} hex={shown.hex} className="h-11 w-9" />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block text-[13px] leading-tight font-semibold">{pick(product.name, lang)}</b>
        <span className="text-[12px] text-muted tabular-nums">{usd(product.price)}</span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1">
          {product.colors.map((c) => (
            <i
              key={c.id}
              title={pick(c.name, lang)}
              className={`inline-block size-4 rounded-[5px] border border-black/12 ${c.id === shown.id ? "outline-2 outline-offset-1 outline-fg" : ""}`}
              style={{ background: c.hex }}
            />
          ))}
          <span className="ml-1 text-[11px] text-muted">{product.sizes.map((s) => sizeLabel(s, lang)).join(" ")}</span>
        </span>
      </span>
    </div>
  );
}

function DeliveryCard({ zone, lang }: { zone: Zone; lang: Lang }) {
  return (
    <div data-card="delivery" className="flex items-center justify-between gap-3 rounded-[14px] border border-line bg-surface px-3 py-2.5 text-[12.5px]">
      <span className="min-w-0">
        <span className="block text-muted">{pick(T.ui.delivery, lang)} · {pick(zone.name, lang)}</span>
        <span className="text-[11.5px] text-muted">{pick(zone.sameDay ? T.ui.sameDay : T.ui.nextDay, lang)}</span>
      </span>
      <b className="tabular-nums">{usd(zone.price)}</b>
    </div>
  );
}

function OrderCard({ order, lang, paid, onPay }: { order: ShopOrder; lang: Lang; paid: boolean; onPay: () => void }) {
  const t = (x: Text) => pick(x, lang);
  return (
    <div data-card="order" className="rounded-[14px] border border-line bg-surface p-3 text-[12.5px]">
      <div className="mb-1.5 text-[11px] text-muted">{t(T.ui.order)} {order.id} · {order.name}</div>
      {order.lines.map((l, i) => (
        <div key={i} className="flex justify-between gap-3">
          <span className="min-w-0 text-muted">{l.qty > 1 && `${l.qty}× `}{t(l.name)} · {t(l.color.name)} · {sizeLabel(l.size, lang)}</span>
          <span className="tabular-nums">{usd(l.lineTotal)}</span>
        </div>
      ))}
      <div className="mt-0.5 flex justify-between gap-3">
        <span className="text-muted">{t(T.ui.delivery)} · {t(order.zone.name)}</span>
        <span className="tabular-nums">{usd(order.delivery)}</span>
      </div>
      <div className="mt-1.5 flex justify-between border-t border-line pt-1.5 text-[13.5px]">
        <b>{t(T.ui.total)}</b>
        <b className="tabular-nums" data-total>{usd(order.total)}</b>
      </div>
      {paid ? (
        <p className="mt-2 flex items-start gap-2 rounded-[10px] bg-accent/10 px-2.5 py-2 text-[12px] font-medium text-accent">
          <svg viewBox="0 0 24 24" className="mt-px size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
          {t(T.ui.paid)}
        </p>
      ) : (
        <button type="button" onClick={onPay} className="mt-2 min-h-10 w-full rounded-[12px] bg-khqr px-3 text-[13px] font-semibold text-white transition-opacity hover:opacity-90">
          {t(T.ui.payKhqr)} · {usd(order.total)}
        </button>
      )}
    </div>
  );
}
