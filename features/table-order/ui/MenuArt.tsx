/** Flat illustrations for menu items, drawn in the brand palette. `image` is `cup:<fill>`, `mug:<fill>`, `croissant` or `loaf`. */
export function MenuArt({ image, className = "" }: { image: string; className?: string }) {
  const [kind, fill = "#b98557"] = image.split(":");
  if (kind === "croissant")
    return (
      <svg viewBox="0 0 40 30" className={className} aria-hidden="true">
        <path d="M3 21C8 6 32 6 37 21c-4 4-30 4-34 0z" fill="#d9a65a" />
        <path d="M11 11l3 12M20 9v14M29 11l-3 12" stroke="#b07a35" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  if (kind === "loaf")
    return (
      <svg viewBox="0 0 40 30" className={className} aria-hidden="true">
        <rect x="5" y="8" width="30" height="17" rx="6" fill="#a8743f" />
        <path d="M9 9c3-4 19-4 22 0" stroke="#7c5228" strokeWidth="2" fill="none" />
        <path d="M14 14h12" stroke="#c99a63" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  if (kind === "mug")
    return (
      <svg viewBox="0 0 40 34" className={className} aria-hidden="true">
        <path d="M6 9h22v14a8 8 0 0 1-8 8h-6a8 8 0 0 1-8-8z" fill="#fbfaf5" stroke="#d9cfbf" strokeWidth="1.2" />
        <path d="M28 12h3a4 4 0 0 1 0 8h-3" stroke="#d9cfbf" strokeWidth="2.4" fill="none" />
        <ellipse cx="17" cy="11" rx="10" ry="2.4" fill={fill} />
        <path d="M13 3c-1 2 1 3 0 5M19 2c-1 2 1 3 0 5" stroke="#cbc4b4" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      </svg>
    );
  return (
    <svg viewBox="0 0 30 36" className={className} aria-hidden="true">
      <path d="M5 7h20l-2.5 25a2 2 0 0 1-2 1.8h-11a2 2 0 0 1-2-1.8z" fill="#ece3d4" />
      <path d="M5.8 14h18.4l-1.8 18a2 2 0 0 1-2 1.8h-11a2 2 0 0 1-2-1.8z" fill={fill} />
      <rect x="3" y="4" width="24" height="4" rx="2" fill="#fbfaf5" stroke="#e0dbcd" strokeWidth=".8" />
      <path d="M18 0v6" stroke="#5f7d48" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Soft tile colour behind an illustration. */
export const artTile = (image: string) => {
  const fill = image.split(":")[1];
  return fill ? `color-mix(in srgb, ${fill} 18%, #f4f1e8)` : "#f3e6d6";
};
