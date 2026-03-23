import { useState, useRef, useEffect, useCallback, type CSSProperties } from "react";

interface CustomValues {
  hue: number;
  sat: number;
  bri: number;
  kelvin: number;
}

interface Props {
  isOpen: boolean;
  values: CustomValues;
  onChange: (next: CustomValues) => void;
  onApply: () => void;
  onClose: () => void;
}

/** Convert HSL to hex for the preview swatch. */
function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/* ─── Slider sub-component ─── */

function Slider({
  label,
  value,
  min,
  max,
  suffix,
  accent,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  accent: string;
  onChange: (v: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const pct = ((value - min) / (max - min)) * 100;

  const update = useCallback(
    (clientX: number) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const raw = min + ratio * (max - min);
      const step = max > 1000 ? 100 : 1;
      onChange(Math.round(raw / step) * step);
    },
    [min, max, onChange]
  );

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!dragging.current) return;
      e.preventDefault();
      const x = "touches" in e ? e.touches[0].clientX : e.clientX;
      update(x);
    };
    const onUp = () => {
      dragging.current = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [update]);

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    dragging.current = true;
    const x = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    update(x);
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 11,
            letterSpacing: "0.08em",
            color: "var(--text-muted)",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "var(--text)" }}>
          {value}
          {suffix}
        </span>
      </div>
      <div
        ref={trackRef}
        onMouseDown={handleStart}
        onTouchStart={handleStart}
        style={{
          position: "relative",
          height: 32,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          touchAction: "none",
        }}
      >
        {/* Track background */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            height: 3,
            borderRadius: 2,
            background: "var(--border)",
          }}
        />
        {/* Filled track */}
        <div
          style={{
            position: "absolute",
            left: 0,
            width: `${pct}%`,
            height: 3,
            borderRadius: 2,
            background: accent,
            transition: dragging.current ? "none" : "width 0.1s ease",
          }}
        />
        {/* Thumb */}
        <div
          style={{
            position: "absolute",
            left: `${pct}%`,
            transform: "translateX(-50%)",
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: accent,
            boxShadow: `0 0 12px ${accent}66, 0 0 4px ${accent}44`,
            transition: dragging.current ? "none" : "left 0.1s ease",
          }}
        />
      </div>
    </div>
  );
}

/* ─── CustomPanel ─── */

export default function CustomPanel({ isOpen, values, onChange, onApply, onClose }: Props) {
  const [dragY, setDragY] = useState<number | null>(null);
  const startY = useRef(0);

  const previewColor = hslToHex(values.hue, values.sat, Math.max(25, values.bri * 0.55));

  const handleTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    setDragY(0);
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) setDragY(delta);
  };
  const handleTouchEnd = () => {
    if (dragY !== null && dragY > 100) onClose();
    setDragY(null);
  };

  const set = (key: keyof CustomValues) => (v: number) =>
    onChange({ ...values, [key]: v });

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 200,
            animation: "fadeIn 0.25s ease both",
          }}
        />
      )}

      {/* Sheet */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 300,
          background: `linear-gradient(180deg, #1A1726 0%, var(--bg) 100%)`,
          borderRadius: "20px 20px 0 0",
          padding: "12px 24px 40px",
          transform: isOpen ? `translateY(${dragY || 0}px)` : "translateY(100%)",
          transition: dragY !== null ? "none" : "transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.5)",
          maxWidth: 430,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        {/* Drag handle */}
        <div
          style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            background: "var(--text-dim)",
            margin: "0 auto 24px",
          }}
        />

        {/* Title + preview swatch */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 28,
          }}
        >
          <span
            style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: "0.16em",
              color: "var(--text)",
            }}
          >
            CUSTOM
          </span>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: previewColor,
              boxShadow: `0 0 16px ${previewColor}66`,
              transition: "all 0.15s ease",
              border: "2px solid rgba(255,255,255,0.1)",
            }}
          />
        </div>

        {/* Sliders */}
        <Slider
          label="Hue"
          value={values.hue}
          min={0}
          max={360}
          suffix="°"
          accent={previewColor}
          onChange={set("hue")}
        />
        <Slider
          label="Saturation"
          value={values.sat}
          min={0}
          max={100}
          suffix="%"
          accent={previewColor}
          onChange={set("sat")}
        />
        <Slider
          label="Brightness"
          value={values.bri}
          min={0}
          max={100}
          suffix="%"
          accent={previewColor}
          onChange={set("bri")}
        />
        <Slider
          label="Kelvin"
          value={values.kelvin}
          min={2000}
          max={6500}
          suffix="K"
          accent={previewColor}
          onChange={set("kelvin")}
        />

        {/* Apply button */}
        <button
          onClick={onApply}
          style={{
            width: "100%",
            marginTop: 8,
            padding: "15px 0",
            background: `linear-gradient(135deg, ${previewColor}33 0%, ${previewColor}18 100%)`,
            border: `1px solid ${previewColor}55`,
            borderRadius: 12,
            color: "var(--text)",
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
    </>
  );
}
