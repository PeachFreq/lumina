import { type CSSProperties } from "react";

interface Props {
  isOn: boolean;
  accent: string;
  label: string; // e.g. "RELAX", "CUSTOM", "OFF"
}

export default function StateIndicator({ isOn, accent, label }: Props) {
  const dotStyle: CSSProperties = {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: isOn ? accent : "var(--text-dim)",
    boxShadow: isOn ? `0 0 10px ${accent}88, 0 0 20px ${accent}44` : "none",
    transition: "all 0.6s ease",
    animation: isOn ? "subtlePulse 3s ease-in-out infinite" : "none",
  };

  return (
    <div
      style={{
        paddingTop: 56,
        paddingBottom: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        animation: "fadeIn 0.5s ease both",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={dotStyle} />
        <span
          style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: 18,
            fontWeight: 800,
            letterSpacing: "0.22em",
            color: "var(--text)",
          }}
        >
          LUMINA
        </span>
      </div>
      <span
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 10,
          color: "var(--text-dim)",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </span>
    </div>
  );
}
