import { useRef, useState, useCallback, useEffect } from "react";

/* ─── BrightnessSlider — master room-wide brightness dial (spec 2026-08-30) ───
   Big horizontal control on the main screen. Shows where the CURRENT
   brightness sits in the overall 1-100 range, and lets you drag to
   rescale every enabled lamp (LIFX + both Govee) at once, proportionally,
   without changing which preset/hue is active. */

interface Props {
  value: number; // 1-100
  onChange: (v: number) => void; // fires continuously while dragging (optimistic)
  onCommit: (v: number) => void; // fires once, debounced, to hit the network
  disabled?: boolean;
}

export default function BrightnessSlider({ value, onChange, onCommit, disabled }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pctFromClientX = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return value;
    const rect = el.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(1 + frac * 99);
  }, [value]);

  const scheduleCommit = useCallback((v: number) => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => onCommit(v), 120);
  }, [onCommit]);

  const handleMove = useCallback((clientX: number) => {
    const v = pctFromClientX(clientX);
    onChange(v);
    scheduleCommit(v);
  }, [pctFromClientX, onChange, scheduleCommit]);

  useEffect(() => {
    if (!dragging) return;
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX);
    const onTouchMove = (e: TouchEvent) => handleMove(e.touches[0].clientX);
    const stop = () => setDragging(false);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("touchmove", onTouchMove);
    window.addEventListener("mouseup", stop);
    window.addEventListener("touchend", stop);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("touchend", stop);
    };
  }, [dragging, handleMove]);

  const startDrag = (clientX: number) => {
    if (disabled) return;
    setDragging(true);
    handleMove(clientX);
  };

  const nudge = (delta: number) => {
    if (disabled) return;
    const v = Math.max(1, Math.min(100, value + delta));
    onChange(v);
    scheduleCommit(v);
  };

  const fillPct = Math.max(0, Math.min(100, ((value - 1) / 99) * 100));

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "0 0 10px",
        opacity: disabled ? 0.4 : 1,
        animation: "fadeIn 0.6s ease both 0.1s",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 8,
            letterSpacing: "0.28em",
            color: "var(--text-dim)",
          }}
        >
          BRIGHTNESS · ALL LAMPS
        </span>
        <span
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 11,
            color: "var(--ember)",
            letterSpacing: "0.05em",
          }}
        >
          {value}%
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={() => nudge(-10)}
          disabled={disabled}
          aria-label="dim"
          style={{
            width: 28,
            height: 28,
            flexShrink: 0,
            background: "transparent",
            border: "1px solid var(--line)",
            borderRadius: 5,
            color: "var(--text-muted)",
            fontFamily: "'DM Mono', monospace",
            fontSize: 14,
            lineHeight: 1,
            cursor: disabled ? "default" : "pointer",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          −
        </button>

        <div
          ref={trackRef}
          onMouseDown={(e) => startDrag(e.clientX)}
          onTouchStart={(e) => startDrag(e.touches[0].clientX)}
          style={{
            position: "relative",
            flex: 1,
            height: 34,
            borderRadius: 8,
            border: "1px solid var(--line)",
            background: "var(--bg-raise)",
            overflow: "hidden",
            cursor: disabled ? "default" : "pointer",
            touchAction: "none",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          {/* filled portion — shows current position in the 1-100 spectrum */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              width: `${fillPct}%`,
              background: "linear-gradient(90deg, rgba(255,77,28,0.12), rgba(255,77,28,0.32))",
              transition: dragging ? "none" : "width 0.25s ease",
            }}
          />
          {/* tick marks across the full spectrum for visual reference */}
          <div style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "space-between", padding: "0 4px", alignItems: "center" }}>
            {Array.from({ length: 11 }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: 1,
                  height: i % 5 === 0 ? 14 : 7,
                  background: "var(--line)",
                  opacity: 0.6,
                }}
              />
            ))}
          </div>
          {/* handle */}
          <div
            style={{
              position: "absolute",
              top: 3,
              bottom: 3,
              left: `calc(${fillPct}% - 2px)`,
              width: 4,
              borderRadius: 2,
              background: "var(--ember)",
              boxShadow: "0 0 8px rgba(255,77,28,0.7)",
              transition: dragging ? "none" : "left 0.25s ease",
            }}
          />
        </div>

        <button
          onClick={() => nudge(10)}
          disabled={disabled}
          aria-label="brighten"
          style={{
            width: 28,
            height: 28,
            flexShrink: 0,
            background: "transparent",
            border: "1px solid var(--line)",
            borderRadius: 5,
            color: "var(--text-muted)",
            fontFamily: "'DM Mono', monospace",
            fontSize: 14,
            lineHeight: 1,
            cursor: disabled ? "default" : "pointer",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}
