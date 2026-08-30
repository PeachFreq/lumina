import { useState, useRef, useEffect, useCallback } from "react";
import { postLex, type CustomValues } from "../api";

/* ─── CustomPanel — v1 sliders restyled Blueprint Ember + lex text field (spec §5.1) ─── */

interface Props {
  isOpen: boolean;
  values: CustomValues;
  onChange: (next: CustomValues) => void;
  onApply: () => void;
  onClose: () => void;
  onLexApplied: () => void;
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

/* ─── Slider — 1px hairline track, ember fill, mono values ─── */

function Slider({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
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
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 10,
            letterSpacing: "0.12em",
            color: "var(--text-muted)",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "var(--blueprint)" }}>
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
          height: 30,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          touchAction: "none",
        }}
      >
        {/* hairline track */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            height: 1,
            background: "var(--line)",
          }}
        />
        {/* ember fill */}
        <div
          style={{
            position: "absolute",
            left: 0,
            width: `${pct}%`,
            height: 1,
            background: "var(--ember)",
            transition: dragging.current ? "none" : "width 0.1s ease",
          }}
        />
        {/* ember thumb */}
        <div
          style={{
            position: "absolute",
            left: `${pct}%`,
            transform: "translateX(-50%)",
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: "var(--bg)",
            border: "1px solid var(--ember)",
            boxShadow: "0 0 8px rgba(255,77,28,0.4)",
            transition: dragging.current ? "none" : "left 0.1s ease",
          }}
        />
      </div>
    </div>
  );
}

/* ─── CustomPanel ─── */

export default function CustomPanel({ isOpen, values, onChange, onApply, onClose, onLexApplied }: Props) {
  const [dragY, setDragY] = useState<number | null>(null);
  const [utterance, setUtterance] = useState("");
  const [lexBusy, setLexBusy] = useState(false);
  const [lexStatus, setLexStatus] = useState<string | null>(null);
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

  const submitLex = async () => {
    const text = utterance.trim();
    if (!text || lexBusy) return;
    setLexBusy(true);
    setLexStatus(null);
    try {
      const result = await postLex(text);
      setLexStatus(result.name ? `applied · ${result.name}` : "applied");
      setUtterance("");
      onLexApplied();
    } catch {
      setLexStatus("lex offline");
    } finally {
      setLexBusy(false);
    }
  };

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
          background: "var(--bg-raise)",
          borderTop: "1px solid var(--line)",
          borderRadius: "14px 14px 0 0",
          padding: "12px 24px 36px",
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
            height: 2,
            background: "var(--line)",
            margin: "0 auto 22px",
          }}
        />

        {/* Title + preview swatch */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 22,
          }}
        >
          <span
            style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.22em",
              color: "var(--bone)",
            }}
          >
            CUSTOM θ
          </span>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              background: previewColor,
              boxShadow: `0 0 14px ${previewColor}55`,
              transition: "all 0.15s ease",
              border: "1px solid var(--line)",
            }}
          />
        </div>

        {/* Sliders */}
        <Slider label="Hue" value={values.hue} min={0} max={360} suffix="°" onChange={set("hue")} />
        <Slider label="Saturation" value={values.sat} min={0} max={100} suffix="%" onChange={set("sat")} />
        <Slider label="Brightness" value={values.bri} min={0} max={100} suffix="%" onChange={set("bri")} />
        <Slider label="Kelvin" value={values.kelvin} min={2000} max={6500} suffix="K" onChange={set("kelvin")} />

        {/* Lex text field (spec §5.1) */}
        <div style={{ display: "flex", gap: 8, marginTop: 4, marginBottom: 16 }}>
          <input
            type="text"
            value={utterance}
            onChange={(e) => setUtterance(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitLex()}
            placeholder="describe the light…"
            style={{
              flex: 1,
              background: "var(--bg)",
              border: "1px solid var(--line)",
              borderRadius: 4,
              padding: "10px 12px",
              fontFamily: "'DM Mono', monospace",
              fontSize: 11,
              color: "var(--bone)",
              outline: "none",
            }}
          />
          <button
            onClick={submitLex}
            disabled={lexBusy}
            style={{
              background: "transparent",
              border: "1px solid var(--ember)",
              borderRadius: 4,
              color: "var(--ember)",
              fontFamily: "'DM Mono', monospace",
              fontSize: 10,
              letterSpacing: "0.1em",
              padding: "0 14px",
              cursor: "pointer",
              opacity: lexBusy ? 0.5 : 1,
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {lexBusy ? "…" : "LEX"}
          </button>
        </div>
        {lexStatus && (
          <div
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 9,
              letterSpacing: "0.1em",
              color: "var(--blueprint)",
              marginTop: -10,
              marginBottom: 12,
            }}
          >
            {lexStatus}
          </div>
        )}

        {/* Apply button */}
        <button
          onClick={onApply}
          style={{
            width: "100%",
            marginTop: 4,
            padding: "14px 0",
            background: "transparent",
            border: "1px solid var(--ember)",
            borderRadius: 6,
            color: "var(--ember)",
            fontFamily: "'Syne', sans-serif",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.2em",
            cursor: "pointer",
            transition: "all 0.3s ease",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          APPLY
        </button>
      </div>
    </>
  );
}
