import { ImageResponse } from "next/og";

export const alt = "AgentFarm — Trusted AI Teammates for Your Engineering Team";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#0f172a",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "80px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Logo row */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "48px" }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: "#2563eb",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
            }}
          >
            ??
          </div>
          <span style={{ color: "#f8fafc", fontSize: 28, fontWeight: 700 }}>AgentFarm</span>
        </div>

        {/* Headline */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <h1
            style={{
              color: "#f8fafc",
              fontSize: 64,
              fontWeight: 800,
              lineHeight: 1.1,
              margin: 0,
              marginBottom: 24,
            }}
          >
            Trusted AI Teammates for Your{" "}
            <span style={{ color: "#2563eb" }}>Engineering Team</span>
          </h1>
          <p style={{ color: "#94a3b8", fontSize: 28, margin: 0 }}>
            Deploy secure AI teammates with approvals,
            <br />
            audit trails, and real delivery outcomes.
          </p>
        </div>

        {/* Stats row */}
        <div style={{ display: "flex", gap: "40px", marginTop: "48px" }}>
          {[
            { label: "Tasks Completed", value: "12,480+" },
            { label: "PRs Merged", value: "3,210+" },
            { label: "Test Coverage", value: "94%" },
          ].map((s) => (
            <div key={s.label} style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ color: "#2563eb", fontSize: 32, fontWeight: 800 }}>{s.value}</span>
              <span style={{ color: "#64748b", fontSize: 16 }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}


