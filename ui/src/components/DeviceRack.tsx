import { useRef } from "react";
import type { DeviceInfo } from "../api";

/* ─── DeviceRack — three slim device rows; the rack is for divergence (spec §2.5) ─── */

interface Props {
  devices: DeviceInfo[];
  onTogglePower: (id: string, on: boolean) => void;
  onSolo: (id: string) => void;
}

function DeviceRow({
  device,
  onTogglePower,
  onSolo,
}: {
  device: DeviceInfo;
  onTogglePower: (id: string, on: boolean) => void;
  onSolo: (id: string) => void;
}) {
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);

  const startHold = () => {
    held.current = false;
    holdTimer.current = setTimeout(() => {
      held.current = true;
      onSolo(device.id);
      if (navigator.vibrate) navigator.vibrate(20);
    }, 600);
  };
  const endHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  return (
    <div
      onMouseDown={startHold}
      onMouseUp={endHold}
      onMouseLeave={endHold}
      onTouchStart={startHold}
      onTouchEnd={endHold}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 12px",
        border: "1px solid var(--line)",
        borderRadius: 5,
        background: "var(--bg-raise)",
        opacity: device.online ? 1 : 0.45,
        transition: "opacity 0.4s ease",
      }}
    >
      {/* online dot */}
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: device.online ? "var(--ember)" : "var(--text-dim)",
          boxShadow: device.online ? "0 0 6px rgba(255,77,28,0.6)" : "none",
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 10,
          letterSpacing: "0.14em",
          color: device.online ? "var(--text-muted)" : "var(--text-dim)",
          flex: 1,
        }}
      >
        {device.name}
      </span>
      {device.solo && (
        <span
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 8,
            letterSpacing: "0.14em",
            color: "var(--ember)",
            border: "1px solid var(--ember)",
            borderRadius: 3,
            padding: "1px 5px",
          }}
        >
          SOLO
        </span>
      )}
      <span
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 8,
          letterSpacing: "0.1em",
          color: "var(--text-dim)",
        }}
      >
        {device.online ? (device.enabled ? "ON" : "OFF") : "OFFLINE"}
      </span>
      {/* power toggle */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (held.current) return;
          onTogglePower(device.id, !device.enabled);
        }}
        disabled={!device.online}
        style={{
          width: 30,
          height: 17,
          borderRadius: 9,
          border: `1px solid ${device.enabled && device.online ? "var(--ember)" : "var(--line)"}`,
          background: "transparent",
          position: "relative",
          cursor: device.online ? "pointer" : "default",
          padding: 0,
          WebkitTapHighlightColor: "transparent",
          flexShrink: 0,
        }}
        aria-label={`toggle ${device.name}`}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: device.enabled && device.online ? 15 : 2,
            width: 11,
            height: 11,
            borderRadius: "50%",
            background: device.enabled && device.online ? "var(--ember)" : "var(--text-dim)",
            transition: "left 0.2s ease, background 0.2s ease",
          }}
        />
      </button>
    </div>
  );
}

export default function DeviceRack({ devices, onTogglePower, onSolo }: Props) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "4px 0 12px",
        animation: "fadeIn 0.6s ease both 0.15s",
      }}
    >
      <div
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 8,
          letterSpacing: "0.28em",
          color: "var(--text-dim)",
          paddingBottom: 2,
        }}
      >
        DEVICE RACK · HOLD TO SOLO
      </div>
      {devices.map((d) => (
        <DeviceRow key={d.id} device={d} onTogglePower={onTogglePower} onSolo={onSolo} />
      ))}
    </div>
  );
}
