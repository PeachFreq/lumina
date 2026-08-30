/* ─── Masthead — LUMINA wordmark + 勾配降下法 + live mono status ─── */

interface Props {
  isOn: boolean;
  modeLabel: string;
  bri: number;
  kelvin: number;
}

export default function Masthead({ isOn, modeLabel, bri, kelvin }: Props) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        padding: "18px 2px 10px",
        borderBottom: "1px solid var(--line)",
        animation: "fadeIn 0.6s ease both",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span
          style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 800,
            fontSize: 20,
            letterSpacing: "0.34em",
            color: "var(--bone)",
            textTransform: "uppercase",
          }}
        >
          LUMINA
        </span>
        <span
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 9,
            letterSpacing: "0.2em",
            color: "var(--blueprint)",
            transform: "translateY(-1px)",
            whiteSpace: "nowrap",
          }}
        >
          勾配降下法
        </span>
      </div>

      <div
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 9,
          letterSpacing: "0.1em",
          textAlign: "right",
          lineHeight: 1.5,
          whiteSpace: "nowrap",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <span style={{ color: isOn ? "var(--ember)" : "var(--text-dim)" }}>
          {modeLabel}
        </span>
        <span style={{ color: "var(--text-dim)" }}>
          bri {isOn ? bri : 0} · {kelvin}K
        </span>
      </div>
    </header>
  );
}
