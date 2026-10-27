import { ImageResponse } from "next/og";

export const alt = "Raevori Studio live demos: Don't read about it. Try it on your phone.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Social preview: cream page, ink headline, sage labels. Uses the bundled default font (no remote fetch). */
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f4f1e8",
          color: "#141a15",
          padding: "72px 80px",
        }}
      >
        <div style={{ display: "flex", fontSize: 30, color: "#5f7d48", fontWeight: 600 }}>Raevori Studio · live demos</div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 92, fontWeight: 600, letterSpacing: "-0.05em", lineHeight: 1.05 }}>
          <span>Don&apos;t read about it.</span>
          <span>Try it on your phone.</span>
        </div>
        <div style={{ display: "flex", fontSize: 30, color: "#5f7d48" }}>demo.raevori.com</div>
      </div>
    ),
    size,
  );
}
