import { useState, useEffect, useCallback } from "react";
import "./styles/globals.css";
import "./styles/presets.css";
import StateIndicator from "./components/StateIndicator";
import PresetGrid from "./components/PresetGrid";
import CustomPanel from "./components/CustomPanel";
import { activatePreset, togglePower, setCustom, getState, type BulbState } from "./api";
import { type PresetData } from "./components/PresetTile";

/* ─── Preset definitions (mirrored from backend for instant UI) ─── */

const PRESETS: PresetData[] = [
  { id: "morning", name: "MORNING", desc: "warm white · 3000K", accent: "#F5C882", bri: 70 },
  { id: "reading", name: "READING", desc: "neutral white · 4500K", accent: "#B8CCE4", bri: 90 },
  { id: "relax", name: "RELAX", desc: "warm amber · 2500K", accent: "#E8A64C", bri: 35 },
  { id: "dim", name: "DIM", desc: "low ambient · 2700K", accent: "#C49A52", bri: 15 },
  { id: "sleep", name: "SLEEP", desc: "red-orange · near dark", accent: "#D4391C", bri: 5 },
  { id: "cinema", name: "CINEMA", desc: "ember glow · 2700K", accent: "#C47A12", bri: 2 },
  { id: "velvet", name: "VELVET", desc: "fuchsia · mood", accent: "#E5006A", bri: 32 },
];

/** Parse "#RRGGBB" → {r, g, b} */
function hexToRgb(hex: string) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export default function App() {
  const [activePresetId, setActivePresetId] = useState("relax");
  const [isOn, setIsOn] = useState(true);
  const [isCustom, setIsCustom] = useState(false);
  const [showCustomPanel, setShowCustomPanel] = useState(false);
  const [customValues, setCustomValues] = useState({ hue: 280, sat: 80, bri: 50, kelvin: 3500 });

  /* ─── Derive accent color ─── */

  const activePreset = PRESETS.find((p) => p.id === activePresetId);
  const accent = !isOn
    ? "#4A4460"
    : isCustom
      ? hslToHex(customValues.hue, customValues.sat, Math.max(30, customValues.bri * 0.6))
      : activePreset?.accent || "#4A4460";
  const { r: ar, g: ag, b: ab } = hexToRgb(accent);

  /* ─── Sync from backend on mount ─── */

  useEffect(() => {
    getState()
      .then((s: BulbState) => {
        setIsOn(s.power);
        if (s.active_preset) setActivePresetId(s.active_preset);
        if (s.mode === "custom" && s.custom) {
          setIsCustom(true);
          setCustomValues(s.custom);
        }
      })
      .catch(() => {
        /* Backend unreachable — use defaults */
      });
  }, []);

  /* ─── Status label ─── */

  const statusLabel = !isOn ? "OFF" : isCustom ? "CUSTOM" : activePresetId.toUpperCase();

  /* ─── Handlers (optimistic updates, fire-and-forget API calls) ─── */

  const handlePreset = useCallback((id: string) => {
    setActivePresetId(id);
    setIsCustom(false);
    setIsOn(true);
    activatePreset(id).catch(console.error);
  }, []);

  const handleOff = useCallback(() => {
    setIsOn((prev) => !prev);
    togglePower().catch(console.error);
  }, []);

  const handleApplyCustom = useCallback(() => {
    setIsCustom(true);
    setIsOn(true);
    setShowCustomPanel(false);
    setCustom(customValues).catch(console.error);
  }, [customValues]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--bg)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ─── Noise texture overlay ─── */}
      <svg
        style={{
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 100,
          opacity: 0.035,
        }}
      >
        <filter id="lumina-noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#lumina-noise)" />
      </svg>

      {/* ─── Ambient color wash (primary) ─── */}
      <div
        style={{
          position: "fixed",
          top: "25%",
          left: "50%",
          width: 400,
          height: 400,
          background: `radial-gradient(circle, rgba(${ar},${ag},${ab},${isOn ? 0.1 : 0}) 0%, transparent 70%)`,
          transform: "translate(-50%, -50%)",
          filter: "blur(80px)",
          transition: "background 1.2s ease",
          pointerEvents: "none",
          zIndex: 0,
          animation: isOn ? "breathe 6s ease-in-out infinite" : "none",
        }}
      />

      {/* ─── Ambient color wash (secondary) ─── */}
      <div
        style={{
          position: "fixed",
          bottom: "-10%",
          left: "50%",
          width: 500,
          height: 300,
          background: `radial-gradient(ellipse, rgba(${ar},${ag},${ab},${isOn ? 0.06 : 0}) 0%, transparent 70%)`,
          transform: "translateX(-50%)",
          filter: "blur(60px)",
          transition: "background 1.2s ease",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* ─── Main content column ─── */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "0 20px",
          maxWidth: 430,
          margin: "0 auto",
          width: "100%",
        }}
      >
        <StateIndicator isOn={isOn} accent={accent} label={statusLabel} />

        <PresetGrid
          presets={PRESETS}
          activeId={activePresetId}
          isOn={isOn}
          isCustom={isCustom}
          onSelect={handlePreset}
        />

        {/* Flexible spacer */}
        <div style={{ flex: 1, minHeight: 16 }} />

        {/* Off button */}
        <div style={{ animation: "fadeIn 0.6s ease both 0.2s", paddingBottom: 10 }}>
          <button
            onClick={handleOff}
            style={{
              width: "100%",
              padding: "14px 0",
              background: !isOn ? `rgba(${ar},${ag},${ab},0.1)` : "transparent",
              border: `1px solid ${!isOn ? `rgba(${ar},${ag},${ab},0.3)` : "var(--border)"}`,
              borderRadius: 12,
              color: !isOn ? accent : "var(--text-muted)",
              fontFamily: "'Syne', sans-serif",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.18em",
              cursor: "pointer",
              transition: "all 0.3s ease",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {isOn ? "OFF" : "TAP TO WAKE"}
          </button>
        </div>

        {/* Custom trigger */}
        <div style={{ animation: "fadeIn 0.6s ease both 0.3s", paddingBottom: 36 }}>
          <button
            onClick={() => setShowCustomPanel(true)}
            style={{
              width: "100%",
              padding: "12px 0",
              background: "transparent",
              border: "none",
              color: "var(--text-dim)",
              fontFamily: "'DM Mono', monospace",
              fontSize: 11,
              letterSpacing: "0.08em",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>↑</span>
            CUSTOM
          </button>
        </div>
      </div>

      {/* ─── Custom panel bottom sheet ─── */}
      <CustomPanel
        isOpen={showCustomPanel}
        values={customValues}
        onChange={setCustomValues}
        onApply={handleApplyCustom}
        onClose={() => setShowCustomPanel(false)}
      />
    </div>
  );
}
