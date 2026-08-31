import type { EngineState } from "../api";

/* ─── UpdateRuleStrip — the poster's equation header, made live (spec §2.3) ─── */

interface Props {
  engine: EngineState | null;
}

/* DM Mono's font file only covers Latin text — it has NO Greek letters
   (θ, η) or math operators (∇), so the browser silently falls back to a
   generic system font for just those glyphs. That fallback renders at a
   different width/baseline than the surrounding monospace text, which
   pushed the whole line past its container and got clipped by
   overflow: hidden — the "half-visible equation" bug (2026-08-30).
   Fixing the width mismatch at the source: explicitly fall back to
   fonts that DO ship real math/Greek glyphs (SF Mono on iOS via
   ui-monospace, then generic monospace) so every character in the
   equation renders at a consistent, predictable width. */
const mathFont = "'DM Mono', ui-monospace, 'SF Mono', Menlo, monospace";

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
        padding: "8px 4px",
        borderTop: "1px solid var(--line)",
        borderBottom: "1px solid var(--line)",
        whiteSpace: "normal",
        wordBreak: "keep-all",
        lineHeight: 1.5,
        animation: "fadeIn 0.6s ease both 0.1s",
      }}
    >
      {descending ? (
        <span style={{ color: "var(--blueprint)" }}>
          bri {engine.bri_from ?? "·"}{" "}
          <span style={{ color: "var(--ember)" }}>→</span> {engine.bri_to ?? "·"}
          {" · "}step {engine.step ?? 0}/{engine.total_steps ?? 0}
          {" · "}
          <span style={{ color: "var(--ember)", fontFamily: mathFont }}>η</span> {engine.eta ?? 0}/min
        </span>
      ) : (
        <span style={{ color: "var(--text-dim)", fontFamily: mathFont }}>
          θ<sub style={{ fontSize: 7 }}>t+1</sub> = θ<sub style={{ fontSize: 7 }}>t</sub> −{" "}
          <span style={{ color: "var(--ember)", opacity: 0.55 }}>η</span> ∇L(θ
          <sub style={{ fontSize: 7 }}>t</sub>)
        </span>
      )}
    </div>
  );
}
