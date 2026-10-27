"use client";

import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { usd } from "@/lib/money";

export type Column = {
  /** x-axis label. */
  label: string;
  value: number;
  /** Second series (yesterday), drawn as a step line. */
  compare?: number;
  /** Tooltip body. */
  tip: ReactNode;
  /** Row of the screen-reader table: the first cell is the row header. */
  cells: string[];
};

type Props = {
  columns: Column[];
  /** Column that gets the emphasis: its value above it ("value"), or a lighter outlined bar with `highlightLabel` ("partial"). */
  highlight?: number | null;
  highlightKind?: "value" | "partial";
  highlightLabel?: string;
  /** On narrow charts every 2nd x label is dropped; keep the first or the last one. */
  keepLabel?: "first" | "last";
  /** Grow taller than the default height to fill a flex column (desktop). */
  grow?: boolean;
  ariaLabel: string;
  caption: string;
  head: string[];
};

const PAD = { top: 22, right: 2, bottom: 22, left: 40 };
const GAP = 2;

/** Rounded step so that 3 steps cover `max`: 1, 2, 2.5 or 5 times a power of ten. */
function niceStep(max: number): number {
  if (max <= 0) return 10;
  const raw = max / 3;
  const pow = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow * 3 >= max) return m * pow;
  return 10 * pow;
}

