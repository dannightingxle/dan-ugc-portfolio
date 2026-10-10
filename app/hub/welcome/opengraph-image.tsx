import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { BRAND } from "../_lib/brand";

/* The preview card shown when the landing page is shared on socials. */

export const alt = `${BRAND.name} - ${BRAND.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const dir = join(process.cwd(), "app/hub/_assets");
  const [regular, bold] = await Promise.all([readFile(join(dir, "PlusJakartaSans-500.ttf")), readFile(join(dir, "PlusJakartaSans-800.ttf"))]);
  const tile = (label: string, value: string, color = "#0f172a") => (
    <div style={{ display: "flex", flexDirection: "column", background: "#fff", border: "2px solid #e2e8f0", borderRadius: 22, padding: "22px 26px", width: 250 }}>
      <div style={{ fontSize: 22, color: "#64748b" }}>{label}</div>
      <div style={{ fontSize: 46, fontWeight: 800, color, marginTop: 6 }}>{value}</div>
    </div>
  );

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#f7f9fc", padding: 72, fontFamily: "Jakarta" }}>
        <div style={{ display: "flex", fontSize: 40, fontWeight: 800, letterSpacing: -1.5 }}>
          <span style={{ color: "#0f172a" }}>{BRAND.logo[0]}</span>
          <span style={{ color: "#2563eb", marginLeft: 12 }}>{BRAND.logo[1]}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 76, fontWeight: 800, color: "#0f172a", letterSpacing: -3, lineHeight: 1.05 }}>Run your UGC business</div>
          <div style={{ fontSize: 76, fontWeight: 800, color: "#0f172a", letterSpacing: -3, lineHeight: 1.05 }}>from one desk.</div>
          <div style={{ fontSize: 30, color: "#475569", marginTop: 22 }}>Brand deals, briefs, invoices and the ads you&apos;re in.</div>
        </div>
        <div style={{ display: "flex", gap: 20 }}>
          {tile("Earned", "£4,850", "#047857")}
          {tile("Awaiting payment", "£1,400")}
          {tile("Ad reach", "12.1M")}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Jakarta", data: regular, style: "normal", weight: 500 },
        { name: "Jakarta", data: bold, style: "normal", weight: 800 },
      ],
    },
  );
}
