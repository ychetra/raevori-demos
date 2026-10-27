import { qrModules, qrPath } from "./qr-svg";

/** Crisp SVG QR code. `label` is read by screen readers. */
export function Qr({ value, label, className = "", color = "#141a15" }: { value: string; label: string; className?: string; color?: string }) {
  const { d, size } = qrPath(qrModules(value));
  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} className={className} shapeRendering="crispEdges">
      <path d={d} fill={color} />
    </svg>
  );
}
