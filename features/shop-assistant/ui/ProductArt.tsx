import type { ReactNode } from "react";

/** Flat product illustrations, drawn in the selected colour. `kind` is the catalog's `image` key. */
export function ProductArt({ kind, hex, className = "" }: { kind: string; hex: string; className?: string }) {
  const dark = luminance(hex) < 0.45;
  const detail = dark ? "rgba(255,255,255,.28)" : "rgba(20,26,21,.22)";
  const edge = dark ? "none" : "rgba(20,26,21,.18)";
  const body = { fill: hex, stroke: edge, strokeWidth: 0.8, strokeLinejoin: "round" as const };
  const line = { stroke: detail, strokeWidth: 1.2, strokeLinecap: "round" as const, fill: "none" };

  const shapes: Record<string, ReactNode> = {
    shirt: <><path {...body} d="M14 6 8 8 2 17l5 4 3-3v26h20V18l3 3 5-4-6-9-6-2c-1 3-11 3-12 0z" /><path {...line} d="M20 9v35M14 6l6 5 6-5" /></>,
    tee: <><path {...body} d="M14 6 8 8 3 15l5 3 2-2v28h20V16l2 2 5-3-5-7-6-2c-1 3-11 3-12 0z" /><path {...line} d="M15 7c2 3 8 3 10 0" /></>,
    blouse: <><path {...body} d="M14 6 9 8 4 18l5 2 2-3 -1 27h20l-1-27 2 3 5-2-5-10-5-2-6 8z" /><path {...line} d="M20 14v4M12 30c5 2 11 2 16 0" /></>,
    jacket: <><path {...body} d="M14 5 7 8 3 44h8l1-24 1 24h14l1-24 1 24h8L33 8l-7-3-6 9z" /><path {...line} d="M20 14v30M14 5l3 10M26 5l-3 10" /></>,
    dress: <><path {...body} d="M15 4h10l1 9-3 4 11 27H6l11-27-3-4z" /><path {...line} d="M14 17h12" /></>,
    maxi: <><path {...body} d="M15 3h10l1 8-3 4 9 31H8l9-31-3-4z" /><path {...line} d="M15 15h10" /></>,
    skirt: <><path {...body} d="M11 8h18l7 32H4z" /><path {...line} d="M11 12h18M16 12l-4 28M24 12l4 28" /></>,
    trousers: <><path {...body} d="M10 4h20l3 41h-9l-4-28-4 28H7z" /><path {...line} d="M10 9h20" /></>,
    jeans: <><path {...body} d="M11 4h18l2 41h-8l-3-28-3 28H9z" /><path {...line} d="M11 9h18M14 9c0 4 3 5 5 5" /></>,
    shorts: <><path {...body} d="M9 10h22l3 22H23l-3-11-3 11H6z" /><path {...line} d="M9 15h22" /></>,
    tote: <><path {...line} stroke={hex} strokeWidth={2.4} d="M14 18c0-10 12-10 12 0" /><path {...body} d="M7 17h26l-2 25H9z" /></>,
    handbag: <><path {...line} stroke={hex} strokeWidth={2.6} d="M13 18c0-9 14-9 14 0" /><path {...body} d="M9 17h22l4 23H5z" /><path {...line} d="M5 27h30" /></>,
    crossbody: <><path {...line} stroke={hex} strokeWidth={1.6} d="M9 24 21 3 31 24" /><rect {...body} x="8" y="22" width="24" height="17" rx="5" /><path {...line} d="M8 29h24" /></>,
    backpack: <><path {...line} stroke={hex} strokeWidth={2.4} d="M15 10c0-6 10-6 10 0" /><rect {...body} x="8" y="9" width="24" height="34" rx="8" /><rect {...line} x="12" y="27" width="16" height="10" rx="3" /></>,
    sneaker: <><path {...body} d="M3 27c0-5 3-10 8-10 3 0 4 4 9 5l11 3c4 1 6 4 6 8v3H3z" /><path {...line} d="M3 33h34M13 19l3 5M17 21l2 3" /></>,
    sandal: <><path {...body} d="M3 33c0-3 2-4 6-4h24c3 0 5 1 5 4v3H3z" /><path {...line} stroke={hex} strokeWidth={2.4} d="M10 29c2-8 8-8 10 0M22 29c1-5 6-5 8 0" /></>,
    heel: <><path {...body} d="M4 26c4-1 8 3 12 6h14c3 0 5 1 5 4H6c-2 0-3-2-3-4z" /><path {...body} d="M5 26c-1 4 0 10 2 12h3l-1-11z" /></>,
    scarf: <><path {...body} d="M6 10c8-4 20 4 28 0v8c-8 4-20-4-28 0z" /><path {...body} d="M22 16l4 26h-6l-2-24zM14 16l-3 24h5l3-22z" /></>,
    hat: <><ellipse {...body} cx="20" cy="30" rx="18" ry="6" /><path {...body} d="M11 30c0-12 18-12 18 0z" /><path {...line} d="M11 27c6 2 12 2 18 0" /></>,
    earrings: <><path {...line} stroke="#9aa0a3" d="M13 8v8M27 8v8" /><path {...body} d="M13 16c-5 6-5 14 0 16 5-2 5-10 0-16zM27 16c-5 6-5 14 0 16 5-2 5-10 0-16z" /></>,
  };

  return (
    <svg viewBox="0 0 40 48" className={className} aria-hidden="true">
      {shapes[kind] ?? shapes.tee}
    </svg>
  );
}

/** Soft tile behind an illustration, tinted towards the product colour. */
export const artTile = (hex: string) => `color-mix(in srgb, ${hex} 16%, #f4f1e8)`;

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255];
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
