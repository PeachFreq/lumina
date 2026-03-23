import { useState, useEffect, useRef, useCallback } from "react";

const COLORS = {
  bg: "#0E0C14",
  surface: "#161420",
  surfaceHover: "#1C1828",
  surfaceActive: "#221E30",
  text: "#E8E4F0",
  textMuted: "#7B7490",
  textDim: "#4A4460",
  border: "#2A2636",
};

const PRESETS = [
  { id: "morning",  name: "MORNING",  desc: "warm white · 3000K",     accent: "#F5C882", bri: 70 },
  { id: "reading",  name: "READING",  desc: "neutral white · 4500K",  accent: "#B8CCE4", bri: 90 },
  { id: "relax",    name: "RELAX",    desc: "warm amber · 2500K",     accent: "#E8A64C", bri: 35 },
  { id: "dim",      name: "DIM",      desc: "low ambient · 2700K",    accent: "#C49A52", bri: 15 },
  { id: "sleep",    name: "SLEEP",    desc: "red-orange · near dark",  accent: "#D4391C", bri: 5  },
  { id: "cinema",   name: "CINEMA",   desc: "ember glow · 2700K",     accent: "#C47A12", bri: 2  },
  { id: "velvet",   name: "VELVET",   desc: "fuchsia · mood",         accent: "#E5006A", bri: 32 },
];

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function kelvinToHex(k) {
  const t = k / 100;
  let r, g, b;
  if (t <= 66) { r = 255; g = 99.4708025861 * Math.log(t) - 161.1195681661; b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307; }
  else { r = 329.698727446 * Math.pow(t - 60, -0.1332047592); g = 288.1221695283 * Math.pow(t - 60, -0.0755148492); b = 255; }
  const clamp = (v) => Math.min(255, Math.max(0, Math.round(v)));
  return `#${clamp(r).toString(16).padStart(2,"0")}${clamp(g).toString(16).padStart(2,"0")}${clamp(b).toString(16).padStart(2,"0")}`;
}

function Slider({ label, value, min, max, suffix, accent, onChange }) {
  const trackRef = useRef(null);
  const dragging = useRef(false);

  const pct = ((value - min) / (max - min)) * 100;

  const update = useCallback((clientX) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const raw = min + ratio * (max - min);
    const step = max > 1000 ? 100 : 1;
    onChange(Math.round(raw / step) * step);
  }, [min, max, onChange]);

  const handleStart = useCallback((e) => {
    dragging.current = true;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    update(clientX);
  }, [update]);

  useEffect(() => {
    const handleMove = (e) => {
      if (!dragging.current) return;
      e.preventDefault();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      update(clientX);
    };
    const handleEnd = () => { dragging.current = false; };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleEnd);
    window.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("touchend", handleEnd);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleEnd);
    };
  }, [update]);

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: "0.08em", color: COLORS.textMuted, textTransform: "uppercase" }}>{label}</span>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: COLORS.text }}>{value}{suffix}</span>
      </div>
      <div
        ref={trackRef}
        onMouseDown={handleStart}
        onTouchStart={handleStart}
        style={{ position: "relative", height: 32, cursor: "pointer", display: "flex", alignItems: "center", touchAction: "none" }}
      >
        <div style={{ position: "absolute", left: 0, right: 0, height: 3, borderRadius: 2, background: COLORS.border }} />
        <div style={{ position: "absolute", left: 0, width: `${pct}%`, height: 3, borderRadius: 2, background: accent, transition: dragging.current ? "none" : "width 0.1s ease" }} />
        <div style={{
          position: "absolute", left: `${pct}%`, transform: "translateX(-50%)",
          width: 18, height: 18, borderRadius: "50%",
          background: accent,
          boxShadow: `0 0 12px ${accent}66, 0 0 4px ${accent}44`,
          transition: dragging.current ? "none" : "left 0.1s ease",
        }} />
      </div>
    </div>
  );
}

