import QRCode from "qrcode";

/** QR modules as rows of booleans (true = dark). Synchronous, so it renders on the server and the client alike. */
export function qrModules(value: string): boolean[][] {
  const { modules } = QRCode.create(value, { errorCorrectionLevel: "M" });
  const rows: boolean[][] = [];
  for (let y = 0; y < modules.size; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < modules.size; x++) row.push(!!modules.get(x, y));
    rows.push(row);
  }
  return rows;
}

/** One SVG path drawing every dark module, with a 2-module quiet zone. */
export function qrPath(rows: boolean[][]): { d: string; size: number } {
  let d = "";
  rows.forEach((row, y) => row.forEach((on, x) => { if (on) d += `M${x + 2} ${y + 2}h1v1h-1z`; }));
  return { d, size: rows.length + 4 };
}

export async function qrSvg(value: string): Promise<string> {
  const { d, size } = qrPath(qrModules(value));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><path d="${d}"/></svg>`;
}
