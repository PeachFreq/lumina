import { useState, useEffect, useRef } from "react";

/**
 * A pixel-art Dario who wanders in from the side,
 * idles cheerfully, notices he's being watched, then scurries away.
 * Appears every ~18 seconds.
 */

type Phase = "hidden" | "entering" | "idle" | "noticed" | "fleeing";

/* ─── Pixel character renderer ─── */

const PX = 3; // pixel scale — chunkier and more readable

// 14px wide × 20px tall sprite grid
// Legend: . = transparent, H = hair (dark curly), h = hair highlight,
//         S = skin, E = eye, W = eye white, P = pupil, B = brow,
//         N = nose, M = mouth/smile, R = rosy cheek,
//         C = collar, T = tie/button, F = shirt body, D = sleeve,
//         L = pants, X = shoe, A = arm/hand (skin)

const SPRITE_IDLE = [
  "....HHHHHH....",
  "...HHhHhHHH...",
  "..HHHhHHhHHH..",
  "..HHHHHHHHH...",
  "..SSSSSSSSS...",
  "..SBWPSWPSB...",
  "..SSSSNSSSS...",
  "..RSSSMMSSR...",
  "...SSSSSSS....",
  "....CCTCC.....",
  "...FFFFFF.....",
  "..DFFFFFFD....",
  "..DFFFFFFD....",
  "..AFFFFFFA....",
  "...FFFFFF.....",
  "...LLLLLL.....",
  "...LL..LL.....",
  "...LL..LL.....",
  "...XX..XX.....",
];

const SPRITE_IDLE_BLINK = [
  "....HHHHHH....",
  "...HHhHhHHH...",
  "..HHHhHHhHHH..",
  "..HHHHHHHHH...",
  "..SSSSSSSSS...",
  "..SSEESSEESB..",
  "..SSSSNSSSS...",
  "..RSSSMMSSR...",
  "...SSSSSSS....",
  "....CCTCC.....",
  "...FFFFFF.....",
  "..DFFFFFFD....",
  "..DFFFFFFD....",
  "..AFFFFFFA....",
  "...FFFFFF.....",
  "...LLLLLL.....",
  "...LL..LL.....",
  "...LL..LL.....",
  "...XX..XX.....",
];

const SPRITE_NOTICED = [
  "....HHHHHH....",
  "...HHhHhHHH...",
  "..HHHhHHhHHH..",
  "..HHHHHHHHH...",
  "..SBBSSSBBSS..",
  "..SWWPSWWPS...",
  "..SWWPSWWPS...",
  "..SSSSNSSSS...",
  "..RSSSOSSSSR..",
  "...SSSSSSS....",
  "....CCTCC.....",
  "..AFFFFFFA....",
  "..AFFFFFFA....",
  "..AFFFFFFA....",
  "...FFFFFF.....",
  "...LLLLLL.....",
  "...LL..LL.....",
  "...LL..LL.....",
  "...XX..XX.....",
];

const SPRITE_WALK_A = [
  "....HHHHHH....",
  "...HHhHhHHH...",
  "..HHHhHHhHHH..",
  "..HHHHHHHHH...",
  "..SSSSSSSSS...",
  "..SBWPSWPSB...",
  "..SSSSNSSSS...",
  "..RSSSMMSSR...",
  "...SSSSSSS....",
  "....CCTCC.....",
  "..DFFFFFFD....",
  "..AFFFFFFA....",
  "...FFFFFF.....",
  "...FFFFFF.....",
  "...LLLLLL.....",
  "..LL....LL....",
  ".LL......LL...",
  ".XX......XX...",
  "..............",
];

const SPRITE_WALK_B = [
  "....HHHHHH....",
  "...HHhHhHHH...",
  "..HHHhHHhHHH..",
  "..HHHHHHHHH...",
  "..SSSSSSSSS...",
  "..SBWPSWPSB...",
  "..SSSSNSSSS...",
  "..RSSSMMSSR...",
  "...SSSSSSS....",
  "....CCTCC.....",
  "..DFFFFFFD....",
  "..AFFFFFFA....",
  "...FFFFFF.....",
  "...FFFFFF.....",
  "...LLLLLL.....",
  "...LLLLLL.....",
  "....LLLL......",
  "....XXXX......",
  "..............",
];

