import { ImageResponse } from "next/og";

/* Home-screen icon when a creator adds Creator Desk to their phone. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  const bar = (width: number) => <div style={{ width, height: 18, borderRadius: 9, background: "#fff" }} />;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: "#2563eb", display: "flex", flexDirection: "column", justifyContent: "center", gap: 14, paddingLeft: 46 }}>
        {bar(88)}
        {bar(60)}
        {bar(88)}
      </div>
    ),
    size,
  );
}
