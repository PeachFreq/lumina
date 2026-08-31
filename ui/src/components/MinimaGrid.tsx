/* ─── MinimaGrid — presets as named minima in parameter space (spec §2.4) ─── */

export interface MinimaData {
  id: string;
  name: string;
  desc: string;
  accent: string;
  hue: number;
  sat: number;
  bri: number;
  kelvin: number;
  featured?: boolean;
}

interface Props {
  minima: MinimaData[];
  activeId: string | null;
  isOn: boolean;
  isCustom: boolean;
  onSelect: (id: string) => void;
}

/** Small contour-rings glyph — rings tinted by the preset accent. */
function ContourGlyph({ accent, active }: { accent: string; active: boolean }) {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" style={{ flexShrink: 0 }}>
      {[14, 10.5, 7, 4].map((r, i) => (
        <ellipse
          key={r}
          cx="17"
          cy="17"
          rx={r + (i % 2) * 1.5}
          ry={r * 0.8}
          fill="none"
          stroke={accent}
          strokeWidth="1"
          opacity={active ? 0.4 + i * 0.16 : 0.22 + i * 0.09}
          transform={`rotate(${i * 9 - 12} 17 17)`}
        />
      ))}
      <circle
        cx="17"
        cy="17"
        r="1.8"
        fill={active ? "var(--ember)" : "transparent"}
        stroke={active ? "none" : accent}
        strokeWidth="0.75"
        opacity={active ? 1 : 0.4}
      >
        {active && (
          <animate attributeName="opacity" values="0.7;1;0.7" dur="2.5s" repeatCount="indefinite" />
        )}
      </circle>
    </svg>
  );
}

export default function MinimaGrid({ minima, activeId, isOn, isCustom, onSelect }: Props) {
  return (
    <div className="minima-grid" style={{ padding: "8px 0" }}>
      {minima.map((m) => {
        const active = isOn && !isCustom && m.id === activeId;
        return (
          <div
            key={m.id}
            className={[
              "minima-tile",
              m.featured ? "minima-tile--featured" : "",
              active ? "minima-tile--active" : "",
            ].join(" ")}
            onClick={() => onSelect(m.id)}
            role="button"
            aria-pressed={active}
          >
            <ContourGlyph accent={m.accent} active={active} />
            <div className="minima-tile__body">
              <span className="minima-tile__name">{m.name}</span>
              <span className="minima-tile__desc">{m.desc}</span>
              <span className="minima-tile__coord">
                H{m.hue} S{m.sat} B{m.bri} {m.kelvin}K
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
