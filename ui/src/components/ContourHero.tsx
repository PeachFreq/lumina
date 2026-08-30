import { useEffect, useMemo, useState } from "react";
import type { Anchor } from "../api";
// GhostVisitor hidden pending redesign — see note at bottom of render

/* ─── ContourHero — SVG contour topography of tonight's descent (spec §1.4) ─── */

interface Props {
  anchors: Anchor[];
  onNodeTap: (anchor: Anchor, index: number) => void;
  wakeCurrent: string; // "06:55"
}

const W = 393;
const H = 320;

/** Minimum well center (the poster's glowing basin, lower-right). */
const MIN_X = 272;
const MIN_Y = 236;

/** Cubic bezier from ridge (top-left) down into the minimum. */
const P0 = { x: 66, y: 58 };
const P1 = { x: 158, y: 84 };
const P2 = { x: 206, y: 168 };
const P3 = { x: MIN_X, y: MIN_Y };

function bezier(t: number) {
  const u = 1 - t;
  return {
    x: u * u * u * P0.x + 3 * u * u * t * P1.x + 3 * u * t * t * P2.x + t * t * t * P3.x,
    y: u * u * u * P0.y + 3 * u * u * t * P1.y + 3 * u * t * t * P2.y + t * t * t * P3.y,
  };
}

/** Distorted concentric contour ring around the minimum. */
function contourRing(radius: number, seed: number): string {
  const pts: string[] = [];
  const n = 64;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const wobble =
      1 +
      0.13 * Math.sin(a * 3 + seed * 1.7) +
      0.09 * Math.sin(a * 5 - seed * 0.9) +
      0.06 * Math.sin(a * 2 + seed * 2.3);
    // stretch the field toward the upper-left ridge
    const rx = radius * wobble * (1 + 0.35 * Math.cos(a - 0.6));
    const ry = radius * wobble * 0.72;
    const x = MIN_X + rx * Math.cos(a);
    const y = MIN_Y + ry * Math.sin(a);
    pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(" ") + " Z";
}

