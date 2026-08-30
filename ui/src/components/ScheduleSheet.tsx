import { useState, useRef, useEffect } from "react";
import {
  getSchedule,
  putSchedule,
  DEFAULT_SCHEDULE,
  type Schedule,
  type Anchor,
} from "../api";

/* ─── ScheduleSheet — THE DESCENT (spec §4.3) ─── */

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

function parseHM(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

function fmtHM(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Tiny stepper: mono value flanked by hairline − / + buttons. */
function Stepper({
  value,
  onStep,
  ember,
}: {
  value: string;
  onStep: (dir: -1 | 1) => void;
  ember?: boolean;
}) {
  const btn: React.CSSProperties = {
    width: 22,
    height: 22,
    background: "transparent",
    border: "1px solid var(--line)",
    borderRadius: 3,
    color: "var(--text-muted)",
    fontFamily: "'DM Mono', monospace",
    fontSize: 12,
    lineHeight: 1,
    cursor: "pointer",
    WebkitTapHighlightColor: "transparent",
    padding: 0,
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button style={btn} onClick={() => onStep(-1)}>−</button>
      <span
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 11,
          color: ember ? "var(--ember)" : "var(--bone)",
          minWidth: 42,
          textAlign: "center",
        }}
      >
        {value}
      </span>
      <button style={btn} onClick={() => onStep(1)}>+</button>
    </div>
  );
}

/** Mini convergence sparkline: wake_current stepping toward wake_target. */
function ConvergenceSparkline({ current, target, eta }: { current: string; target: string; eta: number }) {
  const w = 96;
  const h = 24;
  const cur = parseHM(current);
  const tgt = parseHM(target);
  const days = eta > 0 ? Math.ceil(Math.max(0, cur - tgt) / eta) : 0;
  const n = 14;
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const v = eta > 0 ? Math.max(tgt, cur - eta * i) : cur;
    const frac = cur === tgt ? 1 : (cur - v) / Math.max(1, cur - tgt);
    pts.push(`${(i / (n - 1)) * w},${3 + (1 - frac) * (h - 6)}`);
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <svg width={w} height={h}>
        <line x1="0" y1={h - 3} x2={w} y2={h - 3} stroke="var(--line)" strokeWidth="1" />
        <polyline points={pts.join(" ")} fill="none" stroke="var(--ember)" strokeWidth="1" opacity="0.85" />
        <circle cx="0" cy="3" r="1.8" fill="var(--ember)" />
      </svg>
      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, color: "var(--text-dim)", letterSpacing: "0.08em" }}>
        {eta > 0 ? `${days}d to target` : "η = 0 · off"}
      </span>
    </div>
  );
}

