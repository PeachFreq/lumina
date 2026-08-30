import { useState, useEffect, useCallback } from "react";
import "./styles/globals.css";
import "./styles/presets.css";
import Masthead from "./components/Masthead";
import ContourHero from "./components/ContourHero";
import UpdateRuleStrip from "./components/UpdateRuleStrip";
import MinimaGrid, { type MinimaData } from "./components/MinimaGrid";
import DeviceRack from "./components/DeviceRack";
import CustomPanel from "./components/CustomPanel";
import ScheduleSheet from "./components/ScheduleSheet";
import {
  activatePreset,
  togglePower,
  setCustom,
  getState,
  setDevicePower,
  soloDevice,
  MOCK_DEVICES,
  DEFAULT_ANCHORS,
  DEFAULT_WAKE,
  type BulbState,
  type DeviceInfo,
  type EngineState,
  type Anchor,
} from "./api";

/* ─── Minima definitions (named wells in parameter space, mirrored for instant UI) ─── */

const MINIMA: MinimaData[] = [
  { id: "morning", name: "MORNING", desc: "warm white", accent: "#F5C882", hue: 40, sat: 0, bri: 70, kelvin: 3000 },
  { id: "reading", name: "READING", desc: "neutral white", accent: "#B8CCE4", hue: 220, sat: 0, bri: 90, kelvin: 4500 },
  { id: "relax", name: "RELAX", desc: "warm amber", accent: "#E8A64C", hue: 35, sat: 60, bri: 35, kelvin: 2500 },
  { id: "honey", name: "HONEY", desc: "amber-gold · reading in bed", accent: "#D4A034", hue: 42, sat: 80, bri: 25, kelvin: 2200 },
  { id: "sleep", name: "SLEEP", desc: "red-orange · near dark", accent: "#C43214", hue: 15, sat: 100, bri: 5, kelvin: 2500 },
  { id: "cinema", name: "CINEMA", desc: "ember glow", accent: "#C47A12", hue: 30, sat: 70, bri: 2, kelvin: 2700 },
  { id: "velvet", name: "VELVET", desc: "fuchsia · mood", accent: "#E5006A", hue: 330, sat: 100, bri: 32, kelvin: 3500, featured: true },
];

