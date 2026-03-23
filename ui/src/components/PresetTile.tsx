import { useState, type CSSProperties } from "react";

export interface PresetData {
  id: string;
  name: string;
  desc: string;
  accent: string;
  bri: number;
}

interface Props {
  preset: PresetData;
  isActive: boolean;
  isOn: boolean;
  onTap: (id: string) => void;
}

/** Parse "#RRGGBB" → {r, g, b} */
function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

export default function PresetTile({ preset, isActive, isOn, onTap }: Props) {
  const [pressed, setPressed] = useState(false);
  const active = isActive && isOn;
  const { r, g, b } = hexToRgb(preset.accent);
  const featured = preset.id === "velvet";

  const tileStyle: CSSProperties = {
    position: "relative",
    background: active
      ? `linear-gradient(135deg, rgba(${r},${g},${b},0.12) 0%, var(--surface) 100%)`
      : "var(--surface)",
    borderRadius: 14,
    padding: 16,
    cursor: "pointer",
    userSelect: "none",
    WebkitTapHighlightColor: "transparent",
    border: active
      ? `1px solid rgba(${r},${g},${b},0.35)`
      : "1px solid var(--border)",
    boxShadow: active
      ? `0 0 24px rgba(${r},${g},${b},0.15), 0 0 48px rgba(${r},${g},${b},0.06), inset 0 1px 0 rgba(${r},${g},${b},0.1)`
      : "0 1px 3px rgba(0,0,0,0.3)",
    transform: pressed ? "scale(0.96)" : "scale(1)",
    transition:
      "transform 0.15s cubic-bezier(0.25,0.46,0.45,0.94), background 0.6s ease, border 0.4s ease, box-shadow 0.6s ease",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    overflow: "hidden",
    gridColumn: featured ? "1 / -1" : undefined,
    minHeight: featured ? 72 : 80,
    justifyContent: "center",
  };

  return (
    <div
      style={tileStyle}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      onClick={() => onTap(preset.id)}
    >
      {/* Indicator dot + name */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: active ? preset.accent : `${preset.accent}55`,
            boxShadow: active ? `0 0 8px ${preset.accent}88` : "none",
            transition: "all 0.4s ease",
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: featured ? 15 : 13,
            fontWeight: 700,
            letterSpacing: "0.14em",
            color: active ? "var(--text)" : "var(--text-muted)",
            transition: "color 0.4s ease",
          }}
        >
          {preset.name}
        </span>
      </div>

      {/* Description */}
      <span
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 10,
          letterSpacing: "0.03em",
          color: active ? `${preset.accent}cc` : "var(--text-dim)",
          transition: "color 0.4s ease",
          paddingLeft: 16,
        }}
      >
        {preset.desc}
      </span>
    </div>
  );
}
