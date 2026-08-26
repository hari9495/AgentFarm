import { ImageResponse } from "next/og";

export const alt = "AgentFarms — AI Workers That Ship With Human Control";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#ffffff",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "72px 80px",
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
        }}
      >
        {/* Top accent bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "4px",
            background: "#0066cc",
          }}
        />

        {/* Logo row */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "52px" }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "10px",
              background: "#0066cc",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <circle cx="11" cy="11" r="9" stroke="white" strokeWidth="2.5" />
              <path d="M7 11h8M11 7v8" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
          <span style={{ color: "#1d1d1f", fontSize: 26, fontWeight: 600, letterSpacing: "-0.5px" }}>
            AgentFarms
          </span>
        </div>

        {/* Headline */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <h1
            style={{
              color: "#1d1d1f",
              fontSize: 60,
              fontWeight: 600,
              lineHeight: 1.07,
              margin: 0,
              marginBottom: 22,
              letterSpacing: "-2px",
            }}
          >
            AI Workers That Ship{" "}
            <span style={{ color: "#0066cc" }}>With Human Control</span>
          </h1>
          <p style={{ color: "#424245", fontSize: 24, margin: 0, lineHeight: 1.47, letterSpacing: "-0.5px" }}>
            13 specialist roles · 18 connectors · approval gates on every high-risk action
          </p>
        </div>

        {/* Bottom stats row */}
        <div
          style={{
            display: "flex",
            gap: "48px",
            marginTop: "48px",
            paddingTop: "28px",
            borderTop: "1px solid #e8e8ed",
          }}
        >
          {[
            { label: "Worker roles", value: "12" },
            { label: "Connectors", value: "18" },
            { label: "Avg deploy time", value: "< 10 min" },
            { label: "Actions audited", value: "100%" },
          ].map((s) => (
            <div key={s.label} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ color: "#0066cc", fontSize: 30, fontWeight: 600, letterSpacing: "-1px" }}>
                {s.value}
              </span>
              <span style={{ color: "#aeaeb2", fontSize: 14 }}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Domain badge bottom-right */}
        <div
          style={{
            position: "absolute",
            bottom: "32px",
            right: "80px",
            fontSize: 14,
            color: "#aeaeb2",
            letterSpacing: "0.5px",
          }}
        >
          agentfarms.in
        </div>
      </div>
    ),
    { ...size }
  );
}
