import type { EngineState } from "../api";

/* ─── UpdateRuleStrip — the poster's equation header, made live (spec §2.3) ─── */

interface Props {
  engine: EngineState | null;
}

export default function UpdateRuleStrip({ engine }: Props) {
  const descending =
    engine && (engine.phase === "descending" || engine.phase === "ascending");

  return (
    <div
      style={{
        fontFamily: "'DM Mono', monospace",
        fontSize: 10,
        letterSpacing: "0.08em",
        textAlign: "center",
        padding: "8px 0",
        borderTop: "1px solid var(--line)",
        borderBottom: "1px solid var(--line)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        animation: "fadeIn 0.6s ease both 0.1s",
      }}
    >
      {descending ? (
        <span style={{ color: "var(--blueprint)" }}>
          bri {engine.bri_from ?? "·"}{" "}
          <span style={{ color: "var(--ember)" }}>→</span> {engine.bri_to ?? "·"}
          {" · "}step {engine.step ?? 0}/{engine.total_steps ?? 0}
          {" · "}
          <span style={{ color: "var(--ember)" }}>η</span> {engine.eta ?? 0}/min
        </span>
      ) : (
        <span style={{ color: "var(--text-dim)" }}>
          θ<sub style={{ fontSize: 7 }}>t+1</sub> = θ<sub style={{ fontSize: 7 }}>t</sub> −{" "}
          <span style={{ color: "var(--ember)", opacity: 0.55 }}>η</span> ∇L(θ
          <sub style={{ fontSize: 7 }}>t</sub>)
        </span>
      )}
    </div>
  );
}