function PresetTile({ preset, isActive, isOn, onTap }) {
  const [pressed, setPressed] = useState(false);
  const active = isActive && isOn;
  const { r, g, b } = hexToRgb(preset.accent);

  return (
    <div
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      onClick={() => onTap(preset.id)}
      style={{
        position: "relative",
        background: active
          ? `linear-gradient(135deg, rgba(${r},${g},${b},0.12) 0%, ${COLORS.surface} 100%)`
          : COLORS.surface,
        borderRadius: 14,
        padding: "16px 16px",
        cursor: "pointer",
        userSelect: "none",
        WebkitTapHighlightColor: "transparent",
        border: active ? `1px solid rgba(${r},${g},${b},0.35)` : `1px solid ${COLORS.border}`,
        boxShadow: active
          ? `0 0 24px rgba(${r},${g},${b},0.15), 0 0 48px rgba(${r},${g},${b},0.06), inset 0 1px 0 rgba(${r},${g},${b},0.1)`
          : "0 1px 3px rgba(0,0,0,0.3)",
        transform: pressed ? "scale(0.96)" : "scale(1)",
        transition: "transform 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94), background 0.6s ease, border 0.4s ease, box-shadow 0.6s ease",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        overflow: "hidden",
        gridColumn: preset.id === "velvet" ? "1 / -1" : undefined,
        minHeight: preset.id === "velvet" ? 72 : 80,
        justifyContent: "center",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          width: 8, height: 8, borderRadius: "50%",
          background: active ? preset.accent : `${preset.accent}55`,
          boxShadow: active ? `0 0 8px ${preset.accent}88` : "none",
          transition: "all 0.4s ease",
          flexShrink: 0,
        }} />
        <span style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: preset.id === "velvet" ? 15 : 13,
          fontWeight: 700,
          letterSpacing: "0.14em",
          color: active ? COLORS.text : COLORS.textMuted,
          transition: "color 0.4s ease",
        }}>
          {preset.name}
        </span>
      </div>
      <span style={{
        fontFamily: "'DM Mono', monospace",
        fontSize: 10,
        letterSpacing: "0.03em",
        color: active ? `${preset.accent}cc` : COLORS.textDim,
        transition: "color 0.4s ease",
        paddingLeft: 16,
      }}>
        {preset.desc}
      </span>
    </div>
  );
}