const tick = (v: number) => `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/** Column bar with 4px rounded top corners and a flat bottom. */
function barPath(x: number, y: number, w: number, bottom: number): string {
  const h = bottom - y;
  const r = Math.max(0, Math.min(4, w / 2, h));
  return `M${x},${bottom}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${bottom}Z`;
}

/** SVG column chart sized to its container, with an optional step line, hover/keyboard tooltip and an sr-only table. */
export function ColumnChart({ columns, highlight = null, highlightKind = "value", highlightLabel, keepLabel = "first", grow = false, ariaLabel, caption, head }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [boxH, setBoxH] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = wrap.current!;
    setW(el.clientWidth);
    setBoxH(el.clientHeight);
    const ro = new ResizeObserver(([e]) => {
      setW(e.contentRect.width);
      setBoxH(e.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const narrow = w < 480;
  const H = Math.max(narrow ? 150 : 180, grow ? Math.floor(boxH) : 0);
  const n = columns.length;
  const plotW = Math.max(0, w - PAD.left - PAD.right);
  const plotH = H - PAD.top - PAD.bottom;
  const colW = n ? plotW / n : 0;
  const barW = Math.max(1, colW - GAP);
  const top = Math.max(0, ...columns.map((c) => Math.max(c.value, c.compare ?? 0)));
  const step = niceStep(top);
  const max = step * 3;
  const base = PAD.top + plotH;
  const y = (v: number) => PAD.top + plotH * (1 - v / max);
  const colX = (i: number) => PAD.left + i * colW;
  const hasCompare = columns.some((c) => c.compare !== undefined);
  const showLabel = (i: number) => !narrow || (keepLabel === "first" ? i % 2 === 0 : (n - 1 - i) % 2 === 0);

  // Place the tooltip above the active column, clamped inside the chart.
  useLayoutEffect(() => {
    const el = tipRef.current;
    if (!el || active === null) return;
    const c = columns[active];
    const tw = el.offsetWidth;
    const th = el.offsetHeight;
    const cx = colX(active) + colW / 2;
    const above = Math.min(y(c.value), c.compare !== undefined ? y(c.compare) : base);
    el.style.left = `${Math.max(0, Math.min(w - tw, cx - tw / 2))}px`;
    el.style.top = `${Math.max(0, above - th - 8)}px`;
    el.style.visibility = "visible";
  });

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setActive((a) => {
      if (a === null) return highlight ?? (e.key === "ArrowLeft" ? n - 1 : 0);
      return Math.max(0, Math.min(n - 1, a + (e.key === "ArrowLeft" ? -1 : 1)));
    });
  };

  let stepLine = "";
  if (hasCompare)
    columns.forEach((c, i) => {
      const cy = y(c.compare ?? 0);
      stepLine += i === 0 ? `M${colX(0)},${cy}` : `V${cy}`;
      stepLine += `H${colX(i) + colW}`;
    });

  const hl = highlight !== null && highlight >= 0 && highlight < n ? highlight : null;

  return (
    <>
      <div
        ref={wrap}
        tabIndex={0}
        role="img"
        aria-label={ariaLabel}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
        className={`relative ${grow ? "flex-1" : ""}`}
        style={grow ? { minHeight: narrow ? 150 : 180 } : { height: H }}
      >
        {w > 0 && (
          <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} aria-hidden="true" className="absolute inset-0 block select-none">
            {active !== null && <rect x={colX(active)} y={PAD.top} width={colW} height={plotH} fill="var(--paper)" opacity={0.6} />}
            {[1, 2, 3].map((k) => (
              <g key={k}>
                <line x1={PAD.left} x2={w - PAD.right} y1={y(step * k)} y2={y(step * k)} stroke="var(--line)" strokeWidth={1} />
                <text x={PAD.left - 6} y={y(step * k)} dy="0.35em" textAnchor="end" fontSize={11} fill="var(--muted)" className="tabular-nums">
                  {tick(step * k)}
                </text>
              </g>
            ))}
            <line x1={PAD.left} x2={w - PAD.right} y1={base} y2={base} stroke="var(--line-strong)" strokeWidth={1} />

            {columns.map((c, i) => {
              if (c.value <= 0) return null;
              const x = colX(i) + GAP / 2;
              if (i === hl && highlightKind === "partial")
                return (
                  <path
                    key={i}
                    d={barPath(x + 0.75, y(c.value) + 0.75, barW - 1.5, base)}
                    fill="color-mix(in srgb, var(--accent) 45%, var(--surface))"
                    stroke="var(--accent)"
                    strokeWidth={1.5}
                  />
                );
              return <path key={i} d={barPath(x, y(c.value), barW, base)} fill="var(--accent)" />;
            })}

            {hasCompare && <path d={stepLine} fill="none" stroke="var(--line-strong)" strokeWidth={2} strokeLinejoin="round" />}

            {hl !== null && (() => {
              const c = columns[hl];
              const label = highlightKind === "partial" ? highlightLabel : c.value > 0 ? usd(c.value) : null;
              if (!label) return null;
              const partial = highlightKind === "partial";
              // The partial label sits in the band above the plot so it never cuts through taller neighbours.
              const ly = partial ? 12 : Math.max(11, y(c.value) - 6);
              // A value wider than its column starts at the bar and runs over the (still empty) later hours.
              const wide = !partial && colW < 46;
              const atEnd = wide && colX(hl) + 46 > w - PAD.right;
              const anchor = partial || atEnd ? "end" : wide ? "start" : "middle";
              const lx = anchor === "end" ? colX(hl) + colW - GAP / 2 : anchor === "start" ? colX(hl) + GAP / 2 : colX(hl) + colW / 2;
              return (
                <text
                  x={lx}
                  y={ly}
                  textAnchor={anchor}
                  fontSize={11}
                  fontWeight={600}
                  fill="var(--fg)"
                  stroke="var(--surface)"
                  strokeWidth={3}
                  paintOrder="stroke"
                  className="tabular-nums"
                >
                  {label}
                </text>
              );
            })()}

            {columns.map((c, i) =>
              showLabel(i) ? (
                <text key={i} x={colX(i) + colW / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--muted)" className="tabular-nums">
                  {c.label}
                </text>
              ) : null,
            )}

            {columns.map((_, i) => (
              <rect key={i} x={colX(i)} y={0} width={colW} height={H} fill="transparent" onPointerEnter={() => setActive(i)} onPointerDown={() => setActive(i)} />
            ))}
          </svg>
        )}

        {active !== null && columns[active] && (
          <div
            ref={tipRef}
            data-chart-tip
            className="pointer-events-none absolute z-10 rounded-[10px] border border-line bg-surface px-2.5 py-1.5 text-[12px] leading-[1.45] whitespace-nowrap shadow-[0_6px_20px_rgba(20,26,21,0.12)]"
            style={{ left: 0, top: 0, visibility: "hidden" }}
          >
            {columns[active].tip}
          </div>
        )}
      </div>

      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {columns.map((c, i) => (
            <tr key={i}>
              <th scope="row">{c.cells[0]}</th>
              {c.cells.slice(1).map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