function parseHM(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

/** Map current time-of-day onto path position t ∈ [0,1] via the anchor times. */
function timeToT(now: Date, anchors: Anchor[]): number {
  if (anchors.length < 2) return 0;
  const mins = now.getHours() * 60 + now.getMinutes();
  const times = anchors.map((a) => parseHM(a.time));
  const first = times[0];
  const last = times[times.length - 1];
  if (mins <= first || mins > last) {
    // outside the descent window: idle at the top before, rest in the minimum after
    return mins > last && mins < first + 720 ? 1 : 0;
  }
  for (let i = 0; i < times.length - 1; i++) {
    if (mins >= times[i] && mins <= times[i + 1]) {
      const seg = (mins - times[i]) / Math.max(1, times[i + 1] - times[i]);
      const t0 = i / (times.length - 1);
      const t1 = (i + 1) / (times.length - 1);
      return t0 + seg * (t1 - t0);
    }
  }
  return 1;
}

/** Sun vertical position: rises as wake approaches (spec §1.3). */
function sunY(now: Date, wakeCurrent: string): number {
  const mins = now.getHours() * 60 + now.getMinutes();
  const wake = parseHM(wakeCurrent);
  let until = wake - mins;
  if (until < 0) until += 24 * 60;
  const closeness = 1 - Math.min(until, 720) / 720; // 0 far → 1 imminent
  return 92 - closeness * 52; // sinks low when far from wake, rises when close
}

export default function ContourHero({ anchors, onNodeTap, wakeCurrent }: Props) {
  const [now, setNow] = useState(() => new Date());
  const [flash, setFlash] = useState<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const rings = useMemo(() => {
    const out: { d: string; stroke: string; opacity: number }[] = [];
    for (let i = 1; i <= 13; i++) {
      out.push({
        d: contourRing(14 + i * 15, i),
        stroke: i % 4 === 0 ? "var(--blueprint)" : "var(--contour)",
        opacity: i % 4 === 0 ? 0.55 : 0.8,
      });
    }
    return out;
  }, []);

  const nodeCount = Math.max(anchors.length, 2);
  const nodes = anchors.map((a, i) => ({
    ...bezier(i / (nodeCount - 1)),
    anchor: a,
    index: i,
  }));

  const pathD = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 40; i++) {
      const p = bezier(i / 40);
      pts.push(`${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`);
    }
    return pts.join(" ");
  }, []);

  const theta = bezier(timeToT(now, anchors));
  const sy = sunY(now, wakeCurrent);

  const handleTap = (i: number) => {
    setFlash(i);
    setTimeout(() => setFlash(null), 700);
    onNodeTap(anchors[i], i);
  };

  return (
    <div
      style={{
        position: "relative",
        height: "26vh",
        minHeight: 200,
        maxHeight: 250,
        margin: "0 -6px",
        animation: "fadeIn 0.7s ease both 0.05s",
      }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        <defs>
          <pattern id="sun-scan" width="4" height="3" patternUnits="userSpaceOnUse">
            <rect width="4" height="3" fill="var(--ember)" />
            <rect y="1.6" width="4" height="1.4" fill="var(--bg)" opacity="0.55" />
          </pattern>
          <radialGradient id="min-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FF4D1C" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#FF4D1C" stopOpacity="0" />
          </radialGradient>
          <clipPath id="hero-clip">
            <rect x="0" y="0" width={W} height={H} />
          </clipPath>
        </defs>

        <g clipPath="url(#hero-clip)">
          {/* contour topography */}
          {rings.map((r, i) => (
            <path
              key={i}
              d={r.d}
              fill="none"
              stroke={r.stroke}
              strokeWidth="1"
              opacity={r.opacity}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {/* halftone/scanline red sun — vertical position tracks wake proximity */}
          <g style={{ transition: "transform 2s ease" }} transform={`translate(340, ${sy})`}>
            <circle r="26" fill="url(#sun-scan)" opacity="0.9" />
            <circle r="26" fill="none" stroke="var(--ember-deep)" strokeWidth="0.5" opacity="0.6" />
          </g>

          {/* minimum well: concentric ember rings */}
          <circle cx={MIN_X} cy={MIN_Y} r="42" fill="url(#min-glow)" />
          {[6, 12, 19, 27].map((r) => (
            <circle
              key={r}
              cx={MIN_X}
              cy={MIN_Y}
              r={r}
              fill="none"
              stroke="var(--ember)"
              strokeWidth="0.75"
              opacity={0.55 - r * 0.012}
            />
          ))}
          <circle cx={MIN_X} cy={MIN_Y} r="2.2" fill="var(--ember)">
            <animate attributeName="opacity" values="0.6;1;0.6" dur="3s" repeatCount="indefinite" />
          </circle>

          {/* descent path */}
          <path d={pathD} fill="none" stroke="var(--ember)" strokeWidth="1.2" opacity="0.85" />

          {/* numbered anchor nodes 0..4 — tappable */}
          {nodes.map((n) => (
            <g
              key={n.index}
              onPointerDown={(e) => {
                e.preventDefault();
                handleTap(n.index);
              }}
              style={{ cursor: "pointer", touchAction: "manipulation" }}
              pointerEvents="all"
            >
              <circle cx={n.x} cy={n.y} r="14" fill="transparent" />
              <circle
                cx={n.x}
                cy={n.y}
                r="8.5"
                fill="var(--bg)"
                stroke="var(--ember)"
                strokeWidth="1"
              />
              {flash === n.index && (
                <circle
                  cx={n.x}
                  cy={n.y}
                  r="13"
                  fill="none"
                  stroke="var(--ember)"
                  strokeWidth="1"
                  style={{ animation: "confirmFlash 0.7s ease both" }}
                />
              )}
              <text
                x={n.x}
                y={n.y + 3}
                textAnchor="middle"
                fontFamily="'DM Mono', monospace"
                fontSize="8.5"
                fill="var(--bone)"
              >
                {n.index}
              </text>
            </g>
          ))}

          {/* current θ_t — glowing ember dot on the path */}
          <circle cx={theta.x} cy={theta.y} r="7" fill="var(--ember)" opacity="0.18">
            <animate attributeName="r" values="6;10;6" dur="2.5s" repeatCount="indefinite" />
          </circle>
          <circle cx={theta.x} cy={theta.y} r="3.4" fill="var(--ember)">
            <animate attributeName="opacity" values="0.8;1;0.8" dur="2.5s" repeatCount="indefinite" />
          </circle>

          {/* corner registration marks */}
          {[
            [8, 12],
            [W - 8, 12],
            [8, H - 6],
            [W - 8, H - 6],
          ].map(([x, y], i) => (
            <text
              key={i}
              x={x}
              y={y}
              textAnchor="middle"
              fontFamily="'DM Mono', monospace"
              fontSize="9"
              fill="var(--contour)"
            >
              +
            </text>
          ))}

          {/* rotated margin annotations */}
          <text
            transform={`translate(${W - 10}, ${H / 2}) rotate(90)`}
            textAnchor="middle"
            fontFamily="'DM Mono', monospace"
            fontSize="7"
            letterSpacing="2.5"
            fill="var(--blueprint)"
            opacity="0.8"
          >
            MOVE THROUGH PARAMETER SPACE
          </text>
          <text
            transform={`translate(10, ${H / 2}) rotate(-90)`}
            textAnchor="middle"
            fontFamily="'DM Mono', monospace"
            fontSize="7"
            letterSpacing="3"
            fill="var(--blueprint)"
            opacity="0.8"
          >
            — UPDATE RULE —
          </text>

          {/* minimum label */}
          <text
            x={MIN_X + 34}
            y={MIN_Y + 26}
            fontFamily="'DM Mono', monospace"
            fontSize="7.5"
            letterSpacing="1"
            fill="var(--text-dim)"
            fontStyle="italic"
          >
            minimum
          </text>
        </g>
      </svg>

      {/* Dario hidden pending redesign (Cody 2026-08-30) — component kept.
          <GhostVisitor /> */}
    </div>
  );
}