export default function App() {
  const [active, setActive] = useState("relax");
  const [isOn, setIsOn] = useState(true);
  const [showCustom, setShowCustom] = useState(false);
  const [isCustom, setIsCustom] = useState(false);
  const [custom, setCustom] = useState({ hue: 280, sat: 80, bri: 50, kelvin: 3500 });
  const [sheetDrag, setSheetDrag] = useState(null);
  const sheetRef = useRef(null);

  const activePreset = PRESETS.find((p) => p.id === active);
  const accent = !isOn ? COLORS.textDim : isCustom ? hslToHex(custom.hue, custom.sat, Math.max(30, custom.bri * 0.6)) : activePreset?.accent || COLORS.textDim;
  const { r: ar, g: ag, b: ab } = hexToRgb(accent);

  const handlePreset = (id) => {
    setActive(id);
    setIsCustom(false);
    setIsOn(true);
  };

  const handleOff = () => {
    setIsOn(!isOn);
  };

  const handleApply = () => {
    setIsCustom(true);
    setIsOn(true);
    setShowCustom(false);
  };

  const previewColor = hslToHex(custom.hue, custom.sat, Math.max(25, custom.bri * 0.55));

  // Touch handling for bottom sheet
  const dragStartY = useRef(0);
  const handleSheetTouchStart = (e) => {
    dragStartY.current = e.touches[0].clientY;
    setSheetDrag(0);
  };
  const handleSheetTouchMove = (e) => {
    const delta = e.touches[0].clientY - dragStartY.current;
    if (delta > 0) setSheetDrag(delta);
  };
  const handleSheetTouchEnd = () => {
    if (sheetDrag > 100) setShowCustom(false);
    setSheetDrag(null);
  };

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: COLORS.bg,
      fontFamily: "'Syne', sans-serif",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@300;400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
        ::-webkit-scrollbar { display: none; }
        @keyframes breathe {
          0%, 100% { opacity: 0.5; transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 0.7; transform: translate(-50%, -50%) scale(1.05); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes subtlePulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</style>

      {/* Noise texture overlay */}
      <svg style={{ position: "fixed", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 100, opacity: 0.035 }}>
        <filter id="noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#noise)" />
      </svg>

      {/* Ambient color wash */}
      <div style={{
        position: "fixed",
        top: "25%", left: "50%",
        width: 400, height: 400,
        background: `radial-gradient(circle, rgba(${ar},${ag},${ab},${isOn ? 0.1 : 0}) 0%, transparent 70%)`,
        transform: "translate(-50%, -50%)",
        filter: "blur(80px)",
        transition: "background 1.2s ease",
        pointerEvents: "none",
        zIndex: 0,
        animation: isOn ? "breathe 6s ease-in-out infinite" : "none",
      }} />

      {/* Secondary wash at bottom */}
      <div style={{
        position: "fixed",
        bottom: "-10%", left: "50%",
        width: 500, height: 300,
        background: `radial-gradient(ellipse, rgba(${ar},${ag},${ab},${isOn ? 0.06 : 0}) 0%, transparent 70%)`,
        transform: "translateX(-50%)",
        filter: "blur(60px)",
        transition: "background 1.2s ease",
        pointerEvents: "none",
        zIndex: 0,
      }} />

      {/* Main content */}
      <div style={{
        position: "relative", zIndex: 1,
        flex: 1,
        display: "flex",
        flexDirection: "column",
        padding: "0 20px",
        maxWidth: 430,
        margin: "0 auto",
        width: "100%",
      }}>
        {/* Header */}
        <div style={{
          paddingTop: 56, paddingBottom: 20,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          animation: "fadeIn 0.5s ease both",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 10, height: 10, borderRadius: "50%",
              background: isOn ? accent : COLORS.textDim,
              boxShadow: isOn ? `0 0 10px ${accent}88, 0 0 20px ${accent}44` : "none",
              transition: "all 0.6s ease",
              animation: isOn ? "subtlePulse 3s ease-in-out infinite" : "none",
            }} />
            <span style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: "0.22em",
              color: COLORS.text,
            }}>
              LUMINA
            </span>
          </div>
          <span style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 10,
            color: COLORS.textDim,
            letterSpacing: "0.06em",
          }}>
            {isOn ? (isCustom ? "CUSTOM" : active.toUpperCase()) : "OFF"}
          </span>
        </div>

        {/* Preset Grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          animation: "fadeIn 0.6s ease both 0.1s",
        }}>
          {PRESETS.map((p, i) => (
            <PresetTile
              key={p.id}
              preset={p}
              isActive={!isCustom && active === p.id}
              isOn={isOn}
              onTap={handlePreset}
            />
          ))}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1, minHeight: 16 }} />

        {/* Off Button */}
        <div style={{ animation: "fadeIn 0.6s ease both 0.2s", paddingBottom: 10 }}>
          <button
            onClick={handleOff}
            style={{
              width: "100%",
              padding: "14px 0",
              background: !isOn ? `rgba(${ar},${ag},${ab},0.1)` : "transparent",
              border: `1px solid ${!isOn ? `rgba(${ar},${ag},${ab},0.3)` : COLORS.border}`,
              borderRadius: 12,
              color: !isOn ? accent : COLORS.textMuted,
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

        {/* Custom Toggle */}
        <div style={{ animation: "fadeIn 0.6s ease both 0.3s", paddingBottom: 36 }}>
          <button
            onClick={() => setShowCustom(true)}
            style={{
              width: "100%",
              padding: "12px 0",
              background: "transparent",
              border: "none",
              color: COLORS.textDim,
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

      {/* Bottom Sheet Overlay */}
      {showCustom && (
        <div
          onClick={() => setShowCustom(false)}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 200,
            animation: "fadeIn 0.25s ease both",
          }}
        />
      )}

      {/* Custom Panel Bottom Sheet */}
      <div
        ref={sheetRef}
        onTouchStart={handleSheetTouchStart}
        onTouchMove={handleSheetTouchMove}
        onTouchEnd={handleSheetTouchEnd}
        style={{
          position: "fixed",
          bottom: 0, left: 0, right: 0,
          zIndex: 300,
          background: `linear-gradient(180deg, #1A1726 0%, ${COLORS.bg} 100%)`,
          borderRadius: "20px 20px 0 0",
          padding: "12px 24px 40px",
          transform: showCustom
            ? `translateY(${sheetDrag || 0}px)`
            : "translateY(100%)",
          transition: sheetDrag !== null ? "none" : "transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.5)",
          maxWidth: 430,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        {/* Drag handle */}
        <div style={{
          width: 36, height: 4, borderRadius: 2,
          background: COLORS.textDim,
          margin: "0 auto 24px",
        }} />

        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 28,
        }}>
          <span style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: "0.16em",
            color: COLORS.text,
          }}>
            CUSTOM
          </span>
          {/* Preview swatch */}
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            background: previewColor,
            boxShadow: `0 0 16px ${previewColor}66`,
            transition: "all 0.15s ease",
            border: `2px solid rgba(255,255,255,0.1)`,
          }} />
        </div>

        <Slider label="Hue" value={custom.hue} min={0} max={360} suffix="°" accent={previewColor}
          onChange={(v) => setCustom((c) => ({ ...c, hue: v }))} />
        <Slider label="Saturation" value={custom.sat} min={0} max={100} suffix="%" accent={previewColor}
          onChange={(v) => setCustom((c) => ({ ...c, sat: v }))} />
        <Slider label="Brightness" value={custom.bri} min={0} max={100} suffix="%" accent={previewColor}
          onChange={(v) => setCustom((c) => ({ ...c, bri: v }))} />
        <Slider label="Kelvin" value={custom.kelvin} min={2000} max={6500} suffix="K" accent={previewColor}
          onChange={(v) => setCustom((c) => ({ ...c, kelvin: v }))} />

        <button
          onClick={handleApply}
          style={{
            width: "100%",
            marginTop: 8,
            padding: "15px 0",
            background: `linear-gradient(135deg, ${previewColor}33 0%, ${previewColor}18 100%)`,
            border: `1px solid ${previewColor}55`,
            borderRadius: 12,
            color: COLORS.text,
            fontFamily: "'Syne', sans-serif",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.16em",
            cursor: "pointer",
            transition: "all 0.3s ease",
            boxShadow: `0 0 20px ${previewColor}22`,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          APPLY
        </button>
      </div>
    </div>
  );
}