export default function App() {
  const [activePresetId, setActivePresetId] = useState("relax");
  const [isOn, setIsOn] = useState(true);
  const [isCustom, setIsCustom] = useState(false);
  const [showCustomPanel, setShowCustomPanel] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [customValues, setCustomValues] = useState({ hue: 280, sat: 80, bri: 50, kelvin: 3500 });
  const [engine, setEngine] = useState<EngineState | null>(null);
  const [devices, setDevices] = useState<DeviceInfo[]>(MOCK_DEVICES);

  /* ─── Sync from backend (mock defaults stand when unreachable) ─── */

  const refresh = useCallback(() => {
    getState()
      .then((s: BulbState) => {
        setIsOn(s.power);
        if (s.active_preset) setActivePresetId(s.active_preset);
        if (s.mode === "custom" && s.custom) {
          setIsCustom(true);
          setCustomValues(s.custom);
        }
        if (s.engine) setEngine(s.engine);
        if (s.devices && s.devices.length) setDevices(s.devices);
      })
      .catch(() => {
        /* Backend unreachable — mock/default state stands */
      });
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  /* ─── Derived status ─── */

  const activeMinimum = MINIMA.find((m) => m.id === activePresetId);
  const statusLabel = !isOn ? "OFF" : isCustom ? "CUSTOM" : activePresetId.toUpperCase();
  const statusBri = isCustom ? customValues.bri : activeMinimum?.bri ?? 0;
  const statusKelvin = isCustom ? customValues.kelvin : activeMinimum?.kelvin ?? 2500;

  /* ─── Handlers (optimistic, fire-and-forget) ─── */

  const handlePreset = useCallback((id: string) => {
    setActivePresetId(id);
    setIsCustom(false);
    setIsOn(true);
    activatePreset(id).catch(console.error);
  }, []);

  const handleNodeTap = useCallback(
    (anchor: Anchor, _index: number) => {
      if (anchor.preset) {
        handlePreset(anchor.preset);
      } else if (anchor.bri != null && anchor.kelvin != null) {
        setIsCustom(true);
        setIsOn(true);
        const vals = { hue: 30, sat: 0, bri: anchor.bri, kelvin: anchor.kelvin };
        setCustomValues(vals);
        setCustom(vals).catch(console.error);
      }
    },
    [handlePreset]
  );

  const handleOff = useCallback(() => {
    setIsOn((prev) => !prev);
    togglePower().catch(console.error);
  }, []);

  const handleApplyCustom = useCallback(() => {
    setIsCustom(true);
    setIsOn(true);
    setShowCustomPanel(false);
    setCustom(customValues).catch(console.error);
  }, [customValues]);

  const handleDevicePower = useCallback((id: string, on: boolean) => {
    setDevices((prev) => prev.map((d) => (d.id === id ? { ...d, enabled: on } : d)));
    setDevicePower(id, on).catch(console.error);
  }, []);

  const handleSolo = useCallback((id: string) => {
    setDevices((prev) =>
      prev.map((d) => ({ ...d, solo: d.id === id }))
    );
    soloDevice(id).catch(console.error);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--bg)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ─── Grain overlay (printed-plate texture, kept from v1) ─── */}
      <svg
        style={{
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 100,
          opacity: 0.04,
        }}
      >
        <filter id="lumina-noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#lumina-noise)" />
      </svg>

      {/* ─── Page border frame — 1px --line inset, like a printed plate ─── */}
      <div
        style={{
          position: "fixed",
          inset: 6,
          border: "1px solid var(--line)",
          pointerEvents: "none",
          zIndex: 99,
        }}
      />

      {/* ─── Scrolling content column ─── */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          flex: 1,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            padding: "0 20px",
            maxWidth: 430,
            margin: "0 auto",
            width: "100%",
            minHeight: "100%",
          }}
        >
          <Masthead isOn={isOn} modeLabel={statusLabel} bri={statusBri} kelvin={statusKelvin} />

          <ContourHero
            anchors={DEFAULT_ANCHORS}
            onNodeTap={handleNodeTap}
            wakeCurrent={engine?.wake?.wake_current ?? DEFAULT_WAKE.wake_current}
          />

          <UpdateRuleStrip engine={engine} />

          <MinimaGrid
            minima={MINIMA}
            activeId={activePresetId}
            isOn={isOn}
            isCustom={isCustom}
            onSelect={handlePreset}
          />

          <DeviceRack devices={devices} onTogglePower={handleDevicePower} onSolo={handleSolo} />

          {/* ─── Footer controls ─── */}

          <div style={{ animation: "fadeIn 0.6s ease both 0.2s", paddingBottom: 8 }}>
            <button
              onClick={handleOff}
              style={{
                width: "100%",
                padding: "14px 0",
                background: !isOn ? "rgba(255,77,28,0.08)" : "transparent",
                border: `1px solid ${!isOn ? "var(--ember)" : "var(--line)"}`,
                borderRadius: 6,
                color: !isOn ? "var(--ember)" : "var(--text-muted)",
                fontFamily: "'Syne', sans-serif",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.18em",
                cursor: "pointer",
                transition: "all 0.3s ease",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              {isOn ? "OFF" : "TAP TO WAKE"}
            </button>
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              animation: "fadeIn 0.6s ease both 0.3s",
              paddingBottom: 34,
            }}
          >
            <button
              onClick={() => setShowCustomPanel(true)}
              style={{
                flex: 1,
                padding: "12px 0",
                background: "transparent",
                border: "none",
                color: "var(--text-dim)",
                fontFamily: "'DM Mono', monospace",
                fontSize: 11,
                letterSpacing: "0.08em",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>↑</span>
              CUSTOM
            </button>
            <button
              onClick={() => setShowSchedule(true)}
              style={{
                flex: 1,
                padding: "12px 0",
                background: "transparent",
                border: "1px solid var(--line)",
                borderRadius: 6,
                color: "var(--blueprint)",
                fontFamily: "'DM Mono', monospace",
                fontSize: 11,
                letterSpacing: "0.14em",
                cursor: "pointer",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              THE DESCENT
            </button>
          </div>
        </div>
      </div>

      {/* ─── Bottom sheets ─── */}
      <CustomPanel
        isOpen={showCustomPanel}
        values={customValues}
        onChange={setCustomValues}
        onApply={handleApplyCustom}
        onClose={() => setShowCustomPanel(false)}
        onLexApplied={() => {
          setShowCustomPanel(false);
          refresh();
        }}
      />
      <ScheduleSheet isOpen={showSchedule} onClose={() => setShowSchedule(false)} />
    </div>
  );
}