const COLORS: Record<string, string> = {
  H: "#1F140A",   // dark curly hair
  h: "#3D2815",   // hair curl highlights
  S: "#E8C49A",   // skin
  B: "#5C4433",   // brow
  W: "#FFFFFF",   // eye whites
  P: "#1A1A2E",   // pupils
  E: "#1A1A2E",   // closed eye (blink)
  N: "#D4A87A",   // nose shadow
  M: "#D46A5A",   // smile
  O: "#8B3A3A",   // surprised mouth
  R: "#E8A090",   // rosy cheeks
  C: "#F0F0F0",   // collar
  T: "#4A6A9A",   // tie/button accent
  F: "#4A7ABF",   // shirt (rich blue)
  D: "#3D6AA8",   // sleeve (slightly darker)
  A: "#E8C49A",   // hands (skin)
  L: "#2A2A3A",   // dark pants
  X: "#1A1A1A",   // shoes
};

function PixelSprite({ sprite }: { sprite: string[] }) {
  const width = sprite[0].length;
  const height = sprite.length;

  return (
    <svg
      width={width * PX}
      height={height * PX}
      viewBox={`0 0 ${width * PX} ${height * PX}`}
      style={{ imageRendering: "pixelated" }}
    >
      {sprite.map((row, y) =>
        row.split("").map((ch, x) => {
          if (ch === ".") return null;
          const color = COLORS[ch];
          if (!color) return null;
          return (
            <rect
              key={`${x}-${y}`}
              x={x * PX}
              y={y * PX}
              width={PX}
              height={PX}
              fill={color}
            />
          );
        })
      )}
    </svg>
  );
}

export default function GhostVisitor() {
  const [phase, setPhase] = useState<Phase>("hidden");
  const [walkFrame, setWalkFrame] = useState(0);
  const [blink, setBlink] = useState(false);

  // Walk animation frame toggle
  useEffect(() => {
    if (phase === "entering" || phase === "fleeing") {
      const interval = setInterval(() => setWalkFrame((f) => (f + 1) % 2), 200);
      return () => clearInterval(interval);
    }
  }, [phase]);

  // Blink during idle
  useEffect(() => {
    if (phase !== "idle") return;
    const doBlink = () => {
      setBlink(true);
      setTimeout(() => setBlink(false), 150);
    };
    const interval = setInterval(doBlink, 1200);
    return () => clearInterval(interval);
  }, [phase]);

  // Animation cycle
  useEffect(() => {
    let cancelled = false;
    const wait = (ms: number) => new Promise<void>((resolve) => {
      const t = setTimeout(resolve, ms);
      if (cancelled) clearTimeout(t);
    });

    const runCycle = async () => {
      while (!cancelled) {
        await wait(18000);
        if (cancelled) break;
        setPhase("entering");
        await wait(1800);
        if (cancelled) break;
        setPhase("idle");
        await wait(2500);
        if (cancelled) break;
        setPhase("noticed");
        await wait(700);
        if (cancelled) break;
        setPhase("fleeing");
        await wait(800);
        if (cancelled) break;
        setPhase("hidden");
      }
    };

    runCycle();
    return () => { cancelled = true; };
  }, []);

  if (phase === "hidden") return null;

  const translateX = (() => {
    switch (phase) {
      case "entering": return "translateX(50px)";
      case "idle": return "translateX(80px)";
      case "noticed": return "translateX(80px) translateY(-4px)";
      case "fleeing": return "translateX(240px)";
      default: return "translateX(-40px)";
    }
  })();

  const transition = (() => {
    switch (phase) {
      case "entering": return "transform 1.8s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.6s ease";
      case "idle": return "transform 1.5s ease";
      case "noticed": return "transform 0.12s cubic-bezier(0.68, -0.55, 0.27, 1.55)";
      case "fleeing": return "transform 0.7s cubic-bezier(0.55, 0.06, 0.68, 0.19), opacity 0.5s ease 0.3s";
      default: return "none";
    }
  })();

  const opacity = phase === "fleeing" ? 0 : 1;
  const scaleX = phase === "fleeing" ? -1 : 1;

  const sprite = (() => {
    if (phase === "noticed") return SPRITE_NOTICED;
    if (phase === "entering" || phase === "fleeing") {
      return walkFrame === 0 ? SPRITE_WALK_A : SPRITE_WALK_B;
    }
    return blink ? SPRITE_IDLE_BLINK : SPRITE_IDLE;
  })();

  return (
    <div
      style={{
        position: "absolute",
        bottom: 4,
        left: -40,
        pointerEvents: "none",
        transform: `${translateX} scaleX(${scaleX})`,
        transition,
        opacity,
        zIndex: 2,
      }}
    >
      <PixelSprite sprite={sprite} />
    </div>
  );
}