export default function ScheduleSheet({ isOpen, onClose }: Props) {
  const [schedule, setSchedule] = useState<Schedule>(DEFAULT_SCHEDULE);
  const [dragY, setDragY] = useState<number | null>(null);
  const startY = useRef(0);
  const loaded = useRef(false);

  useEffect(() => {
    if (isOpen && !loaded.current) {
      loaded.current = true;
      getSchedule()
        .then((s) => {
          if (s && Array.isArray(s.anchors) && s.anchors.length) setSchedule(s);
        })
        .catch(() => {
          /* backend unreachable — defaults stand */
        });
    }
  }, [isOpen]);

  const commit = (next: Schedule) => {
    setSchedule(next);
    putSchedule(next).catch(() => {
      /* offline — local state stands */
    });
  };

  const stepAnchor = (i: number, dir: -1 | 1) => {
    const anchors: Anchor[] = schedule.anchors.map((a, j) =>
      j === i ? { ...a, time: fmtHM(parseHM(a.time) + dir * 5) } : a
    );
    commit({ ...schedule, anchors });
  };

  const stepWake = (key: "wake_current" | "wake_target", dir: -1 | 1) => {
    commit({
      ...schedule,
      wake: { ...schedule.wake, [key]: fmtHM(parseHM(schedule.wake[key]) + dir * 5) },
    });
  };

  const stepEta = (dir: -1 | 1) => {
    const eta = Math.max(0, Math.min(10, schedule.wake.eta_minutes_per_day + dir));
    commit({ ...schedule, wake: { ...schedule.wake, eta_minutes_per_day: eta } });
  };

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

  const mono = (size: number, color: string): React.CSSProperties => ({
    fontFamily: "'DM Mono', monospace",
    fontSize: size,
    color,
    letterSpacing: "0.08em",
  });

  return (
    <>
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
          maxHeight: "82vh",
          overflowY: "auto",
        }}
      >
        <div style={{ width: 36, height: 2, background: "var(--line)", margin: "0 auto 20px" }} />

        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 18 }}>
          <span
            style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.22em",
              color: "var(--bone)",
            }}
          >
            THE DESCENT
          </span>
          <span style={mono(8, "var(--blueprint)")}>未来を最適化する</span>
        </div>

        {/* Anchor timeline */}
        <div style={{ position: "relative", paddingLeft: 18, marginBottom: 22 }}>
          {/* vertical rail */}
          <div
            style={{
              position: "absolute",
              left: 5,
              top: 8,
              bottom: 8,
              width: 1,
              background: "var(--line)",
            }}
          />
          {schedule.anchors.map((a, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "7px 0",
                position: "relative",
              }}
            >
              {/* ember node on rail */}
              <span
                style={{
                  position: "absolute",
                  left: -18,
                  width: 11,
                  height: 11,
                  borderRadius: "50%",
                  border: "1px solid var(--ember)",
                  background: "var(--bg-raise)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 6,
                  color: "var(--ember)",
                }}
              >
                {i}
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={mono(10, "var(--bone)")}>{a.anchor.toUpperCase()}</span>
                <span style={mono(8, "var(--text-dim)")}>
                  {a.bri != null ? `bri ${a.bri}` : ""} {a.kelvin != null ? `· ${a.kelvin}K` : ""}
                </span>
              </div>
              <Stepper value={a.time} onStep={(d) => stepAnchor(i, d)} ember={i === schedule.anchors.length - 1} />
            </div>
          ))}
        </div>

        {/* Wake block */}
        <div
          style={{
            border: "1px solid var(--line)",
            borderRadius: 6,
            padding: "14px 14px 12px",
            marginBottom: 18,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <span style={{ ...mono(8, "var(--text-dim)"), letterSpacing: "0.28em" }}>THE ASCENT · WAKE</span>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={mono(10, "var(--text-muted)")}>current</span>
            <Stepper value={schedule.wake.wake_current} onStep={(d) => stepWake("wake_current", d)} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={mono(10, "var(--text-muted)")}>target</span>
            <Stepper value={schedule.wake.wake_target} onStep={(d) => stepWake("wake_target", d)} ember />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={mono(10, "var(--text-muted)")}>η min/day</span>
            <Stepper value={String(schedule.wake.eta_minutes_per_day)} onStep={stepEta} />
          </div>
          <ConvergenceSparkline
            current={schedule.wake.wake_current}
            target={schedule.wake.wake_target}
            eta={schedule.wake.eta_minutes_per_day}
          />
        </div>

        {/* Engine master toggle */}
        <button
          onClick={() => commit({ ...schedule, armed: !schedule.armed })}
          style={{
            width: "100%",
            padding: "14px 0",
            background: schedule.armed ? "rgba(255,77,28,0.08)" : "transparent",
            border: `1px solid ${schedule.armed ? "var(--ember)" : "var(--line)"}`,
            borderRadius: 6,
            color: schedule.armed ? "var(--ember)" : "var(--text-dim)",
            fontFamily: "'Syne', sans-serif",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.2em",
            cursor: "pointer",
            transition: "all 0.3s ease",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          {schedule.armed ? "ENGINE ARMED" : "ENGINE DISARMED"}
        </button>
      </div>
    </>
  );
}
